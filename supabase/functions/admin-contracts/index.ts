import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://lariosrental.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const env = (name: string) => (Deno.env.get(name) || "").trim();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });

async function count(service: any, table: string, column: string, id: string) {
  const { count, error } = await service.from(table).select("id", { count: "exact", head: true }).eq(column, id);
  if (error) throw error;
  return count || 0;
}

async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerData, error: callerError } = await service.auth.getUser(jwt);
  const caller = callerData.user;
  if (callerError || !caller) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  if (caller.app_metadata?.role !== "admin") return json({ error: "ADMIN_REQUIRED", message: "Solo un administrador puede eliminar reservas canceladas." }, 403);

  const body = await req.json().catch(() => ({}));
  if (String(body.action || "") !== "delete_cancelled") return json({ error: "UNKNOWN_ACTION" }, 400);
  const contractId = String(body.contract_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(contractId)) return json({ error: "INVALID_CONTRACT" }, 400);

  const { data: contract, error: contractError } = await service.from("contracts")
    .select("id,contract_number,customer_id,main_driver_id,status,pdf_path,customer_signature_path,renthub_contract_id,renthub_sync_status")
    .eq("id", contractId).maybeSingle();
  if (contractError) throw contractError;
  if (!contract) return json({ error: "CONTRACT_NOT_FOUND", message: "La reserva ya no existe." }, 404);
  if (String(contract.renthub_contract_id || "").trim() || ["sent_pending_verification", "verified"].includes(contract.renthub_sync_status || "")) {
    return json({ error: "RENTHUB_COPY_EXISTS", message: "Esta reserva ya tiene datos enviados a Renthub. Utiliza el borrado verificado de Renthub." }, 409);
  }

  const { count: paymentCount, error: paymentError } = await service.from("stripe_payments").select("id", { count: "exact", head: true }).eq("contract_id", contractId);
  if (paymentError) throw paymentError;
  if ((paymentCount || 0) > 0) return json({ error: "PAYMENT_EXISTS", message: "La reserva tiene un intento o pago de Stripe. Debe revisarse antes de eliminarla." }, 409);

  const [{ data: documents }, { data: files }, { data: photos }, { data: linkedDrivers }] = await Promise.all([
    service.from("documents").select("file_path").eq("contract_id", contractId),
    service.from("contract_files").select("file_path").eq("contract_id", contractId),
    service.from("damage_photos").select("file_path").eq("contract_id", contractId),
    service.from("contract_drivers").select("driver_id").eq("contract_id", contractId),
  ]);
  const driverIds = [...new Set([contract.main_driver_id, ...(linkedDrivers || []).map((row: any) => row.driver_id)].filter(Boolean))] as string[];

  const { error: deleteError } = await service.from("contracts").delete().eq("id", contractId);
  if (deleteError) return json({ error: "DELETE_FAILED", message: deleteError.message }, 500);

  for (const driverId of driverIds) {
    if (await count(service, "contracts", "main_driver_id", driverId)) continue;
    if (await count(service, "contract_drivers", "driver_id", driverId)) continue;
    await service.from("documents").delete().eq("driver_id", driverId).is("contract_id", null);
    await service.from("drivers").delete().eq("id", driverId);
  }
  if (contract.customer_id && !(await count(service, "contracts", "customer_id", contract.customer_id)) && !(await count(service, "drivers", "customer_id", contract.customer_id))) {
    await service.from("documents").delete().eq("customer_id", contract.customer_id).is("contract_id", null);
    await service.from("customers").delete().eq("id", contract.customer_id);
  }

  const contractPaths = [...new Set([contract.pdf_path, contract.customer_signature_path, ...(files || []).map((row: any) => row.file_path)].filter(Boolean))] as string[];
  const documentPaths = [...new Set([...(documents || []).map((row: any) => row.file_path), ...(photos || []).map((row: any) => row.file_path)].filter(Boolean))] as string[];
  const storageWarnings: string[] = [];
  if (contractPaths.length) {
    const { error } = await service.storage.from("contracts").remove(contractPaths);
    if (error) storageWarnings.push(error.message);
  }
  if (documentPaths.length) {
    const { error } = await service.storage.from("documents").remove(documentPaths);
    if (error) storageWarnings.push(error.message);
  }
  await service.from("renthub_sync_log").insert({
    contract_id: null,
    operation: "delete_cancelled_local_reservation",
    direction: "local",
    request_data: {},
    response_data: { contract_number: `LR-${String(contract.contract_number).padStart(6, "0")}`, deleted_by: caller.id, storage_warnings: storageWarnings.length },
    success: true,
  });
  return json({ deleted: true, contract_number: `LR-${String(contract.contract_number).padStart(6, "0")}`, storage_warnings: storageWarnings });
}

Deno.serve((req) => handler(req).catch((error) => json({ error: "ADMIN_CONTRACTS_ERROR", message: error instanceof Error ? error.message : String(error) }, 500)));
