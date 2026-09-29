import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { estadoDehuAutomatica, sincronizarDehu } from "@/lib/dehu/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // puede traer y leer (IA) hasta 3 documentos

// «Consultar ahora» (pestaña DEHú): una consulta a la DEHú sin esperar a la automática.
// Cualquier miembro; como mucho una por minuto y despacho.
export async function POST() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;
  const r = await sincronizarDehu(admin, workspaceId, { forzar: true, userId: user.id });
  if (!r.hecha && r.motivo === "reciente") return NextResponse.json({ error: "Se acaba de consultar: espera un minuto." }, { status: 429 });
  if (!r.hecha && r.motivo === "sin conexión") return NextResponse.json({ error: "La DEHú automática no está conectada." }, { status: 400 });
  return NextResponse.json({ resultado: r, estado: await estadoDehuAutomatica(admin, workspaceId) }, { status: r.error ? 502 : 200 });
}
