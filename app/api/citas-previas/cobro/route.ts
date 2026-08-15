import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchStripeKeyDeWorkspace } from "@/lib/cobros-tarjeta";

// ¿Qué medios de cobro puede ofrecer este despacho en el email de una cita?
// Solo BOOLEANOS (nunca la clave ni el IBAN): el modal de cita los consulta para
// no prometer al cliente un botón de tarjeta que no existe. Cualquier miembro del
// despacho puede leerlo — a diferencia de /api/ajustes/stripe, que configura y
// exige rol de administrador.

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  // Sonda de CAPACIDAD para la modal (¿ofrecer las casillas?): cuenta cualquier clave
  // del despacho, común O de una sede. El cobro real resuelve luego la clave correcta.
  let tarjeta = false;
  try { tarjeta = Boolean(await fetchStripeKeyDeWorkspace(admin, workspaceId)); } catch { /* sin tarjeta */ }
  if (!tarjeta) {
    try {
      const { data } = await admin.from("StripeCuenta").select("id").eq("workspaceId", workspaceId).eq("activa", true).limit(1);
      tarjeta = Boolean((data ?? []).length);
    } catch { /* tabla vieja sin id → la sonda común ya respondió */ }
  }
  let cuenta = false;
  try {
    const { data } = await admin.from("CuentaBancaria").select("iban").eq("workspaceId", workspaceId).eq("activa", true).limit(1);
    cuenta = Boolean((data ?? [])[0]?.iban);
  } catch { /* sin cuenta */ }

  return NextResponse.json({ tarjeta, cuenta });
}
