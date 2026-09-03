import type { SupabaseClient } from "@supabase/supabase-js";
import { dispararAviso } from "@/lib/notificaciones";
import { sembrarVencimiento, cerrarCicloRenovacion, MESES_VALIDEZ } from "@/lib/vencimientos";
import { etiquetaSalida, type Salida } from "@/lib/types";

// CIERRE DEL EXPEDIENTE (flujo v4, 03/09/2026). El ciclo del despacho termina en la
// ENTREGA: «Facturar y archivar» registra la SALIDA y saca el expediente del tablero.
// La salida se traduce al estado de siempre para que todo lo que ya lee estados (seguimiento
// del cliente, Vigía, KPIs, historial) siga funcionando sin remapear nada:
//   en_tramite → PRESENTADO (se sella fechaPresentacion)   desistido → el estado no cambia
//   concedido  → FINALIZADO (Vigía siembra la caducidad)    denegado  → RECHAZADO
// La columna Expediente.salida es opcional (migración supabase/flujo-v4.sql): si falta,
// el cierre funciona igual y la categoría se deduce del estado.
export const ESTADO_POR_SALIDA: Record<Salida, string | null> = {
  en_tramite: "PRESENTADO",
  concedido: "FINALIZADO",
  denegado: "RECHAZADO",
  desistido: null,
};

type Exp = { id: string; estado: string; tipo?: string | null; clienteId?: string | null; familiaId?: string | null; fechaPresentacion?: string | null };

// ── VIGÍA tras FINALIZAR (compartido con /avanzar) ──────────────────────────
// Renovación iniciada desde Vigía → su vencimiento pasa a HECHO; y se siembra la caducidad
// ESTIMADA de la tarjeta nueva (hoy + validez legal), una por solicitante en familia.
// Nunca pisa una fecha REAL ya leída de un TIE. Jamás rompe la transición que lo llama.
export async function vigiaTrasFinalizar(admin: SupabaseClient, ws: string, w: Exp): Promise<void> {
  try {
    const tipoTramite = String(w.tipo ?? "OTRO");
    if (tipoTramite === "RENOVACION") {
      await cerrarCicloRenovacion(admin, { expedienteRenovacionId: w.id, workspaceId: ws, clienteId: String(w.clienteId), tipoTramite });
    }
    const meses = MESES_VALIDEZ[tipoTramite] ?? null;
    if (!meses) return;
    const fecha = new Date();
    fecha.setUTCMonth(fecha.getUTCMonth() + meses);
    let titulares: string[] = [String(w.clienteId)];
    if (w.familiaId) {
      const { data: sols } = await admin.from("Cliente").select("id").eq("familiaId", w.familiaId).eq("workspaceId", ws).eq("esSolicitante", true);
      if (sols?.length) titulares = sols.map((s) => String(s.id));
    }
    for (const clienteId of titulares) {
      await sembrarVencimiento(admin, { workspaceId: ws, clienteId, fecha: fecha.toISOString(), tipo: "TIE", expedienteId: w.id, fuente: "ESTIMADA" });
    }
  } catch (e) {
    console.error("[vigia finalizar]", e instanceof Error ? e.message : e);
  }
}

// ── VIGÍA tras DENEGAR: la renovación vuelve a PENDIENTE (la tarjeta caduca igual) ──
export async function vigiaTrasDenegar(admin: SupabaseClient, w: Exp): Promise<void> {
  if (String(w.tipo) !== "RENOVACION") return;
  try {
    await admin.from("Vencimiento")
      .update({ estado: "PENDIENTE", expedienteRenovacionId: null, updatedAt: new Date().toISOString() })
      .eq("expedienteRenovacionId", w.id).eq("estado", "TRAMITANDO");
  } catch (e) {
    console.error("[vigia rechazo]", e instanceof Error ? e.message : e);
  }
}

// ── Aplicar una salida ──────────────────────────────────────────────────────
// `archivar: true` = cierre desde la ficha o el tablero (sale del tablero).
// `archivar: false` = reclasificar un archivado cuando llega la resolución (sin avisos).
// `avisar` solo cuenta al cerrar: en_tramite dispara el aviso «presentado» (configurable
// en Ajustes), denegado el aviso «denegado» (apagado por defecto). Concedido NO avisa
// aquí: el llamante manda el email de cierre combinado (finalización + factura).
export async function aplicarSalida(admin: SupabaseClient, opts: {
  id: string; workspaceId: string; userId: string; salida: Salida; archivar: boolean; avisar: boolean; baseUrl: string;
}): Promise<{ ok: true; estado: string; salidaGuardada: boolean } | { ok: false; error: string }> {
  const { id, workspaceId: ws, salida } = opts;
  const { data: w, error: eSel } = await admin.from("Expediente").select("id, estado, tipo, clienteId, familiaId, fechaPresentacion").eq("id", id).eq("workspaceId", ws).maybeSingle();
  if (eSel || !w) return { ok: false, error: "Expediente no encontrado." };
  const exp = w as Exp;

  const ahora = new Date().toISOString();
  const nuevoEstado = ESTADO_POR_SALIDA[salida] ?? exp.estado;
  const base: Record<string, unknown> = { estado: nuevoEstado, updatedAt: ahora };
  if (nuevoEstado === "PRESENTADO" && !exp.fechaPresentacion) base.fechaPresentacion = ahora;
  if (opts.archivar) base.archivadoAt = ahora;

  let salidaGuardada = true;
  let { error } = await admin.from("Expediente").update({ ...base, salida }).eq("id", id);
  if (error && /salida|column|schema cache/i.test(error.message)) {
    // Sin la migración la columna no existe: el cierre no puede depender de ella.
    salidaGuardada = false;
    ({ error } = await admin.from("Expediente").update(base).eq("id", id));
  }
  if (error) { console.error("[cierre]", error.message); return { ok: false, error: "No se pudo cerrar el expediente." }; }

  const etiqueta = etiquetaSalida(salida) ?? salida;
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "ESTADO_CAMBIADO",
    descripcion: opts.archivar ? `🗄️ Facturado y archivado · ${etiqueta}` : `🗂️ Reclasificado · ${etiqueta}`,
    userId: opts.userId,
  });

  if (opts.archivar && opts.avisar) {
    const clave = salida === "en_tramite" ? "presentado" : salida === "denegado" ? "denegado" : null;
    if (clave) {
      try { await dispararAviso(admin, { workspaceId: ws, expedienteId: id, clave, baseUrl: opts.baseUrl }); } catch { /* un aviso jamás rompe el cierre */ }
    }
  }

  if (nuevoEstado === "FINALIZADO" && exp.estado !== "FINALIZADO") await vigiaTrasFinalizar(admin, ws, exp);
  if (nuevoEstado === "RECHAZADO" && exp.estado !== "RECHAZADO") await vigiaTrasDenegar(admin, exp);

  return { ok: true, estado: nuevoEstado, salidaGuardada };
}
