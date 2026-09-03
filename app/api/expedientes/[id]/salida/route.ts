import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { aplicarSalida } from "@/lib/cierre";
import { SALIDAS, type Salida } from "@/lib/types";
import { baseUrlFromRequest } from "@/lib/base-url";

// Reclasificar un expediente ARCHIVADO cuando llega la resolución (flujo v4): cambia la
// salida (y el estado que la representa), sin avisos al cliente y sin restaurarlo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { salida?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const salida = SALIDAS.find((s) => s.key === body.salida)?.key as Salida | undefined;
  if (!salida) return NextResponse.json({ error: "Salida desconocida." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const r = await aplicarSalida(createSupabaseAdmin(), {
    id, workspaceId: String(exp.workspaceId), userId: user.id, salida,
    archivar: false, avisar: false, baseUrl: baseUrlFromRequest(req),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, estado: r.estado, salidaGuardada: r.salidaGuardada });
}
