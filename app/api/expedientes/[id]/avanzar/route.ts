import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { serviciosDeExpediente, citaDeServicios } from "@/lib/multi-servicio";
import { sembrarVencimiento, cerrarCicloRenovacion, MESES_VALIDEZ } from "@/lib/vencimientos";
import type { ExpedienteEstado } from "@/lib/types";

// État-machine du cycle de vie post-documents.
//   presentar             FORM_GENERADO         → PRESENTADO
//   resolver_favorable    PRESENTADO            → RESUELTO
//   resolver_desfavorable PRESENTADO            → RECHAZADO
//   cita (+ fecha/hora…)  RESUELTO              → CITA_HUELLAS  (uniquement si le service a une cita)
//   finalizar             RESUELTO|CITA_HUELLAS  → FINALIZADO
//   forzar_validados      DOCS_PENDIENTES       → DOCS_VALIDADOS  (el gestor avanza sin esperar todos los documentos)
type Accion = "presentar" | "resolver_favorable" | "resolver_desfavorable" | "cita" | "finalizar" | "forzar_validados";
type EventoTipo = "PRESENTADO" | "ESTADO_CAMBIADO";

// CICLO A 5 ESTADOS (ver lib/progreso.ts). Las puertas intermedias han desaparecido:
// preparar un expediente ya no exige validar etapas. Solo quedan las 3 declaraciones que
// el producto NO PUEDE deducir — presentar, resolver, cerrar.
//
// Cada «desde» acepta los DOS mundos: los valores legados siguen en las filas mientras
// el remap no haya corrido, y un despliegue no puede dejar un expediente sin acción.
const PREPARACION: ExpedienteEstado[] = ["EN_PREPARACION", "BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO"];
const RESUELTO_O_CITA: ExpedienteEstado[] = ["RESUELTO", "CITA_HUELLAS"];

const TRANSICIONES: Record<Exclude<Accion, "cita">, { desde: ExpedienteEstado[]; hacia: ExpedienteEstado; evento: EventoTipo; desc: string; aviso: string }> = {
  // Se conserva por compatibilidad (clientes con la pantalla antigua abierta): ya no
  // hay nada que forzar, así que no mueve el estado ni avisa a nadie.
  forzar_validados: { desde: PREPARACION, hacia: "EN_PREPARACION", evento: "ESTADO_CAMBIADO", desc: "El gestor continúa sin esperar todos los documentos", aviso: "" },
  presentar: { desde: PREPARACION, hacia: "PRESENTADO", evento: "PRESENTADO", desc: "Expediente presentado en la Administración", aviso: "presentado" },
  resolver_favorable: { desde: ["PRESENTADO"], hacia: "RESUELTO", evento: "ESTADO_CAMBIADO", desc: "Resolución favorable", aviso: "resuelto_favorable" },
  resolver_desfavorable: { desde: ["PRESENTADO"], hacia: "RECHAZADO", evento: "ESTADO_CAMBIADO", desc: "Resolución desfavorable (denegado)", aviso: "denegado" },
  finalizar: { desde: RESUELTO_O_CITA, hacia: "FINALIZADO", evento: "ESTADO_CAMBIADO", desc: "Trámite completado", aviso: "tie_entregado" },
};

// AAAA-MM-JJ → JJ/MM/AAAA.
const fmtFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { accion?: Accion; fecha?: string; hora?: string; lugar?: string; notas?: string; quien?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const accion = body.accion as Accion;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si pas membre
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: w } = await admin.from("Expediente").select("workspaceId, clienteId, tipo, familiaId").eq("id", id).maybeSingle();
  const ws = w?.workspaceId as string | undefined;
  const baseUrl = baseUrlFromRequest(req);

  // ── CITA : hecho del expediente, editable desde la sección «Citas» de la ficha ──
  // SIN puerta de estado (22/08): las citas existen en cualquier punto del trámite
  // (presentación en oficina, huellas tras resolver, recogida de la TIE) — exigir
  // RESUELTO era el viejo modelo lineal.
  if (accion === "cita") {
    if (!body.fecha) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });

    // ¿Quién acude? Elección POR CITA del gestor (cliente / gestor / ambos); si no
    // llega, el valor derivado del servicio (el comportamiento histórico).
    const QUIEN = new Set(["cliente", "gestor", "ambos"]);
    let quien: "cliente" | "gestor" | "ambos";
    if (typeof body.quien === "string" && QUIEN.has(body.quien)) {
      quien = body.quien as typeof quien;
    } else {
      quien = "cliente";
      if (ws) {
        let sedeExp: string | null = null;
        try {
          const { data: se } = await admin.from("Expediente").select("oficinaId").eq("id", id).maybeSingle();
          sedeExp = ((se as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
        } catch { sedeExp = null; }
        const servicios = await fetchServiciosDeWorkspace(admin, ws, sedeExp);
        quien = citaDeServicios(serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipoEnum }, servicios)).citaQuien;
      }
    }

    // Idempotencia por CONTENIDO (fecha+hora+lugar+notas+quien): si el gestor corrige
    // una fecha hay que guardarla Y reavisar — tirar la corrección en silencio le
    // dejaría al cliente presentándose el día que no es. ⚠️ notas y quien cuentan:
    // antes, cambiar SOLO las notas devolvía «sin cambios» y no se guardaba nada.
    const igual = exp.cita?.fecha === body.fecha
      && (exp.cita?.hora ?? null) === (body.hora ?? null)
      && (exp.cita?.lugar ?? null) === (body.lugar ?? null)
      && (exp.cita?.notas ?? null) === (body.notas ?? null)
      && (exp.cita?.quien ?? null) === (typeof body.quien === "string" && QUIEN.has(body.quien) ? body.quien : (exp.cita?.quien ?? null));
    if (igual) return NextResponse.json({ ok: true, estado: exp.estado, sinCambios: true });

    // NO se toca el estado: la cita es un hecho, no una etapa. citaQuien es columna
    // nueva (supabase/cita-quien.sql): fail-soft si la migración no corrió.
    const patch = { fechaCita: body.fecha, citaHora: body.hora ?? null, citaLugar: body.lugar ?? null, citaNotas: body.notas ?? null, updatedAt: new Date().toISOString() };
    let upErr = (await admin.from("Expediente").update({ ...patch, citaQuien: quien }).eq("id", id)).error;
    if (upErr && /citaQuien|column|schema cache/i.test(upErr.message)) {
      upErr = (await admin.from("Expediente").update(patch).eq("id", id)).error;
    }
    if (upErr) { console.error("[avanzar cita]", upErr.message); return NextResponse.json({ error: "No se pudo guardar la cita." }, { status: 500 }); }

    const quienTxt = quien === "ambos" ? "acuden el cliente y el gestor" : `acude el ${quien}`;
    const detalle = `${fmtFecha(body.fecha)}${body.hora ? ` ${body.hora}` : ""}${body.lugar ? ` · ${body.lugar}` : ""}`;
    await admin.from("ExpedienteEvento").insert({ id: crypto.randomUUID(), expedienteId: id, tipo: "ESTADO_CAMBIADO", descripcion: `Cita presencial: ${detalle} (${quienTxt})`, userId: user.id });

    // {fecha} assemblé : détaillé pour el cliente si acude (date + heure + lieu).
    let fechaTxt = "el " + fmtFecha(body.fecha);
    if (quien !== "gestor") {
      if (body.hora) fechaTxt += ` a las ${body.hora}`;
      if (body.lugar) fechaTxt += ` en ${body.lugar}`;
    }
    try {
      if (ws) await dispararAviso(admin, { workspaceId: ws, expedienteId: id, clave: quien === "gestor" ? "cita_gestor" : "cita_cliente", vars: { fecha: fechaTxt, notas: body.notas ?? "" }, baseUrl });
    } catch { /* un aviso ne casse jamais le flux */ }
    return NextResponse.json({ ok: true, estado: exp.estado, quien });
  }

  // ── Transitions simples ──
  const tr = TRANSICIONES[accion as keyof typeof TRANSICIONES];
  if (!tr) return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  if (exp.estado === tr.hacia) return NextResponse.json({ ok: true, estado: tr.hacia });
  if (!tr.desde.includes(exp.estado)) {
    return NextResponse.json({ error: `Esta acción no es posible desde el estado actual (${exp.estado}).` }, { status: 409 });
  }

  const { error: upErr } = await admin.from("Expediente").update({ estado: tr.hacia, updatedAt: new Date().toISOString() }).eq("id", id);
  if (upErr) { console.error("[avanzar]", upErr.message); return NextResponse.json({ error: "No se pudo actualizar el estado del expediente." }, { status: 500 }); }

  await admin.from("ExpedienteEvento").insert({ id: crypto.randomUUID(), expedienteId: id, tipo: tr.evento, descripcion: tr.desc, userId: user.id });

  try {
    if (ws) await dispararAviso(admin, { workspaceId: ws, expedienteId: id, clave: tr.aviso, baseUrl });
  } catch { /* ignore */ }

  // ── VIGÍA: renovación DENEGADA → el vencimiento vinculado vuelve a PENDIENTE ──
  // (si no, quedaría TRAMITANDO para siempre y el radar se apagaría — la tarjeta
  //  caduca igualmente y el gestor debe poder reintentar).
  if (tr.hacia === "RECHAZADO" && w && String(w.tipo) === "RENOVACION") {
    try {
      await admin
        .from("Vencimiento")
        .update({ estado: "PENDIENTE", expedienteRenovacionId: null, updatedAt: new Date().toISOString() })
        .eq("expedienteRenovacionId", id)
        .eq("estado", "TRAMITANDO");
    } catch (e) {
      console.error("[vigia rechazo]", e instanceof Error ? e.message : e);
    }
  }

  // ── VIGÍA: trámite FINALIZADO → sembrar el vencimiento de la tarjeta nueva ──
  // (fecha estimada = hoy + validez legal del trámite). Si era una RENOVACIÓN iniciada
  // desde Vigía, su vencimiento pasa antes a HECHO — así el ciclo se encadena solo.
  // Familiar: una tarjeta por solicitante → un vencimiento por solicitante.
  if (tr.hacia === "FINALIZADO" && ws && w) {
    try {
      const tipoTramite = String(w.tipo ?? "OTRO");
      if (tipoTramite === "RENOVACION") {
        await cerrarCicloRenovacion(admin, { expedienteRenovacionId: id, workspaceId: ws, clienteId: String(w.clienteId), tipoTramite });
      }
      const meses = MESES_VALIDEZ[tipoTramite] ?? null;
      if (meses) {
        const fecha = new Date();
        fecha.setUTCMonth(fecha.getUTCMonth() + meses);
        let titulares: string[] = [String(w.clienteId)];
        if (w.familiaId) {
          // workspaceId además del familiaId: defensa en profundidad multi-tenant.
          const { data: sols } = await admin.from("Cliente").select("id").eq("familiaId", w.familiaId).eq("workspaceId", ws).eq("esSolicitante", true);
          if (sols?.length) titulares = sols.map((s) => String(s.id));
        }
        for (const clienteId of titulares) {
          // ESTIMADA: nunca pisa una fecha real ya extraída de un TIE.
          await sembrarVencimiento(admin, { workspaceId: ws, clienteId, fecha: fecha.toISOString(), tipo: "TIE", expedienteId: id, fuente: "ESTIMADA" });
        }
      }
    } catch (e) {
      console.error("[vigia finalizar]", e instanceof Error ? e.message : e); // jamás rompe la transición
    }
  }

  return NextResponse.json({ ok: true, estado: tr.hacia });
}
