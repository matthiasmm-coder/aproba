import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { crearFacturaManual, type CuerpoDocumento } from "@/lib/factura-manual";

// Factura MANUAL («+ Nueva factura»). Hasta el 17/09/2026 el navegador insertaba en
// Factura directamente; ahora nace en el servidor: numeración, totales recalculados y
// registro VERI*FACTU en un único sitio (lib/factura-manual.ts, que usa también la
// conversión de una proforma). El workspace sale de la sesión; la oficina se valida
// contra ese workspace (anti-IDOR) — nadie factura en la serie del vecino.
export const dynamic = "force-dynamic";

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
  const r = await crearFacturaManual(admin, workspaceId, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.respuesta);
}
