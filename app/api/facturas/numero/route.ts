import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { siguienteNumero, interpretarUltimoNumero, ordinalDeNumero } from "@/lib/factura-numero";
import { puedeGestionarEquipo } from "@/lib/planes";
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

  // ?oficina= → série de CETTE sede (factura manuelle créée depuis sa pastille).
  // Validée contre MON despacho — jamais l'id nu du client.
  if (!prefijo) {
    const oficinaParam = new URL(req.url).searchParams.get("oficina")?.trim() ?? "";
    if (oficinaParam) {
      const { data: ofi } = await admin.from("Oficina").select("prefijoSerie").eq("id", oficinaParam).eq("workspaceId", workspaceId).maybeSingle();
      prefijo = (((ofi as { prefijoSerie?: string | null } | null)?.prefijoSerie) ?? "").trim();
    }
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

// ── ARRANQUE DE SERIE (Luis, Asenjo 21/09/2026) ──────────────────────────────────────
// «Facturaba en Excel: mi última factura de este año es la 0312.» El administrador escribe
// ese último número y la serie sigue desde el siguiente. Mecanismo: el número se consigna en
// FacturaNumeroQuemado (la misma tabla que impide reutilizar el número de una factura
// borrada), y siguienteNumero() —que une vivos y quemados— pasa a devolver max+1.
// La serie solo AVANZA: fijar un número por debajo del máximo actual se rechaza (409),
// porque una numeración correlativa nunca retrocede ni deja huecos rellenables.
// Sin ?oficinaId → serie común del despacho; con oficinaId → la serie de SU prefijo.
export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Sin despacho." }, { status: 403 });
  if (!puedeGestionarEquipo(String((mem as { role?: string }).role ?? ""))) {
    return NextResponse.json({ error: "Solo un administrador puede fijar la numeración de las facturas." }, { status: 403 });
  }
  const workspaceId = (mem as { workspaceId: string }).workspaceId;

  const body = await req.json().catch(() => ({})) as { oficinaId?: string | null; ultimo?: string };
  let prefijo = "";
  const oficinaId = String(body.oficinaId ?? "").trim();
  if (oficinaId) {
    const { data: ofi } = await admin.from("Oficina").select("id, prefijoSerie").eq("id", oficinaId).eq("workspaceId", workspaceId).maybeSingle();
    if (!ofi) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });
    prefijo = String((ofi as { prefijoSerie?: string | null }).prefijoSerie ?? "").trim().toUpperCase();
    if (!prefijo) {
      return NextResponse.json({ error: "Esta oficina no tiene prefijo de serie guardado: guarda primero el prefijo, o fija el número en los datos de la gestoría (serie común)." }, { status: 409 });
    }
  }

  const year = new Date().getFullYear();
  const res = interpretarUltimoNumero(String(body.ultimo ?? ""), year, prefijo);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });

  const siguienteActual = await siguienteNumero(admin, workspaceId, year, prefijo);
  const maxActual = ordinalDeNumero(siguienteActual) - 1;
  if (res.n < maxActual) {
    return NextResponse.json({
      error: `La serie ya va por el nº ${maxActual}: la siguiente factura será la ${siguienteActual}. Una serie solo avanza (numeración correlativa), nunca retrocede.`,
      siguiente: siguienteActual,
    }, { status: 409 });
  }
  if (res.n === maxActual) return NextResponse.json({ ok: true, siguiente: siguienteActual, sinCambios: true });

  const { error } = await admin.from("FacturaNumeroQuemado").upsert(
    { id: crypto.randomUUID(), workspaceId, numero: res.numero },
    { onConflict: "workspaceId,numero", ignoreDuplicates: true },
  );
  if (error) {
    const falta = /FacturaNumeroQuemado|relation|does not exist|schema cache|PGRST205/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/factura-numeros-quemados.sql en Supabase." : error.message }, { status: 500 });
  }
  const siguiente = await siguienteNumero(admin, workspaceId, year, prefijo);
  return NextResponse.json({ ok: true, siguiente, ultimo: res.numero });
}
