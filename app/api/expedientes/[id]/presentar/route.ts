import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { dispararAviso } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// POST → marque l'expediente comme PRESENTADO (depuis FORM_GENERADO) et avise le
// client (selon Ajustes). RLS : seul un membre du workspace peut le faire.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si pas membre
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Idempotent : on ne présente que depuis « formularios generados ». Si déjà présenté,
  // on renvoie OK sans re-notifier.
  if (exp.estado === "PRESENTADO") return NextResponse.json({ ok: true, estado: "PRESENTADO" });
  if (exp.estado !== "FORM_GENERADO") {
    return NextResponse.json({ error: "Genera primero los formularios antes de presentar." }, { status: 409 });
  }

  const admin = createSupabaseAdmin();
  const { data: w } = await admin.from("Expediente").select("workspaceId").eq("id", id).maybeSingle();

  await admin.from("Expediente").update({ estado: "PRESENTADO", updatedAt: new Date().toISOString() }).eq("id", id);
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "PRESENTADO",
    descripcion: "Expediente presentado en la Administración", userId: user.id,
  });

  // Aviso au client (ne casse jamais le flux).
  try {
    if (w?.workspaceId) await dispararAviso(admin, { workspaceId: w.workspaceId as string, expedienteId: id, clave: "presentado", baseUrl: baseUrlFromRequest(req) });
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, estado: "PRESENTADO" });
}
