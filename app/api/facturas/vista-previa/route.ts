import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { vistaPreviaFacturaManual, type CuerpoDocumento } from "@/lib/factura-manual";

export const dynamic = "force-dynamic";

// VISTA PREVIA de «+ Nueva factura» (01/10/2026, Luis): el mismo cuerpo que POST /api/facturas,
// la misma preparación (importes, receptor, número, oficina) y NADA escrito: ni factura, ni
// número gastado, ni registro VERI*FACTU. Devuelve la factura y el emisor para pintar el papel.
export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 403 });
  const workspaceId = (mem as { workspaceId: string }).workspaceId;

  let body: CuerpoDocumento;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const r = await vistaPreviaFacturaManual(admin, workspaceId, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ factura: r.factura, emisor: r.emisor });
}
