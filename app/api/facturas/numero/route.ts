import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { siguienteNumero } from "@/lib/factura-numero";

// Prochain numéro de la série du despacho.
//
// La page « nueva factura » le calculait DANS LE NAVIGATEUR. Deux ennuis : elle
// utilisait le tri lexicographique (faux au-delà de 9 999 factures dans l'année), et
// surtout la numérotation n'avait pas de point de vérité unique — impossible d'y
// brancher une série par oficina sans corriger le même bug à six endroits.
//
// Le workspace vient de la SESSION, jamais du client : personne ne numérote chez
// le voisin en changeant un paramètre.
export const dynamic = "force-dynamic";

export async function GET() {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });

  return NextResponse.json({ numero: await siguienteNumero(admin, (mem as { workspaceId: string }).workspaceId) });
}
