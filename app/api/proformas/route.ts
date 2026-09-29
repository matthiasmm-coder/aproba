import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { crearProforma, type CuerpoProforma } from "@/lib/proformas-servidor";

// POST /api/proformas → una FACTURA PROFORMA (pedido de Juan, 29/09/2026): mismo formulario y
// mismos cálculos que una factura manual, pero serie propia (PRO-2026-0001) y ningún efecto
// fiscal. Ver lib/proformas.ts.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await contextoProforma();
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  let body: CuerpoProforma;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const r = await crearProforma(c.admin, { workspaceId: c.workspaceId, userId: c.userId, body });
  return r.ok ? NextResponse.json({ ok: true, proforma: r.proforma }) : NextResponse.json({ error: r.error }, { status: r.status });
}
