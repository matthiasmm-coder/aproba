import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarRecordatorioDocs } from "@/lib/notificaciones";

// RECORDATORIO AUTOMÁTICO AL CLIENTE — el enlace salió y el cliente no ha subido nada.
//
// Medido el 18/08/2026: de 130 expedientes con enlace enviado, solo 34 recibieron algo
// del cliente (26 %). La función de recordatorio ya existía —enviarRecordatorioDocs, la
// misma que el botón manual— pero se había usado 6 veces en toda la vida del producto.
// No faltaba la herramienta: faltaba que alguien se acordara de usarla.
//
// LA REGLA QUE DAN LOS DATOS. De 44 expedientes con documentos, 34 los subió solo el
// cliente y 10 solo el despacho. CERO mezclados. No es que el gestor rescate a un
// cliente que no responde: decide al abrir el expediente si manda el enlace o si ya
// tiene los papeles. Por eso, si el DESPACHO ha subido aunque sea un documento, este
// expediente trabaja en modo despacho y al cliente NO se le molesta jamás.
//
// ⚠️ Esto escribe a los clientes finales de nuestros clientes. Por defecto va en
// SIMULACIÓN: calcula, informa a Matthias por email y no manda nada. Se activa con
// RECORDATORIOS_ACTIVOS=1, y solo cuando él lo decida.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEST = process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com";
const ACTIVO = process.env.RECORDATORIOS_ACTIVOS === "1";

const ESPERA_DIAS = 3;      // margen antes de insistir: el cliente puede estar reuniendo papeles
const EDAD_MAX_DIAS = 45;   // un expediente de hace tres meses está muerto: resucitarlo incomoda
const REPETIR_DIAS = 7;     // nunca dos recordatorios en la misma semana
const MAX_POR_EXPEDIENTE = 2;
const MAX_POR_TANDA = 25;   // tope de seguridad: un fallo de lógica no manda 300 correos

const INTERNOS = [/vall[eè]s/i, /carmen/i, /ckna/i, /^gestoria m{1,2}$/i];
const dias = (d: string) => (Date.now() - new Date(d).getTime()) / 86400000;

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createSupabaseAdmin();

  const { data: wss } = await admin.from("Workspace").select("id, nombre");
  const nombreWs = new Map((wss ?? []).map((w) => [w.id as string, (w.nombre as string) ?? ""]));
  const interno = (id: string) => INTERNOS.some((r) => r.test(nombreWs.get(id) ?? ""));

  const { data: exps } = await admin.from("Expediente")
    .select("id, workspaceId, estado, createdAt").eq("estado", "DOCS_PENDIENTES");
  const vivos = (exps ?? []).filter((e) => !interno(e.workspaceId as string) && dias(e.createdAt as string) <= EDAD_MAX_DIAS);
  if (!vivos.length) return NextResponse.json({ ok: true, activo: ACTIVO, candidatos: 0 });

  // Un solo barrido del diario para los expedientes en juego.
  const ids = vivos.map((e) => e.id as string);
  type Estado = { cli: number; ges: number; enlace: string | null; recordatorios: string[] };
  const est = new Map<string, Estado>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: ev } = await admin.from("ExpedienteEvento")
      .select("expedienteId, descripcion, createdAt").in("expedienteId", ids.slice(i, i + 100));
    for (const x of (ev ?? []) as { expedienteId: string; descripcion: string | null; createdAt: string }[]) {
      const s = est.get(x.expedienteId) ?? { cli: 0, ges: 0, enlace: null, recordatorios: [] };
      const d = x.descripcion ?? "";
      if (/^El cliente subió/.test(d)) s.cli++;
      else if (/^El despacho subió/.test(d)) s.ges++;
      if (/nlace/.test(d) && (!s.enlace || x.createdAt < s.enlace)) s.enlace = x.createdAt;
      if (/recordat/i.test(d)) s.recordatorios.push(x.createdAt);
      est.set(x.expedienteId, s);
    }
  }

  const candidatos = vivos.filter((e) => {
    const s = est.get(e.id as string);
    if (!s?.enlace) return false;                                  // nunca se le mandó el enlace
    if (s.cli > 0) return false;                                   // ya respondió
    if (s.ges > 0) return false;                                   // modo DESPACHO: no molestar al cliente
    if (dias(s.enlace) < ESPERA_DIAS) return false;
    if (s.recordatorios.length >= MAX_POR_EXPEDIENTE) return false;
    const ultimo = s.recordatorios.sort().at(-1);
    if (ultimo && dias(ultimo) < REPETIR_DIAS) return false;
    return true;
  }).slice(0, MAX_POR_TANDA);

  const hechos: { ws: string; id: string; enviado: boolean; motivo?: string }[] = [];
  for (const e of candidatos) {
    const ws = nombreWs.get(e.workspaceId as string) ?? "?";
    if (!ACTIVO) { hechos.push({ ws, id: e.id as string, enviado: false, motivo: "simulacion" }); continue; }
    try {
      const r = await enviarRecordatorioDocs(admin, { expedienteId: e.id as string });
      hechos.push({ ws, id: e.id as string, enviado: r.enviado, motivo: r.motivo });
    } catch {
      hechos.push({ ws, id: e.id as string, enviado: false, motivo: "error" });
    }
  }

  if (hechos.length && process.env.RESEND_API_KEY) {
    const porWs: Record<string, number> = {};
    for (const h of hechos) porWs[h.ws] = (porWs[h.ws] ?? 0) + 1;
    const lineas = Object.entries(porWs).map(([k, v]) => `  · ${k}: ${v}`).join("\n");
    const enviados = hechos.filter((h) => h.enviado).length;
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: DEST,
      subject: ACTIVO
        ? `📨 Recordatorios enviados a clientes: ${enviados}`
        : `🧪 SIMULACIÓN — ${hechos.length} clientes recibirían un recordatorio`,
      text: (ACTIVO
        ? `Se han enviado ${enviados} recordatorios de ${hechos.length} candidatos.\n\n`
        : `MODO SIMULACIÓN: no se ha mandado nada. Estos ${hechos.length} expedientes tienen el enlace enviado hace más de ${ESPERA_DIAS} días, ninguna subida del cliente, ninguna del despacho, y menos de ${EDAD_MAX_DIAS} días de antigüedad.\n\nPara activarlo de verdad: RECORDATORIOS_ACTIVOS=1 en Vercel.\n\n`)
        + `Por despacho:\n${lineas}\n\nNunca se avisa a un cliente cuyo expediente lleva documentos subidos por el despacho: ese expediente trabaja en modo despacho.`,
    });
  }

  return NextResponse.json({
    ok: true, activo: ACTIVO, candidatos: candidatos.length,
    enviados: hechos.filter((h) => h.enviado).length,
    detalle: hechos.map((h) => ({ despacho: h.ws, enviado: h.enviado, motivo: h.motivo })),
  });
}
