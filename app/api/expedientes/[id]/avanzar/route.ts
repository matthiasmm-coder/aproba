import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { TIPO_A_SERVICIO } from "@/lib/tramites";
import type { ExpedienteEstado } from "@/lib/types";

// État-machine du cycle de vie post-documents.
//   presentar             FORM_GENERADO         → PRESENTADO
//   resolver_favorable    PRESENTADO            → RESUELTO
//   resolver_desfavorable PRESENTADO            → RECHAZADO
//   cita (+ fecha/hora…)  RESUELTO              → CITA_HUELLAS  (uniquement si le service a une cita)
//   finalizar             RESUELTO|CITA_HUELLAS  → FINALIZADO
type Accion = "presentar" | "resolver_favorable" | "resolver_desfavorable" | "cita" | "finalizar";
type EventoTipo = "PRESENTADO" | "ESTADO_CAMBIADO";

const TRANSICIONES: Record<Exclude<Accion, "cita">, { desde: ExpedienteEstado[]; hacia: ExpedienteEstado; evento: EventoTipo; desc: string; aviso: string }> = {
  presentar: { desde: ["FORM_GENERADO"], hacia: "PRESENTADO", evento: "PRESENTADO", desc: "Expediente presentado en la Administración", aviso: "presentado" },
  resolver_favorable: { desde: ["PRESENTADO"], hacia: "RESUELTO", evento: "ESTADO_CAMBIADO", desc: "Resolución favorable", aviso: "resuelto_favorable" },
  resolver_desfavorable: { desde: ["PRESENTADO"], hacia: "RECHAZADO", evento: "ESTADO_CAMBIADO", desc: "Resolución desfavorable (denegado)", aviso: "denegado" },
  finalizar: { desde: ["CITA_HUELLAS", "RESUELTO"], hacia: "FINALIZADO", evento: "ESTADO_CAMBIADO", desc: "Trámite completado", aviso: "tie_entregado" },
};

// AAAA-MM-JJ → JJ/MM/AAAA.
const fmtFecha = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { accion?: Accion; fecha?: string; hora?: string; lugar?: string; notas?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const accion = body.accion as Accion;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si pas membre
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: w } = await admin.from("Expediente").select("workspaceId").eq("id", id).maybeSingle();
  const ws = w?.workspaceId as string | undefined;
  const baseUrl = baseUrlFromRequest(req);

  // ── CITA : transition spéciale (champs détaillés + aviso selon qui s'y rend) ──
  if (accion === "cita") {
    if (exp.estado === "CITA_HUELLAS") return NextResponse.json({ ok: true, estado: "CITA_HUELLAS" });
    if (exp.estado !== "RESUELTO") return NextResponse.json({ error: `Esta acción no es posible desde el estado actual (${exp.estado}).` }, { status: 409 });
    if (!body.fecha) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });

    // Qui se rend à la cita ? (config du service de l'expediente)
    let quien: "cliente" | "gestor" = "cliente";
    if (ws) {
      const servicios = await fetchServiciosDeWorkspace(admin, ws);
      const servicio = servicios.find((s) => s.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipoEnum]));
      quien = servicio?.citaQuien === "gestor" ? "gestor" : "cliente";
    }

    const patch = { estado: "CITA_HUELLAS", fechaCita: body.fecha, citaHora: body.hora ?? null, citaLugar: body.lugar ?? null, citaNotas: body.notas ?? null, updatedAt: new Date().toISOString() };
    const { error: upErr } = await admin.from("Expediente").update(patch).eq("id", id);
    if (upErr) { console.error("[avanzar cita]", upErr.message); return NextResponse.json({ error: "No se pudo guardar la cita." }, { status: 500 }); }

    const detalle = `${fmtFecha(body.fecha)}${body.hora ? ` ${body.hora}` : ""}${body.lugar ? ` · ${body.lugar}` : ""}`;
    await admin.from("ExpedienteEvento").insert({ id: crypto.randomUUID(), expedienteId: id, tipo: "ESTADO_CAMBIADO", descripcion: `Cita presencial: ${detalle} (acude el ${quien})`, userId: user.id });

    // {fecha} assemblé : détaillé pour le client (date + heure + lieu), juste la date pour le gestor.
    let fechaTxt = "el " + fmtFecha(body.fecha);
    if (quien === "cliente") {
      if (body.hora) fechaTxt += ` a las ${body.hora}`;
      if (body.lugar) fechaTxt += ` en ${body.lugar}`;
    }
    try {
      if (ws) await dispararAviso(admin, { workspaceId: ws, expedienteId: id, clave: quien === "gestor" ? "cita_gestor" : "cita_cliente", vars: { fecha: fechaTxt, notas: body.notas ?? "" }, baseUrl });
    } catch { /* un aviso ne casse jamais le flux */ }
    return NextResponse.json({ ok: true, estado: "CITA_HUELLAS" });
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

  return NextResponse.json({ ok: true, estado: tr.hacia });
}
