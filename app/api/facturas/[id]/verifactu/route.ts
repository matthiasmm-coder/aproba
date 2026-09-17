import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchRegistrosDeFacturas, refrescarRegistro, registrarAlta, registrarAnulacion, type FilaRegistro } from "@/lib/verifactu-envio";
import { registroBloqueaEdicion } from "@/lib/verifactu";

// VERI*FACTU de UNA factura. GET: sus registros (alta/anulación), refrescando el estado si
// lleva un rato «Pendiente». POST: reintentar el envío (tras completar la ficha del cliente
// o un fallo de red). La factura se resuelve bajo RLS; las escrituras van con service_role.
export const dynamic = "force-dynamic";

async function facturaDelUsuario(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const { data: f } = await supa.from("Factura").select("id, estado").eq("id", id).maybeSingle();
  if (!f) return { error: "Factura no encontrada.", status: 404 as const };
  return { supa, f: f as { id: string; estado: string } };
}

function serializar(regs: FilaRegistro[]) {
  const alta = regs.find((r) => r.tipo === "ALTA") ?? null;
  const anulacion = regs.find((r) => r.tipo === "ANULACION") ?? null;
  return { alta, anulacion, congelada: registroBloqueaEdicion(alta) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await facturaDelUsuario(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const admin = createSupabaseAdmin();
  let regs: FilaRegistro[] = [];
  try { regs = (await fetchRegistrosDeFacturas(r.supa, [id]))[id] ?? []; } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  // Pendiente desde hace > 30 s → preguntar a Verifacti (la AEAT contesta en ~1-2 min).
  for (const reg of regs) {
    if (reg.estado === "PENDIENTE" && reg.uuid && reg.enviadoAt && Date.now() - new Date(reg.enviadoAt).getTime() > 30_000) {
      try { reg.estado = await refrescarRegistro(admin, reg); } catch { /* se verá en el siguiente barrido */ }
    }
  }
  return NextResponse.json(serializar(regs));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await facturaDelUsuario(id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  let body: { accion?: string };
  try { body = await req.json(); } catch { body = {}; }
  const admin = createSupabaseAdmin();
  try {
    const res = body.accion === "anular"
      ? await registrarAnulacion(admin, id)
      : await registrarAlta(admin, id, { reintento: true });
    const regs = (await fetchRegistrosDeFacturas(admin, [id]))[id] ?? [];
    return NextResponse.json({ ...res, ...serializar(regs) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
