import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://lariosrental.github.io",
  "http://localhost",
  "http://127.0.0.1",
  "capacitor://localhost",
  "ionic://localhost",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://lariosrental.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((item: any) => item?.type === "output_text" || item?.type === "text")
    .map((item: any) => item?.text || "")
    .join("\n");
}

function parseJson(value: string) {
  const text = String(value || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("VISION_INVALID_JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function clean(value: unknown, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isoDate(value: unknown) {
  const match = clean(value, 30).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += year > 35 ? 1900 : 2000;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalize(payload: any) {
  const eu = payload?.eu_fields && typeof payload.eu_fields === "object" ? payload.eu_fields : {};
  const fields = payload?.fields && typeof payload.fields === "object" ? payload.fields : {};
  const surname = clean(eu["1"], 70);
  const given = clean(eu["2"], 70).replace(/^(MR|MRS|MS|MISS|DR)\s+/i, "");
  const name = given && surname ? `${given} ${surname}` : clean(fields.name, 140);
  const result = {
    name,
    birth: isoDate(eu["3"]) || isoDate(fields.birth),
    issue: isoDate(eu["4a"]) || isoDate(fields.issue),
    expiry: isoDate(eu["4b"]) || isoDate(fields.expiry),
    license: clean(eu["5"], 30) || clean(fields.license, 30),
    address: clean(eu["8"], 160) || clean(fields.address, 160),
    country: clean(fields.country, 60).toUpperCase(),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Boolean(value)));
}

const prompt = `Lee visualmente el permiso de conducir de la fotografía para Larios Rental.
No uses el texto de la aplicación, navegador, mesa o fondo. No inventes datos. Devuelve únicamente JSON válido.

Para permisos europeos aplica estrictamente la numeración impresa:
- 1 = apellidos
- 2 = nombre o nombres
- 3 = fecha de nacimiento
- 4a = fecha de expedición
- 4b = fecha de caducidad
- 5 = número de permiso
- 8 = domicilio, solo cuando exista en el permiso

El nombre completo se forma como campo 2 + espacio + campo 1. Conserva apellidos compuestos. Quita tratamientos como MR/MRS del campo 2.
Detecta el país por la cabecera y el código del recuadro: E España, UK Reino Unido, D Alemania, F Francia, I Italia, A Austria, B Bélgica, P Portugal, PL Polonia, CZ República Checa, SK Eslovaquia, RO Rumanía. No confundas las categorías AM/A/B/C/D con el país.
En permisos no europeos usa las etiquetas equivalentes Last name, First name, Date of birth, Date of issue, Expires, License number y Address.

Responde con esta forma exacta:
{"eu_fields":{"1":"","2":"","3":"","4a":"","4b":"","5":"","8":""},"fields":{"name":"","birth":"","issue":"","expiry":"","license":"","address":"","country":""}}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(req, { error: "AUTH_REQUIRED", message: "Inicia sesión de nuevo." }, 401);

    const body = await req.json();
    const image = typeof body?.image === "string" ? body.image : "";
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) {
      return json(req, { error: "INVALID_IMAGE", message: "La imagen no tiene un formato compatible." }, 400);
    }
    if (image.length > 8_000_000) return json(req, { error: "IMAGE_TOO_LARGE", message: "La imagen supera el tamaño permitido." }, 413);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json(req, { error: "VISION_NOT_CONFIGURED", message: "Falta configurar el lector visual seguro." }, 503);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4.1",
        temperature: 0,
        max_output_tokens: 1200,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        }],
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("scan-driving-licence upstream", response.status, payload?.error?.type || "unknown");
      return json(req, { error: "VISION_UPSTREAM", message: "El lector visual no respondió correctamente." }, 502);
    }

    const fields = normalize(parseJson(outputText(payload)));
    const coreCount = ["name", "birth", "issue", "expiry", "license"].filter((key) => fields[key]).length;
    if (coreCount < 4) return json(req, { error: "INSUFFICIENT_READING", message: "No se han reconocido suficientes campos fiables.", fields }, 422);
    return json(req, { fields });
  } catch (error) {
    console.error("scan-driving-licence", error instanceof Error ? error.message : "unknown");
    return json(req, { error: "SCAN_FAILED", message: "No se pudo analizar el permiso." }, 500);
  }
});
