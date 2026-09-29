import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { enviarProforma } from "@/lib/proformas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/proformas/[id]/enviar { para } → email al cliente con la proforma en PDF, el
// importe a pagar y, si la sede tiene IBAN, cómo pagar por transferencia.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoProforma(id);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  const body = (await req.json().catch(() => ({}))) as { para?: unknown };
  const r = await enviarProforma(c.admin, { workspaceId: c.workspaceId, id, para: String(body.para ?? "") });
  return r.ok ? NextResponse.json({ ok: true, proforma: r.proforma, simulado: r.simulado }) : NextResponse.json({ error: r.error }, { status: r.status });
}
