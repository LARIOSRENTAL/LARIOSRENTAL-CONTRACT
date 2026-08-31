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
const allowedRoles = new Set(["admin", "employee", "none"]);
const appUrl = "https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/";
const safeUser = (user: any) => ({
  id: user.id,
  email: user.email || "",
  role: ["admin", "employee"].includes(user.app_metadata?.role) ? user.app_metadata.role : "none",
  created_at: user.created_at || null,
  last_sign_in_at: user.last_sign_in_at || null,
});

async function allUsers(service: any) {
  const users: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
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
  if (caller.app_metadata?.role !== "admin") return json({ error: "ADMIN_REQUIRED", message: "Solo una cuenta administradora puede gestionar permisos." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  if (action === "list") {
    const users = await allUsers(service);
    return json({ users: users.map(safeUser).sort((a, b) => a.email.localeCompare(b.email, "es")), current_user_id: caller.id });
  }

  if (action === "invite_user") {
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "employee");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.has(role) || role === "none") {
      return json({ error: "INVALID_INVITATION", message: "Indica un email válido y el permiso Empleado o Administrador." }, 400);
    }
    const { data: invitedData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}?auth_action=invite` });
    const invited = invitedData?.user;
    if (inviteError || !invited) return json({ error: "INVITATION_FAILED", message: inviteError?.message || "No se pudo enviar la invitación." }, 409);
    const appMetadata = { ...(invited.app_metadata || {}), role };
    const { data: updatedData, error: updateError } = await service.auth.admin.updateUserById(invited.id, { app_metadata: appMetadata });
    if (updateError || !updatedData?.user) {
      await service.auth.admin.deleteUser(invited.id).catch(() => undefined);
      return json({ error: "INVITATION_ROLE_FAILED", message: updateError?.message || "No se pudo asignar el permiso a la invitación." }, 500);
    }
    return json({ user: safeUser(updatedData.user), message: `Invitación enviada a ${email}. La persona creará su propia contraseña.` });
  }

  if (action === "reset_password") {
    const userId = String(body.user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "INVALID_USER" }, 400);
    const { data: targetData, error: targetError } = await service.auth.admin.getUserById(userId);
    const target = targetData?.user;
    if (targetError || !target?.email) return json({ error: "USER_NOT_FOUND" }, 404);
    const publicClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: resetError } = await publicClient.auth.resetPasswordForEmail(target.email, { redirectTo: `${appUrl}?auth_action=recovery` });
    if (resetError) return json({ error: "RESET_FAILED", message: resetError.message }, 500);
    return json({ message: `Enlace de recuperación enviado a ${target.email}.` });
  }

  if (action === "delete_user") {
    const userId = String(body.user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "INVALID_USER" }, 400);
    if (userId === caller.id) return json({ error: "CANNOT_DELETE_SELF", message: "No puedes eliminar tu propia cuenta mientras la estás utilizando." }, 409);
    const { data: targetData, error: targetError } = await service.auth.admin.getUserById(userId);
    const target = targetData?.user;
    if (targetError || !target) return json({ error: "USER_NOT_FOUND" }, 404);
    if (target.app_metadata?.role === "admin") {
      const users = await allUsers(service);
      if (users.filter((user) => user.app_metadata?.role === "admin").length <= 1) {
        return json({ error: "LAST_ADMIN", message: "No se puede eliminar la última cuenta administradora." }, 409);
      }
    }
    const email = target.email || "el usuario";
    const { error: deleteError } = await service.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: "USER_DELETE_FAILED", message: deleteError.message }, 500);
    return json({ deleted: true, message: `Cuenta ${email} eliminada.` });
  }

  if (action !== "set_role") return json({ error: "UNKNOWN_ACTION" }, 400);

  const userId = String(body.user_id || "");
  const role = String(body.role || "none");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !allowedRoles.has(role)) return json({ error: "INVALID_ROLE_CHANGE" }, 400);
  if (userId === caller.id) return json({ error: "CANNOT_CHANGE_OWN_ROLE", message: "Por seguridad no puedes cambiar tu propio permiso administrativo." }, 409);

  const { data: targetData, error: targetError } = await service.auth.admin.getUserById(userId);
  const target = targetData?.user;
  if (targetError || !target) return json({ error: "USER_NOT_FOUND" }, 404);
  const currentRole = ["admin", "employee"].includes(target.app_metadata?.role) ? target.app_metadata.role : "none";
  if (currentRole === "admin" && role !== "admin") {
    const users = await allUsers(service);
    const admins = users.filter((user) => user.app_metadata?.role === "admin");
    if (admins.length <= 1) return json({ error: "LAST_ADMIN", message: "Debe quedar al menos una cuenta administradora." }, 409);
  }

  const appMetadata = { ...(target.app_metadata || {}) };
  if (role === "none") delete appMetadata.role;
  else appMetadata.role = role;
  const { data: updatedData, error: updateError } = await service.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (updateError || !updatedData?.user) return json({ error: "ROLE_UPDATE_FAILED", message: updateError?.message || "No se pudo cambiar el permiso." }, 500);
  return json({ user: safeUser(updatedData.user), message: "Permiso actualizado. Se aplicará al renovar la sesión de esa cuenta." });
}

Deno.serve((req) => handler(req).catch((error) => json({ error: "ADMIN_USERS_ERROR", message: error instanceof Error ? error.message : String(error) }, 500)));
