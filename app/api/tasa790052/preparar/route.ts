import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { BASE_052, SEDE_052_INFO, UA_052, decodificarLatin1, parseFormulario052 } from "@/lib/tasa790052";

// Tasa 790-052 — paso 2: abrir el impreso en la Sede para la provincia y el reglamento
// elegidos. Devuelve la sesión (cookies), el Nº de justificante que asigna su servidor,
// las líneas de tasa (epígrafes con importe), los desplegables oficiales y el captcha.
// Cada llamada consume un justificante nuevo en la Sede: se llama al abrir el modal y al
// cambiar provincia/reglamento o refrescar el captcha, no en cada tecla.

const cookiesDe = (res: Response, previas: Map<string, string>) => {
  for (const c of res.headers.getSetCookie?.() ?? []) { const [par] = c.split(";"); const i = par.indexOf("="); if (i > 0) previas.set(par.slice(0, i).trim(), par.slice(i + 1)); }
  return previas;
};
const cookieHeader = (m: Map<string, string>) => [...m].map(([k, v]) => `${k}=${v}`).join("; ");

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { idProvincia?: string; reglamento?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const idProvincia = String(body.idProvincia ?? "").padStart(2, "0");
  const reglamento = String(body.reglamento ?? "RD1155/2024");
  if (!/^\d{2}$/.test(idProvincia) || !/^RD\d+\/\d{4}$/.test(reglamento)) return NextResponse.json({ error: "Provincia o reglamento inválidos." }, { status: 400 });

  const noDisponible = (motivo: string) => NextResponse.json({ error: motivo, fallback: SEDE_052_INFO }, { status: 502 });
  const jar = new Map<string, string>();
  const cab = () => ({ "User-Agent": UA_052, Cookie: cookieHeader(jar), Referer: `${BASE_052}/prepareProvincia?idModelo=790&idTasa=052` });

  // 1) Sesión (cookies del balanceador + JSESSIONID).
  try {
    const r0 = await fetch(`${BASE_052}/prepareProvincia?idModelo=790&idTasa=052`, { headers: { "User-Agent": UA_052 }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(r0, jar);
    if (!r0.ok) return noDisponible("La Sede de Administraciones Públicas no responde ahora mismo (no es Aproba). Abajo tienes el enlace oficial.");
  } catch {
    return noDisponible("La Sede de Administraciones Públicas está caída ahora mismo (no es Aproba: su web tampoco responde en el navegador).");
  }
  if (![...jar.keys()].some((k) => /JSESSIONID/i.test(k))) return noDisponible("La web oficial ha cambiado y no abre sesión para el rellenado automático. Usa el enlace oficial.");

  // 2) Impreso de la provincia + reglamento → justificante, epígrafes, desplegables.
  let html = "";
  try {
    const r1 = await fetch(`${BASE_052}/prepareTasa?idTasa=052&idModelo=790&idProvincia=${idProvincia}&reglamento=${encodeURIComponent(reglamento)}`, { headers: cab(), redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(r1, jar);
    if (!r1.ok) return noDisponible("La Sede no ha devuelto el impreso de esa provincia. Prueba de nuevo en un momento.");
    html = decodificarLatin1(await r1.arrayBuffer());
  } catch {
    return noDisponible("La Sede de Administraciones Públicas no responde (no es Aproba). Inténtalo en un rato.");
  }
  const f = parseFormulario052(html);
  if (!f.justificante || !f.epigrafes.length) return noDisponible("La web oficial ha cambiado de formato y no se puede rellenar automáticamente. Usa el enlace oficial.");

  // 3) Captcha ligado a la sesión.
  let captcha = "";
  try {
    const cap = await fetch(`${BASE_052}/Captcha.jpg`, { headers: cab(), cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(cap, jar);
    if (cap.ok) {
      const b = Buffer.from(await cap.arrayBuffer());
      // Se llama Captcha.jpg pero la Sede sirve un PNG (comprobado 08/09/2026): se mira la firma.
      const mime = b.subarray(1, 4).toString("latin1") === "PNG" ? "image/png" : "image/jpeg";
      captcha = `data:${mime};base64,${b.toString("base64")}`;
    }
  } catch { /* sin captcha → error abajo */ }
  if (!captcha) return noDisponible("No se pudo cargar el código de seguridad de la Sede. Inténtalo de nuevo.");

  return NextResponse.json({
    sid: cookieHeader(jar), idProvincia, reglamento: f.reglamento || reglamento,
    justificante: f.justificante, epigrafes: f.epigrafes, nacionalidades: f.nacionalidades, provinciasDom: f.provinciasDom, captcha,
  });
}
