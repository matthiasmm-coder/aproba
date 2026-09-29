import { NextResponse, after } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sincronizarDehu } from "@/lib/dehu/sincronizar";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchNotificacionesParaAlertas } from "@/lib/data/notificaciones-dehu";
import { construirAlertas } from "@/lib/alertas";

// La campana del encabezado (components/campana-alertas.tsx). Lectura BAJO SESIÓN: la RLS
// deja a cada gestor lo de sus sedes y a la administración todo el despacho — por eso no se
// pasa la sede de la pastilla: una alerta no se esconde porque se esté mirando otra oficina.
export const dynamic = "force-dynamic";
// La campana también despierta la DEHú automática (after, tras responder): como mucho una
// consulta cada 20 min por despacho, y solo si la tiene conectada (lib/dehu/sincronizar.ts).
export const maxDuration = 60;

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const [reqs, vencs, notifs] = await Promise.all([
    fetchRequerimientosPendientes().catch(() => []),
    fetchVencimientos().catch(() => []),
    fetchNotificacionesParaAlertas().catch(() => []),
  ]);
  after(async () => {
    try {
      const admin = createSupabaseAdmin();
      const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
      if (mem) await sincronizarDehu(admin, mem.workspaceId as string);
    } catch (e) { console.error("[alertas] DEHú automática:", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ alertas: construirAlertas(reqs, vencs, new Date(), notifs) }, { headers: { "Cache-Control": "no-store" } });
}
