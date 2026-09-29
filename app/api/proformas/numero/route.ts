import { NextResponse } from "next/server";
import { contextoProforma } from "@/lib/proformas-ruta";
import { siguienteNumeroProforma } from "@/lib/factura-numero";

// GET /api/proformas/numero → el número que llevará la próxima proforma (vista previa del
// formulario; el definitivo se da al crearla).
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await contextoProforma();
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  return NextResponse.json({ numero: await siguienteNumeroProforma(c.admin, c.workspaceId) }, { headers: { "Cache-Control": "no-store" } });
}
