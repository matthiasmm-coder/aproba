import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { actualizarProforma, anularProforma, borrarProforma, type CuerpoProforma } from "@/lib/proformas-servidor";

// PATCH  /api/proformas/[id] → { accion: "anular" } o los campos del formulario (editarla
//        mientras no se haya convertido ni anulado).
// DELETE /api/proformas/[id] → solo si nunca salió del despacho (o ya estaba anulada).
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoProforma(id);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  let body: CuerpoProforma & { accion?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const r = body.accion === "anular"
    ? await anularProforma(c.admin, { workspaceId: c.workspaceId, id })
    : await actualizarProforma(c.admin, { workspaceId: c.workspaceId, id, body });
  return r.ok ? NextResponse.json({ ok: true, proforma: r.proforma }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoProforma(id);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  const r = await borrarProforma(c.admin, { workspaceId: c.workspaceId, id });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
