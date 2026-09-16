import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { archivarFacturasDesdeAdjuntos } from "@/lib/facturas-recibidas-guardar";
import type { AdjuntoBandeja } from "@/lib/email-entrante-procesar";

export const runtime = "nodejs";
export const maxDuration = 60; // una lectura IA por adjunto

// POST → «Es una factura de proveedor»: los adjuntos pendientes de esta fila de la bandeja
// pasan a Facturas › Recibidas (lectura IA, marcadas «revisar» si algo no se leyó). La fila
// queda resuelta. Validación bajo sesión/RLS antes de tocar admin (anti-IDOR).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: fila, error } = await supabase.from("BandejaEntrada").select("id, workspaceId, adjuntos, estado").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fila) return NextResponse.json({ error: "Email no encontrado." }, { status: 404 });
  const adjuntos = ((fila.adjuntos ?? []) as AdjuntoBandeja[]);
  if (!adjuntos.some((a) => !a.docId)) return NextResponse.json({ error: "Este email no tiene adjuntos por colocar." }, { status: 400 });
  const admin = createSupabaseAdmin();
  try {
    const r = await archivarFacturasDesdeAdjuntos(admin, { workspaceId: fila.workspaceId as string, adjuntos, bandejaId: id, creadoPorId: user.id, forzar: true });
    if (!r.archivadas.length) return NextResponse.json({ error: "No se pudo archivar ninguna factura." }, { status: 400 });
    await admin.from("BandejaEntrada").update({ adjuntos: r.adjuntos, estado: "ASIGNADO", motivo: `${r.archivadas.length} factura(s) recibida(s) archivada(s) a mano`, updatedAt: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true, n: r.archivadas.length, facturas: r.archivadas });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo archivar." }, { status: 400 });
  }
}
