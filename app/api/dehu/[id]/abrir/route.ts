import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { AperturaImposible, abrirNotificacionDehu } from "@/lib/dehu/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // abrir en la DEHú + lectura IA del documento

// ABRIR una notificación de la DEHú desde Aproba (DEHú automática). Vale como
// comparecencia: a partir de ahí corren los plazos (art. 43.2 Ley 39/2015). La pantalla
// pide confirmación con ese aviso y manda { confirmo: true }; sin él no se abre nada.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { confirmo?: unknown };
  if (body.confirmo !== true) return NextResponse.json({ error: "Falta tu confirmación para abrirla." }, { status: 400 });

  // Solo lo que el gestor VE (RLS: sedes, asistentes) se puede abrir.
  const { data: visible } = await supabase.from("NotificacionDehu").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "No se encuentra la notificación." }, { status: 404 });
  const admin = createSupabaseAdmin();
  const { data: u } = await admin.from("User").select("nombre, email").eq("id", user.id).maybeSingle();
  const userNombre = String((u as { nombre?: string | null; email?: string } | null)?.nombre || user.email || "Un miembro del despacho");
  try {
    const r = await abrirNotificacionDehu(admin, { workspaceId: visible.workspaceId as string, notificacionId: id, userId: user.id, userNombre });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof AperturaImposible) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[dehu abrir]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo abrir la notificación. Inténtalo de nuevo o ábrela en la DEHú." }, { status: 500 });
  }
}
