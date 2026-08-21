import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// VEILLE del generador oficial de la TASA 790-012 (Sede de la Policía Nacional).
//
// Por qué existe (21/08/2026): el generador oficial lleva caído desde ~el 16/08
// —ERR_CONNECTION_CLOSED y 504 en /Tasa790_012/ImpresoRellenar, comprobado también a
// mano en un navegador—, así que ningún despacho de España puede sacar tasas, con
// Aproba o sin ella. Se prometió a Gesadmbcn avisarla «en cuanto vuelva»: esto es lo
// que cumple esa promesa sin tener que acordarse de mirarlo cada mañana.
//
// AVISA SOLO EN LOS CAMBIOS DE ESTADO (cae / vuelve). Un correo diario diciendo «sigue
// caído» se ignora a la tercera vez, y entonces el aviso del retorno se pierde con él.
//
// El estado anterior se guarda en Storage (documentos/_veille/tasa790.json): sin tabla
// nueva, sin migración que ejecutar. Es un fichero de sistema, con prefijo propio.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEST = process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com";
const URL_TASA = "https://sede.policia.gob.es/Tasa790_012/ImpresoRellenar";
const RUTA_ESTADO = "_veille/tasa790.json";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Estado = { ok: boolean; desde: string; ultimaComprobacion: string; detalle: string };

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Sano = responde Y trae el formulario. Un 200 con una página de error no vale:
// lo que importa es que el gestor pueda generar la tasa de verdad.
async function comprobar(): Promise<{ ok: boolean; detalle: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(URL_TASA, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, detalle: `HTTP ${res.status}` };
    const html = await res.text();
    const tieneSesion = (res.headers.getSetCookie?.() ?? []).some((c) => /JSESSIONID/.test(c));
    const tieneForm = /ImpresoRellenar|codSeguridad|jcaptcha/i.test(html);
    if (!tieneSesion || !tieneForm) return { ok: false, detalle: `HTTP 200 pero sin ${!tieneSesion ? "sesión" : "formulario"}` };
    return { ok: true, detalle: `HTTP 200, formulario y sesión correctos (${html.length} bytes)` };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, detalle: /abort/i.test(m) ? "sin respuesta (timeout 20 s)" : m.slice(0, 120) };
  }
}

export async function GET(req: Request) {
  if (!autorizado(req)) return new NextResponse("Unauthorized", { status: 401 });
  const admin = createSupabaseAdmin();
  const ahora = new Date().toISOString();
  const actual = await comprobar();

  let previo: Estado | null = null;
  try {
    const { data } = await admin.storage.from("documentos").download(RUTA_ESTADO);
    if (data) previo = JSON.parse(await data.text()) as Estado;
  } catch { /* primera ejecución: no hay estado anterior */ }

  const cambio = !previo || previo.ok !== actual.ok;
  const estado: Estado = {
    ok: actual.ok,
    desde: cambio ? ahora : (previo?.desde ?? ahora),
    ultimaComprobacion: ahora,
    detalle: actual.detalle,
  };
  await admin.storage.from("documentos").upload(RUTA_ESTADO, new Blob([JSON.stringify(estado, null, 1)], { type: "application/json" }), { upsert: true });

  let avisado = false;
  if (cambio && previo && process.env.RESEND_API_KEY) {
    const horas = Math.round((Date.parse(ahora) - Date.parse(previo.desde)) / 36e5);
    const cuerpo = actual.ok
      ? `El generador oficial de la tasa 790-012 VUELVE A FUNCIONAR.\n\n`
        + `Estuvo caído unas ${horas} h (desde ${previo.desde.slice(0, 16).replace("T", " ")}).\n`
        + `Comprobación: ${actual.detalle}\n\n`
        + `Pendiente: avisar a Gesadmbcn (se le prometió) y a GESTORIA EXTRANJERIA VALENCIA, que genera tasas a menudo.`
      : `El generador oficial de la tasa 790-012 ha CAÍDO.\n\n`
        + `Motivo: ${actual.detalle}\n`
        + `Funcionaba hasta ${previo.ultimaComprobacion.slice(0, 16).replace("T", " ")}.\n\n`
        + `No es Aproba: la web oficial tampoco responde en un navegador. Los gestores ven un aviso claro y los datos del cliente listos para copiar.`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba Veille <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: DEST,
      subject: actual.ok ? "✅ La tasa 790-012 vuelve a funcionar" : "🔴 El generador de la tasa 790-012 ha caído",
      text: cuerpo,
    });
    avisado = !error;
  }

  return NextResponse.json({ ok: true, servicio: actual.ok ? "OPERATIVO" : "CAÍDO", detalle: actual.detalle, cambio, avisado, desde: estado.desde });
}
