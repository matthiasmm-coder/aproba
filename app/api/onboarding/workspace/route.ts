import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_IDS, TIPOS, puedeGestionarEquipo } from "@/lib/planes";

// Crea el despacho en el PRIMER paso del alta (05/09/2026), no en el último.
//
// Antes, create_workspace solo se llamaba en finalizar(): quien abandonaba el wizard
// en el paso 2, 3 o 4 se quedaba con una cuenta sin workspace y todo lo tecleado
// perdido. Medido en 45 días: 3 de 13 altas reales nunca llegaron al final (Antonio
// Porsia, a la 1 de la madrugada, entre ellas). Ahora el despacho existe desde que
// hay un nombre; el resto del wizard es configuración, y toda ella vive en Ajustes.
//
// IDEMPOTENTE a propósito: «Atrás» + «Continuar», un doble clic o una recarga no
// deben crear un segundo workspace. Si ya hay membership, se ACTUALIZA nombre/tipo
// y, mientras la prueba no tenga suscripción Stripe, el plan.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { nombre?: string; tipo?: string; plan?: string };
  const nombre = String(body.nombre ?? "").trim();
  const tipo = String(body.tipo ?? "GESTORIA");
  const plan = String(body.plan ?? "STARTER");
  if (nombre.length < 2) return NextResponse.json({ error: "Indica el nombre de tu despacho." }, { status: 400 });
  if (!TIPOS.some((t) => t.id === tipo)) return NextResponse.json({ error: "Tipo de despacho no válido." }, { status: 400 });
  if (!(PLAN_IDS as readonly string[]).includes(plan)) return NextResponse.json({ error: "Plan no válido." }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();

  if (!mem) {
    // La RPC usa auth.uid(): se llama con el cliente de SESIÓN, nunca con el admin.
    const { data: wsId, error } = await supabase.rpc("create_workspace", { p_nombre: nombre, p_tipo: tipo, p_plan: plan });
    if (error || !wsId) return NextResponse.json({ error: error?.message ?? "No se pudo crear el espacio." }, { status: 500 });
    return NextResponse.json({ ok: true, creado: true, workspaceId: String(wsId) });
  }

  if (!puedeGestionarEquipo(mem.role as string)) return NextResponse.json({ error: "Solo un administrador." }, { status: 403 });
  const ws = mem.workspaceId as string;
  const { error: eWs } = await admin.from("Workspace").update({ nombre, tipo, updatedAt: new Date().toISOString() }).eq("id", ws);
  if (eWs) return NextResponse.json({ error: eWs.message }, { status: 500 });
  // El plan se puede cambiar libremente mientras no haya cobro detrás; con suscripción
  // Stripe viva, el cambio pasa por /api/equipo (action «plan»), que repica el precio.
  const { data: sub } = await admin.from("Subscription").select("estado, stripeSubscriptionId").eq("workspaceId", ws).maybeSingle();
  if (sub?.estado === "TRIAL" && !sub.stripeSubscriptionId) {
    await admin.from("Subscription").update({ plan }).eq("workspaceId", ws);
  }
  return NextResponse.json({ ok: true, creado: false, workspaceId: ws });
}
