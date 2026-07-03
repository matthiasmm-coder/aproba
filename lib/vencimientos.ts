import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

// VIGÍA — motor de vencimientos/renovaciones (ver supabase/vigia.sql).
// Un vencimiento = "a este cliente le caduca X el día D". Se siembra en dos momentos:
//  (1) al VALIDAR un TIE en el portal (la IA extrae fecha_caducidad → fecha REAL);
//  (2) al FINALIZAR un expediente (fecha ESTIMADA = hoy + validez legal del trámite).
// Estados: PENDIENTE → AVISADO (cron avisó al gestor) → TRAMITANDO (renovación
// iniciada) → HECHO (renovación finalizada). Todo con repli propre: si la tabla
// no está migrada, los hooks se ignoran sin romper nada.

const uuid = () => crypto.randomUUID();
const esFaltaMigracion = (msg: string) => /relation .*Vencimiento.* does not exist|schema cache|column/i.test(msg);

// Validez (meses) de la tarjeta que RESULTA de cada trámite (tipificación legal española,
// v1 constante; v2: configurable por servicio). null = el trámite no produce tarjeta que caduque.
export const MESES_VALIDEZ: Record<string, number | null> = {
  ARRAIGO_SOCIAL: 12, // residencia inicial: 1 año
  ARRAIGO_LABORAL: 12,
  ARRAIGO_FAMILIAR: 12,
  TIE: 12, // primera TIE genérica
  REAGRUPACION: 12,
  RENOVACION: 48, // renovación estándar: 4 años
  RESIDENCIA_LARGA: 60, // larga duración: tarjeta cada 5 años
  NACIONALIDAD: null, // no caduca
  NIE: null, // el certificado NIE no se "renueva" como una TIE
  OTRO: null,
};

// Días de antelación con la que el cron avisa al gestor.
export const DIAS_AVISO = 60;

// Siembra (o refresca) el vencimiento activo del cliente. UPSERT a nivel de código:
// un solo vencimiento vivo por (cliente, tipo). Reglas:
//  - Si hay una renovación EN MARCHA (TRAMITANDO) → no sembrar nada (p. ej. el cliente
//    sube su TIE viejo en el portal de la propia renovación: no es una alerta nueva).
//  - fuente REAL (fecha extraída de un TIE) actualiza el activo; si la fecha cambia,
//    vuelve a PENDIENTE para que el cron re-avise en el momento correcto.
//  - fuente ESTIMADA (hoy + validez legal, al finalizar) NUNCA pisa una fecha existente
//    (que puede ser real); solo crea si no hay vencimiento activo.
// Nunca lanza.
export async function sembrarVencimiento(
  admin: SupabaseClient,
  opts: { workspaceId: string; clienteId: string; fecha: string; tipo?: string; expedienteId?: string | null; fuente?: "REAL" | "ESTIMADA" },
): Promise<void> {
  const tipo = opts.tipo ?? "TIE";
  const fuente = opts.fuente ?? "REAL";
  try {
    const { data: filas, error: e1 } = await admin
      .from("Vencimiento")
      .select("id, fecha, estado")
      .eq("clienteId", opts.clienteId)
      .eq("tipo", tipo)
      .in("estado", ["PENDIENTE", "AVISADO", "TRAMITANDO"])
      .limit(5);
    if (e1) throw e1;
    const activos = (filas ?? []) as { id: string; fecha: string; estado: string }[];
    if (activos.some((a) => a.estado === "TRAMITANDO")) return; // renovación ya en marcha
    const activo = activos[0] ?? null;

    const ahora = new Date().toISOString();
    if (activo) {
      if (fuente === "ESTIMADA") return; // no pisar una fecha (posiblemente real) con una estimación
      const cambia = Math.abs(new Date(activo.fecha).getTime() - new Date(opts.fecha).getTime()) > 864e5;
      await admin
        .from("Vencimiento")
        .update({
          fecha: opts.fecha,
          ...(cambia ? { estado: "PENDIENTE" } : {}), // fecha nueva → re-avisar en su momento
          ...(opts.expedienteId ? { expedienteId: opts.expedienteId } : {}),
          updatedAt: ahora,
        })
        .eq("id", activo.id);
    } else {
      await admin.from("Vencimiento").insert({
        id: uuid(),
        workspaceId: opts.workspaceId,
        clienteId: opts.clienteId,
        expedienteId: opts.expedienteId ?? null,
        fecha: opts.fecha,
        tipo,
        estado: "PENDIENTE",
        updatedAt: ahora,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!esFaltaMigracion(msg)) console.error("[vigia sembrar]", msg);
    // tabla sin migrar → silencio (repli propre)
  }
}

// El expediente de renovación se ha FINALIZADO → su vencimiento pasa a HECHO y, si el
// trámite produce una tarjeta nueva, se siembra el SIGUIENTE ciclo. Nunca lanza.
export async function cerrarCicloRenovacion(
  admin: SupabaseClient,
  opts: { expedienteRenovacionId: string; workspaceId: string; clienteId: string; tipoTramite: string },
): Promise<void> {
  try {
    await admin
      .from("Vencimiento")
      .update({ estado: "HECHO", updatedAt: new Date().toISOString() })
      .eq("expedienteRenovacionId", opts.expedienteRenovacionId)
      .in("estado", ["PENDIENTE", "AVISADO", "TRAMITANDO"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!esFaltaMigracion(msg)) console.error("[vigia cerrar-ciclo]", msg);
  }
}

// AAAA-MM-DD (texto de la IA) → ISO. null si no parsea o es absurda (>30 años).
export function fechaCaducidadISO(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const anos = (d.getTime() - Date.now()) / (365 * 864e5);
  if (anos > 30 || anos < -30) return null;
  return d.toISOString();
}

// ── Cron: aviso al gestor ────────────────────────────────────────────────────
// PENDIENTE con fecha ≤ hoy+DIAS_AVISO → email DIGEST por workspace al OWNER +
// evento en el historial del expediente origen + estado AVISADO (idempotente:
// una vez AVISADO no se repite). Devuelve contadores para el resumen del cron.
export async function escanearVencimientos(admin: SupabaseClient): Promise<{ avisados: number; workspaces: number }> {
  const resumen = { avisados: 0, workspaces: 0 };
  let filas: {
    id: string; workspaceId: string; expedienteId: string | null; fecha: string; tipo: string;
    cliente: { nombre: string | null; apellidos: string | null } | { nombre: string | null; apellidos: string | null }[] | null;
  }[] = [];
  try {
    const limite = new Date(Date.now() + DIAS_AVISO * 864e5).toISOString();
    const { data, error } = await admin
      .from("Vencimiento")
      .select("id, workspaceId, expedienteId, fecha, tipo, cliente:Cliente(nombre, apellidos)")
      .eq("estado", "PENDIENTE")
      .lte("fecha", limite)
      .order("fecha", { ascending: true })
      .limit(500);
    if (error) throw error;
    filas = (data ?? []) as typeof filas;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!esFaltaMigracion(msg)) console.error("[vigia escanear]", msg);
    return resumen; // tabla sin migrar → nada que hacer
  }
  if (!filas.length) return resumen;

  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const porWs = new Map<string, typeof filas>();
  for (const f of filas) {
    const l = porWs.get(f.workspaceId) ?? [];
    l.push(f);
    porWs.set(f.workspaceId, l);
  }

  for (const [workspaceId, lista] of porWs) {
    resumen.workspaces += 1;
    const lineas: string[] = [];
    const eventos: { expedienteId: string; descripcion: string }[] = [];
    for (const v of lista) {
      const c = uno(v.cliente);
      const nombre = `${c?.nombre ?? "Cliente"} ${c?.apellidos ?? ""}`.trim();
      const dias = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / 864e5);
      const cuando = dias < 0 ? `caducó hace ${-dias} días` : `caduca en ${dias} días`;
      lineas.push(`• ${nombre} — ${v.tipo} ${cuando} (${new Date(v.fecha).toLocaleDateString("es-ES")})`);
      if (v.expedienteId) {
        eventos.push({ expedienteId: v.expedienteId, descripcion: `⏰ Vigía: la ${v.tipo} de ${nombre} ${cuando}. Inicia la renovación desde Vencimientos.` });
      }
    }

    // Email digest al OWNER del despacho. Si el ENVÍO se intenta y FALLA → no marcamos
    // AVISADO ni escribimos eventos: mañana se reintenta entero (sin duplicar nada).
    // Sin email configurado / sin Resend → se marca igual (si no, spam diario de eventos).
    let envioFallido = false;
    try {
      const { data: owner } = await admin
        .from("Membership")
        .select("userId")
        .eq("workspaceId", workspaceId)
        .eq("role", "OWNER")
        .limit(1)
        .maybeSingle();
      const email = owner
        ? (await admin.auth.admin.getUserById(owner.userId as string)).data.user?.email ?? null
        : null;
      if (email && process.env.RESEND_API_KEY) {
        const from = `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
        const cuerpo = `${lineas.join("\n")}\n\nInicia las renovaciones desde Aproba → Vencimientos:\n${appUrl}/app/vencimientos`;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from,
          to: email,
          subject: `⏰ ${lista.length} ${lista.length === 1 ? "vencimiento próximo" : "vencimientos próximos"} — inicia la renovación`,
          text: cuerpo,
          html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap">${cuerpo.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
        });
        if (error) { console.error("[vigia digest]", error.message ?? error); envioFallido = true; }
      }
    } catch (e) {
      console.error("[vigia digest]", e instanceof Error ? e.message : e);
      envioFallido = true;
    }
    if (envioFallido) continue; // reintento mañana, sin eventos ni AVISADO

    for (const ev of eventos) {
      const { error } = await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: ev.expedienteId, tipo: "COMENTARIO", descripcion: ev.descripcion });
      if (error) console.error("[vigia evento]", error.message);
    }

    const ids = lista.map((v) => v.id);
    const { error: eUp } = await admin
      .from("Vencimiento")
      .update({ estado: "AVISADO", updatedAt: new Date().toISOString() })
      .in("id", ids);
    if (!eUp) resumen.avisados += ids.length;
  }

  return resumen;
}
