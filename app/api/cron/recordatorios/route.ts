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
// SOLO A QUIEN YA ES CLIENTE. Medido el 18/08 sobre los 66 expedientes de Juan: de
// los 47 que no subieron NADA, cero tenían hoja de encargo firmada, cero un pago, y
// solo el 28 % una factura emitida (frente al 79 % de los que sí subieron). No son
// clientes que abandonan: son consultas de precio a las que se les mandó el enlace —
// el portal también hace de escaparate. Reclamar documentos a alguien que solo pidió
// presupuesto es la mejor forma de perderlo, así que se exige una señal de compromiso.
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
const MAX_POR_TANDA = 25;
const MIN_DOCS_PARA_DEJAR_EN_PAZ = 4;
// El expediente ya no tiene un estado «documentos pendientes»: hay UNO de preparación
// (ver lib/progreso.ts) y el resto se deriva. Se filtran los dos mundos porque las filas
// legadas siguen ahí mientras el remap no haya corrido — un .eq() habría devuelto 0
// líneas TODOS los días sin error, matando las relances en silencio.
const ESTADOS_PREPARACION = ["EN_PREPARACION", "BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO"];  // por debajo, el expediente sigue parado   // tope de seguridad: un fallo de lógica no manda 300 correos

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
    .select("id, workspaceId, estado, createdAt, formulariosGenerados, tasaPath, modoTrabajo").in("estado", ESTADOS_PREPARACION);
  // modoTrabajo es columna nueva (supabase/modo-trabajo.sql): sin migrar, se reintenta
  // sin ella — el cron no puede caerse por una migración pendiente.
  const expsSeguro = exps ?? (await admin.from("Expediente")
    .select("id, workspaceId, estado, createdAt, formulariosGenerados, tasaPath").in("estado", ESTADOS_PREPARACION)).data;
  const vivos = (expsSeguro ?? []).filter((e) => !interno(e.workspaceId as string) && dias(e.createdAt as string) <= EDAD_MAX_DIAS);
  if (!vivos.length) return NextResponse.json({ ok: true, activo: ACTIVO, candidatos: 0 });

  // Un solo barrido del diario para los expedientes en juego.
  const ids = vivos.map((e) => e.id as string);

  // Compromiso vía facturación: un BORRADOR de factura no cuenta (lo prepara el gestor,
  // el cliente no lo ha visto); EMITIDA/PAGADA/VENCIDA sí — se le ha reclamado dinero.
  const conFactura = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: fs } = await admin.from("Factura")
      .select("expedienteId, estado").in("expedienteId", ids.slice(i, i + 100))
      .in("estado", ["EMITIDA", "PAGADA", "VENCIDA"]);
    for (const f of (fs ?? []) as { expedienteId: string | null }[]) if (f.expedienteId) conFactura.add(f.expedienteId);
  }

  type Estado = { cli: number; ges: number; enlace: string | null; recordatorios: string[]; firmo: boolean };
  const est = new Map<string, Estado>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: ev } = await admin.from("ExpedienteEvento")
      .select("expedienteId, descripcion, createdAt").in("expedienteId", ids.slice(i, i + 100));
    for (const x of (ev ?? []) as { expedienteId: string; descripcion: string | null; createdAt: string }[]) {
      const s = est.get(x.expedienteId) ?? { cli: 0, ges: 0, enlace: null, recordatorios: [], firmo: false };
      const d = x.descripcion ?? "";
      if (/^El cliente subió/.test(d)) {
        s.cli++;
        // Compromiso vía documento: firmar el encargo/mandato o justificar el pago son
        // gestos que un simple curioso no hace (0 de 47 en la medición).
        if (/hoja de encargo|mandato|poder|justificante de \d|justificante de pago/i.test(d)) s.firmo = true;
      }
      else if (/^El despacho subió/.test(d)) s.ges++;
      if (/nlace/.test(d) && (!s.enlace || x.createdAt < s.enlace)) s.enlace = x.createdAt;
      if (/recordat/i.test(d)) s.recordatorios.push(x.createdAt);
      est.set(x.expedienteId, s);
    }
  }

  const candidatos = vivos.filter((e) => {
    const s = est.get(e.id as string);
    if (!s?.enlace) return false;                                  // nunca se le mandó el enlace
    if (!conFactura.has(e.id as string) && !s.firmo) return false; // aún no es cliente: solo pidió precio
    // El despacho ya avanzó SIN el cliente (formularios curados o tasa generada): pedirle
    // documentos entonces es reclamar algo que ya no bloquea nada. Con el ciclo nuevo esto
    // importa más que antes: «en preparación» incluye expedientes muy adelantados.
    const f = (e as { formulariosGenerados?: string[] | null; tasaPath?: string | null; modoTrabajo?: string | null });
    // MODO MANUAL: el cliente no tiene enlace. Mandarle un recordatorio con un portal
    // que nadie le ha dado sería el peor correo posible del producto.
    if (f.modoTrabajo === "manual") return false;
    if (Array.isArray(f.formulariosGenerados) || f.tasaPath) return false;
    // Medido el 18/08: de 27 expedientes con respuesta, 14 se quedaron en UN solo
    // documento y 24 de 27 lo hicieron todo en una única sesión de <2 h. El cliente
    // no vuelve por su cuenta. Recordar solo a los que están a cero dejaba fuera
    // justo a los que empezaron y se quedaron a medias — que son la mayoría.
    if (s.cli >= MIN_DOCS_PARA_DEJAR_EN_PAZ) return false;
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
        + `Por despacho:\n${lineas}\n\nSolo se avisa a quien YA es cliente (factura emitida, encargo firmado o pago justificado): a quien solo pidió presupuesto no se le reclama nada.\nY nunca a un expediente con documentos subidos por el despacho: ese trabaja en modo despacho.`,
    });
  }

  return NextResponse.json({
    ok: true, activo: ACTIVO, candidatos: candidatos.length,
    enviados: hechos.filter((h) => h.enviado).length,
    detalle: hechos.map((h) => ({ despacho: h.ws, enviado: h.enviado, motivo: h.motivo })),
  });
}
