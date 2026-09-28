import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarNumeroOficial } from "@/lib/numero-oficial";
import { COLS_NOTIFICACION, etiquetaNotificacion, mapFilaNotificacion, sugerirExpediente, fechaValida } from "@/lib/notificaciones-dehu";
import { candidatosDeWorkspace, faltaMigracionDehu, ERROR_MIGRACION_DEHU } from "@/lib/notificaciones-dehu-guardar";

// DEHú · lo que el gestor decide sobre una notificación (28/09/2026). Todo se lee BAJO
// SESIÓN primero (RLS: despacho, sede, asistente) y solo entonces escribe el admin.
//   vincular      { expedienteId, guardarNumero? } → VINCULADA + rastro en el expediente
//   desvincular   → vuelve a PENDIENTE
//   gestionada    { requerimientoId? } → GESTIONADA (requerimiento, resolución o cita hechos)
//   ignorar / reabrir
//   plazo         { fechaLimite: AAAA-MM-DD } → el gestor corrige la fecha propuesta
// DELETE: solo una IGNORADA (la IA no la reconoció o el gestor la descartó), con su archivo.

type Accion = "vincular" | "desvincular" | "gestionada" | "ignorar" | "reabrir" | "plazo";

async function contexto(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) } as const;
  const { data, error } = await supabase.from("NotificacionDehu").select(`${COLS_NOTIFICACION}, workspaceId`).eq("id", id).maybeSingle();
  if (error && faltaMigracionDehu(error.message)) return { error: NextResponse.json({ error: ERROR_MIGRACION_DEHU }, { status: 500 }) } as const;
  if (!data) return { error: NextResponse.json({ error: "Notificación no encontrada." }, { status: 404 }) } as const;
  const { data: perfil } = await supabase.from("User").select("nombre, email").eq("id", user.id).maybeSingle();
  const autor = (perfil as { nombre?: string | null; email?: string | null } | null)?.nombre || (perfil as { email?: string | null } | null)?.email || "Despacho";
  return { supabase, user, fila: data as Record<string, unknown>, autor } as const;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { accion?: Accion; expedienteId?: string; guardarNumero?: boolean; requerimientoId?: string; fechaLimite?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const ctx = await contexto(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, fila, autor } = ctx;
  const n = mapFilaNotificacion(fila);
  const ws = String(fila.workspaceId);
  const admin = createSupabaseAdmin();
  const ahora = new Date().toISOString();
  let cambios: Record<string, unknown> = {};

  switch (body.accion) {
    case "vincular": {
      const expId = String(body.expedienteId ?? "");
      // El expediente BAJO SESIÓN: la RLS impide vincular a uno de otro despacho o sede.
      const { data: exp } = await supabase.from("Expediente").select("id, referencia, clienteId, workspaceId").eq("id", expId).maybeSingle();
      if (!exp || exp.workspaceId !== ws) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
      const clienteId = n.sugerencia?.expedienteId === expId && n.sugerencia.clienteId ? n.sugerencia.clienteId : (exp.clienteId as string | null);
      cambios = { expedienteId: expId, clienteId, estado: n.estado === "GESTIONADA" ? "GESTIONADA" : "VINCULADA" };
      let numeroGuardado = false;
      if (body.guardarNumero && n.numeroExpediente) {
        const { data: ex2, error: eNum } = await admin.from("Expediente").select("numeroOficial").eq("id", expId).maybeSingle();
        if (!eNum && !String((ex2 as { numeroOficial?: string | null } | null)?.numeroOficial ?? "").trim()) {
          const { error: eUp } = await admin.from("Expediente").update({ numeroOficial: normalizarNumeroOficial(n.numeroExpediente), updatedAt: ahora }).eq("id", expId);
          numeroGuardado = !eUp;
        }
      }
      const detalle = [n.asunto, n.organismo].filter(Boolean).join(" · ");
      await admin.from("ExpedienteEvento").insert({
        id: crypto.randomUUID(), expedienteId: expId, tipo: "COMENTARIO", userId: user.id,
        descripcion: `📬 ${etiquetaNotificacion(n)}${detalle ? ` — ${detalle}` : ""}${numeroGuardado ? ` · nº oficial ${normalizarNumeroOficial(n.numeroExpediente)} guardado` : ""}`.slice(0, 500),
      });
      break;
    }
    case "desvincular":
      cambios = { expedienteId: null, clienteId: null, estado: n.estado === "VINCULADA" ? "PENDIENTE" : n.estado };
      break;
    case "gestionada": {
      let requerimientoId: string | null = null;
      if (body.requerimientoId) {
        const { data: rq } = await supabase.from("Requerimiento").select("id, expedienteId").eq("id", String(body.requerimientoId)).maybeSingle();
        if (!rq || (n.expedienteId && rq.expedienteId !== n.expedienteId)) return NextResponse.json({ error: "Requerimiento no encontrado." }, { status: 404 });
        requerimientoId = rq.id as string;
      }
      cambios = { estado: "GESTIONADA", gestionadaAt: ahora, gestionadaPor: autor, ...(requerimientoId ? { requerimientoId } : {}) };
      break;
    }
    case "ignorar":
      cambios = { estado: "IGNORADA", gestionadaAt: ahora, gestionadaPor: autor };
      break;
    case "reabrir": {
      cambios = { estado: n.expedienteId ? "VINCULADA" : "PENDIENTE", gestionadaAt: null, gestionadaPor: null };
      if (n.noEsNotificacion) {
        // «Importar igualmente»: la IA dudó y el gestor dice que sí es una notificación.
        const sug = sugerirExpediente({ ...n, empresaNif: n.empresaNif }, await candidatosDeWorkspace(admin, ws));
        const ia = (fila.iaDatos ?? {}) as Record<string, unknown>;
        cambios = { ...cambios, iaDatos: { ...ia, noEsNotificacion: false, sugerencia: sug }, expedienteSugeridoId: sug?.expedienteId ?? null, motivoSugerencia: sug?.motivo ?? null };
      }
      break;
    }
    case "plazo": {
      const f = fechaValida(body.fechaLimite);
      if (!f) return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
      const ia = (fila.iaDatos ?? {}) as Record<string, unknown>;
      cambios = { fechaLimite: new Date(`${f}T21:59:00Z`).toISOString(), iaDatos: { ...ia, plazoDesdeHoy: false, plazoCorregidoPor: autor } };
      break;
    }
    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }

  const { data: nueva, error } = await admin.from("NotificacionDehu").update({ ...cambios, updatedAt: ahora }).eq("id", id).eq("workspaceId", ws).select(COLS_NOTIFICACION).single();
  if (error) return NextResponse.json({ error: faltaMigracionDehu(error.message) ? ERROR_MIGRACION_DEHU : "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true, notificacion: mapFilaNotificacion(nueva as Record<string, unknown>) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await contexto(id);
  if ("error" in ctx) return ctx.error;
  const { fila } = ctx;
  if (fila.estado !== "IGNORADA") return NextResponse.json({ error: "Solo se eliminan las notificaciones ignoradas." }, { status: 409 });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("NotificacionDehu").delete().eq("id", id).eq("workspaceId", String(fila.workspaceId));
  if (error) return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  if (typeof fila.storagePath === "string" && fila.storagePath) await admin.storage.from("documentos").remove([fila.storagePath]).catch(() => {});
  return NextResponse.json({ ok: true });
}
