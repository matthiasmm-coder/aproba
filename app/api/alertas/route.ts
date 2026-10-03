import { NextResponse, after } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { reclamosDeSesion } from "@/lib/supabase/claims";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sincronizarDehu } from "@/lib/dehu/sincronizar";
import { bovedaDisponible } from "@/lib/dehu/boveda";
import { fetchRequerimientosPendientes } from "@/lib/data/requerimientos";
import { fetchVencimientos } from "@/lib/data/vencimientos";
import { fetchNotificacionesParaAlertas } from "@/lib/data/notificaciones-dehu";
import { fetchVerifactuParaAlertas } from "@/lib/data/verifactu-alertas";
import { fetchSolicitudesParaAlertas } from "@/lib/data/solicitudes-cliente";
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
  // getClaims() (29/09/2026) : la cloche relève toutes les 5 min dans chaque onglet ouvert ;
  // getUser() faisait à chaque fois un aller-retour au serveur Auth. Ici on lit en RLS avec
  // ce même JWT : vérifier sa signature en local suffit (même rafraîchissement de session).
  const userId = (await reclamosDeSesion(supabase))?.sub;
  if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const [reqs, vencs, notifs, vfs, sols] = await Promise.all([
    fetchRequerimientosPendientes().catch(() => []),
    fetchVencimientos().catch(() => []),
    fetchNotificacionesParaAlertas().catch(() => []),
    fetchVerifactuParaAlertas().catch(() => []),
    fetchSolicitudesParaAlertas().catch(() => []),
  ]);
  // Sans la clé de la bóveda, aucun certificat ne peut être branché (conectarDehu chiffre avec
  // elle) : rien à synchroniser — on s'épargne Membership + DehuConexion à chaque relevé.
  if (bovedaDisponible()) after(async () => {
    try {
      const admin = createSupabaseAdmin();
      const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", userId).limit(1).maybeSingle();
      if (mem) await sincronizarDehu(admin, mem.workspaceId as string);
    } catch (e) { console.error("[alertas] DEHú automática:", e instanceof Error ? e.message : e); }
  });
  return NextResponse.json({ alertas: construirAlertas(reqs, vencs, new Date(), notifs, vfs, sols) }, { headers: { "Cache-Control": "no-store" } });
}
