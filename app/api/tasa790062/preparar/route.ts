import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { BASE_062, SEDE_062_INFO, UA_062, cuerpoAceptacion062, decodificarLatin1, esPaginaAceptacion062, parseFormulario062 } from "@/lib/tasa790062";

// Tasa 790-062 — paso 2: abrir el impreso en la Sede para la provincia y el reglamento
// elegidos. Igual que la 052 (sesión → impreso → captcha), con un paso más: la Sede antepone
// una NOTA (Cataluña → tasa de la Generalitat para las autorizaciones iniciales) que hay que
// aceptar con un POST antes de recibir el impreso con su Nº de justificante. Cada llamada
// consume un justificante nuevo: se llama al abrir el modal y al cambiar provincia/reglamento
// o refrescar el captcha, no en cada tecla.

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

  const noDisponible = (motivo: string) => NextResponse.json({ error: motivo, fallback: SEDE_062_INFO }, { status: 502 });
  const jar = new Map<string, string>();
  const urlImpreso = `${BASE_062}/prepareTasa?idTasa=062&idModelo=790&idProvincia=${idProvincia}&reglamento=${encodeURIComponent(reglamento)}`;
  const cab = (referer: string) => ({ "User-Agent": UA_062, Cookie: cookieHeader(jar), Referer: referer });

  // 1) Sesión (cookies del balanceador + JSESSIONID).
  try {
    const r0 = await fetch(`${BASE_062}/prepareProvincia?idModelo=790&idTasa=062`, { headers: { "User-Agent": UA_062 }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(r0, jar);
    if (!r0.ok) return noDisponible("La Sede de Administraciones Públicas no responde ahora mismo (no es Aproba). Abajo tienes el enlace oficial.");
  } catch {
    return noDisponible("La Sede de Administraciones Públicas está caída ahora mismo (no es Aproba: su web tampoco responde en el navegador).");
  }
  if (![...jar.keys()].some((k) => /JSESSIONID/i.test(k))) return noDisponible("La web oficial ha cambiado y no abre sesión para el rellenado automático. Usa el enlace oficial.");

  // 2) Impreso de la provincia + reglamento. La Sede contesta primero con la NOTA: se acepta.
  let html = "";
  try {
    const r1 = await fetch(urlImpreso, { headers: cab(`${BASE_062}/prepareProvincia?idModelo=790&idTasa=062`), redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(r1, jar);
    if (!r1.ok) return noDisponible("La Sede no ha devuelto el impreso de esa provincia. Prueba de nuevo en un momento.");
    html = decodificarLatin1(await r1.arrayBuffer());
    if (esPaginaAceptacion062(html)) {
      const r2 = await fetch(`${BASE_062}/prepareTasa`, {
        method: "POST", headers: { ...cab(urlImpreso), "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpoAceptacion062(idProvincia, reglamento), redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000),
      });
      cookiesDe(r2, jar);
      if (!r2.ok) return noDisponible("La Sede no ha aceptado la nota previa del impreso. Prueba de nuevo en un momento.");
      html = decodificarLatin1(await r2.arrayBuffer());
    }
  } catch {
    return noDisponible("La Sede de Administraciones Públicas no responde (no es Aproba). Inténtalo en un rato.");
  }
  const f = parseFormulario062(html);
  if (!f.justificante || !f.epigrafes.length) return noDisponible("La web oficial ha cambiado de formato y no se puede rellenar automáticamente. Usa el enlace oficial.");

  // 3) Captcha ligado a la sesión (se llama Captcha.jpg pero la Sede sirve un PNG).
  let captcha = "";
  try {
    const cap = await fetch(`${BASE_062}/Captcha.jpg`, { headers: cab(urlImpreso), cache: "no-store", signal: AbortSignal.timeout(20000) });
    cookiesDe(cap, jar);
    if (cap.ok) {
      const b = Buffer.from(await cap.arrayBuffer());
      const mime = b.subarray(1, 4).toString("latin1") === "PNG" ? "image/png" : "image/jpeg";
      captcha = `data:${mime};base64,${b.toString("base64")}`;
    }
  } catch { /* sin captcha → error abajo */ }
  if (!captcha) return noDisponible("No se pudo cargar el código de seguridad de la Sede. Inténtalo de nuevo.");

  return NextResponse.json({
    sid: cookieHeader(jar), idProvincia, reglamento: f.reglamento || reglamento,
    justificante: f.justificante, epigrafes: f.epigrafes, provinciasDom: f.provinciasDom, captcha,
  });
}
