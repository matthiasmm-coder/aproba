import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import type { ExpedienteEstado } from "@/lib/types";

// État-machine du cycle de vie post-documents. Chaque action avance l'expediente d'un
// état précis vers le suivant, journalise un evento et déclenche l'aviso au client.
//   presentar             FORM_GENERADO → PRESENTADO
//   resolver_favorable    PRESENTADO    → RESUELTO
//   resolver_desfavorable PRESENTADO    → RECHAZADO
//   cita (+ fecha)        RESUELTO      → CITA_HUELLAS
//   finalizar             CITA_HUELLAS  → FINALIZADO
type Accion = "presentar" | "resolver_favorable" | "resolver_desfavorable" | "cita" | "finalizar";
type EventoTipo = "PRESENTADO" | "ESTADO_CAMBIADO";

const TRANSICIONES: Record<Accion, { desde: ExpedienteEstado; hacia: ExpedienteEstado; evento: EventoTipo; desc: string; aviso: string }> = {
  presentar: { desde: "FORM_GENERADO", hacia: "PRESENTADO", evento: "PRESENTADO", desc: "Expediente presentado en la Administración", aviso: "presentado" },
  resolver_favorable: { desde: "PRESENTADO", hacia: "RESUELTO", evento: "ESTADO_CAMBIADO", desc: "Resolución favorable", aviso: "resuelto_favorable" },
  resolver_desfavorable: { desde: "PRESENTADO", hacia: "RECHAZADO", evento: "ESTADO_CAMBIADO", desc: "Resolución desfavorable (denegado)", aviso: "denegado" },
  cita: { desde: "RESUELTO", hacia: "CITA_HUELLAS", evento: "ESTADO_CAMBIADO", desc: "Cita de huellas asignada", aviso: "cita_huellas" },
  finalizar: { desde: "CITA_HUELLAS", hacia: "FINALIZADO", evento: "ESTADO_CAMBIADO", desc: "TIE entregado · trámite completado", aviso: "tie_entregado" },
};

// AAAA-MM-JJ → JJ/MM/AAAA (pour l'aviso et l'affichage).
const fmtFecha = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { accion?: Accion; fecha?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const accion = body.accion as Accion;
  const tr = accion && TRANSICIONES[accion];
  if (!tr) return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si pas membre
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Idempotent : si déjà à l'état cible, on confirme sans rejouer l'aviso.
  if (exp.estado === tr.hacia) return NextResponse.json({ ok: true, estado: tr.hacia });
  if (exp.estado !== tr.desde) {
    return NextResponse.json({ error: `Esta acción no es posible desde el estado actual (${exp.estado}).` }, { status: 409 });
  }

  // La cita exige une date.
  let fechaFmt = "";
  if (accion === "cita") {
    if (!body.fecha) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });
    fechaFmt = fmtFecha(body.fecha);
  }

  const admin = createSupabaseAdmin();
  const { data: w } = await admin.from("Expediente").select("workspaceId").eq("id", id).maybeSingle();

  const patch: Record<string, unknown> = { estado: tr.hacia, updatedAt: new Date().toISOString() };
  if (accion === "cita") patch.fechaCita = body.fecha;
  // On VÉRIFIE l'update : s'il échoue (ex. migration des nouveaux états non appliquée),
  // on n'écrit PAS d'evento et on n'envoie PAS d'aviso au client (sinon faux positif).
  const { error: upErr } = await admin.from("Expediente").update(patch).eq("id", id);
  if (upErr) {
    console.error("[avanzar]", upErr.message);
    return NextResponse.json({ error: "No se pudo actualizar el estado del expediente." }, { status: 500 });
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: tr.evento,
    descripcion: accion === "cita" ? `${tr.desc}: ${fechaFmt}` : tr.desc, userId: user.id,
  });

  // Aviso au client (ne casse jamais le flux).
  try {
    if (w?.workspaceId) {
      await dispararAviso(admin, {
        workspaceId: w.workspaceId as string, expedienteId: id, clave: tr.aviso,
        vars: accion === "cita" ? { fecha: fechaFmt } : undefined,
        baseUrl: baseUrlFromRequest(req),
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, estado: tr.hacia });
}
