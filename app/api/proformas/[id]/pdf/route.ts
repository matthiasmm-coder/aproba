import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { leerProforma, pdfDeProforma } from "@/lib/proformas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/proformas/[id]/pdf → el mismo PDF que recibe el cliente por email.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await contextoProforma(id);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  const p = await leerProforma(c.admin, c.workspaceId, id);
  if (!p) return NextResponse.json({ error: "Proforma no encontrada." }, { status: 404 });
  const pdf = await pdfDeProforma(c.admin, c.workspaceId, p);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="proforma_${p.numero}.pdf"`, "Cache-Control": "no-store" },
  });
}
