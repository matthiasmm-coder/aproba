import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sembrarVencimiento, fechaCaducidadISO } from "@/lib/vencimientos";

// VIGÍA — registra la caducidad de la TIE de uno o varios clientes y siembra sus
// vencimientos (fuente REAL). Amorça el radar sobre la cartera EXISTENTE del despacho:
// desde la ficha del cliente (1 item) o tras un import CSV (lote).
//
// Autorización: los clientes se resuelven BAJO SESIÓN (RLS) en un solo select —
// cualquier id que no pertenezca al workspace simplemente no existe (anti-IDOR).

export const runtime = "nodejs";
const MAX_ITEMS = 500;

export async function POST(req: Request) {
  let body: { items?: { clienteId?: string; fecha?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Normaliza y valida las entradas (fecha ISO plausible, ids presentes).
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .map((it) => ({ clienteId: String(it.clienteId ?? "").trim(), fechaISO: fechaCaducidadISO(String(it.fecha ?? "")) }))
    .filter((it): it is { clienteId: string; fechaISO: string } => Boolean(it.clienteId && it.fechaISO));
  if (!items.length) return NextResponse.json({ error: "No hay caducidades válidas que registrar." }, { status: 400 });

  // Pertenencia al workspace, en UN select bajo RLS.
  const ids = [...new Set(items.map((i) => i.clienteId))];
  const { data: propios, error: eSel } = await supa.from("Cliente").select("id, workspaceId").in("id", ids);
  if (eSel) return NextResponse.json({ error: eSel.message }, { status: 500 });
  const wsDe = new Map((propios ?? []).map((c) => [String(c.id), String(c.workspaceId)]));

  const admin = createSupabaseAdmin();
  let sembrados = 0;
  for (const it of items) {
    const workspaceId = wsDe.get(it.clienteId);
    if (!workspaceId) continue; // no es de este despacho → ignorado
    const { error: eUp } = await admin
      .from("Cliente")
      .update({ fechaCaducidad: it.fechaISO.slice(0, 10), tipoVencimiento: "TIE" })
      .eq("id", it.clienteId);
    if (eUp && !/column|does not exist|schema cache/i.test(eUp.message)) console.error("[caducidad]", eUp.message);
    await sembrarVencimiento(admin, { workspaceId, clienteId: it.clienteId, fecha: it.fechaISO, tipo: "TIE", fuente: "REAL" });
    sembrados += 1;
  }

  return NextResponse.json({ ok: true, sembrados, ignorados: items.length - sembrados });
}
