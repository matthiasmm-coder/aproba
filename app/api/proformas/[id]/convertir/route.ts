import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { convertirProforma } from "@/lib/proformas-servidor";

export const dynamic = "force-dynamic";

// POST /api/proformas/[id]/convertir { cobrada, metodo } → la FACTURA: número siguiente de
// la serie de facturas, fecha de hoy, los mismos importes y el mismo receptor. Con
// `cobrada`, además queda pagada (método elegido). Una proforma se convierte una sola vez.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoProforma(id);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  const body = (await req.json().catch(() => ({}))) as { cobrada?: unknown; metodo?: unknown };
  const metodo = (["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"] as const).find((m) => m === body.metodo);
  const r = await convertirProforma(c.admin, { workspaceId: c.workspaceId, id, cobrada: body.cobrada === true, metodo });
  return r.ok ? NextResponse.json({ ok: true, proforma: r.proforma, facturaId: r.facturaId, numero: r.numero }) : NextResponse.json({ error: r.error }, { status: r.status });
}
