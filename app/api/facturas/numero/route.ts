import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { siguienteNumero } from "@/lib/factura-numero";
import { prefijoDeExpediente } from "@/lib/facturacion-oficina";

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

export async function GET(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });
  const workspaceId = (mem as { workspaceId: string }).workspaceId;

  // ?expediente= → la série de SA sede (préfixe d'oficina, fase 6). L'id est re-vérifié
  // dans le workspace de l'appelant : personne ne sonde la série du voisin.
  let prefijo = "";
  const expedienteId = new URL(req.url).searchParams.get("expediente")?.trim() ?? "";
  if (expedienteId) {
    const { data: exp } = await admin.from("Expediente").select("id").eq("id", expedienteId).eq("workspaceId", workspaceId).maybeSingle();
    if (exp) prefijo = await prefijoDeExpediente(admin, expedienteId);
  }

  // ?familia= → même règle que /api/familias/[id]/factura : la sede de l'expediente
  // ancre (titular, sinon premier membre avec expediente). Sans ça, l'aperçu du modal
  // montrerait la série commune alors que l'émission utilisera la préfixée.
  const familiaId = new URL(req.url).searchParams.get("familia")?.trim() ?? "";
  if (!prefijo && familiaId) {
    const { data: fam } = await admin.from("Familia").select("id").eq("id", familiaId).eq("workspaceId", workspaceId).maybeSingle();
    if (fam) {
      const { data: miembros } = await admin.from("Cliente")
        .select("parentesco, expedientes:Expediente(id)").eq("familiaId", familiaId).eq("workspaceId", workspaceId);
      type M = { parentesco: string | null; expedientes: { id: string }[] | null };
      const lista = (miembros ?? []) as M[];
      const titular = lista.find((m) => m.parentesco === "TITULAR" && (m.expedientes?.length ?? 0) > 0);
      const ancla = titular?.expedientes?.[0]?.id ?? lista.find((m) => (m.expedientes?.length ?? 0) > 0)?.expedientes?.[0]?.id ?? null;
      if (ancla) prefijo = await prefijoDeExpediente(admin, ancla);
    }
  }

  return NextResponse.json({ numero: await siguienteNumero(admin, workspaceId, new Date().getFullYear(), prefijo) });
}
