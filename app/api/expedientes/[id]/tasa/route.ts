import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Tasa 790-012 guardada del expediente, lado GESTOR (gemelo de seguimiento/[token]/tasa
// con sesión en lugar de token). GET → descarga el PDF oficial guardado (tasaPath).
// DELETE → la quita (chip × en la ficha): borra el archivo del bucket y limpia tasaPath.
// Sesión + el expediente se resuelve BAJO RLS (anti-IDOR).

async function resolver(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  // select defensivo: sin la columna tasaPath (migración pendiente) → 404 limpio.
  let res = await supa.from("Expediente").select("id, tasaPath, familiaId").eq("id", id).maybeSingle();
  if (res.error) res = await supa.from("Expediente").select("id, tasaPath").eq("id", id).maybeSingle() as typeof res;
  if (res.error || !res.data) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404 }) };
  return { supa, exp: res.data as { id: string; tasaPath: string | null; familiaId?: string | null }, userId: user.id };
}

// Tasa NOMINATIVA de un miembro (familia): ruta determinista en el bucket. Anti-IDOR:
// el miembro debe pertenecer a la familia del expediente (resuelto BAJO RLS).
async function rutaNominativa(r: { supa: Awaited<ReturnType<typeof createSupabaseServer>>; exp: { id: string; familiaId?: string | null } }, clienteId: string) {
  if (!r.exp.familiaId) return null;
  const { data: m } = await r.supa.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", r.exp.familiaId).maybeSingle();
  return m ? `${r.exp.id}/tasa-790-012-${clienteId}.pdf` : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolver(id);
  if ("error" in r) return r.error;
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";
  const ruta = clienteId ? await rutaNominativa(r, clienteId) : r.exp.tasaPath;
  if (!ruta) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(ruta);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  return new Response(Buffer.from(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tasa-790-012.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolver(id);
  if ("error" in r) return r.error;
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";
  const admin = createSupabaseAdmin();

  // Nominativa (familia): borra SOLO el archivo del miembro; tasaPath no interviene.
  if (clienteId) {
    const ruta = await rutaNominativa(r, clienteId);
    if (!ruta) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    try { await admin.storage.from("documentos").remove([ruta]); } catch { /* fail-soft */ }
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
      descripcion: "Tasa 790-012 de un miembro quitada del expediente", userId: r.userId,
    });
    return NextResponse.json({ ok: true });
  }

  if (!r.exp.tasaPath) return NextResponse.json({ ok: true }); // ya no hay
  try { await admin.storage.from("documentos").remove([r.exp.tasaPath]); } catch { /* fail-soft */ }
  const { error } = await admin.from("Expediente").update({ tasaPath: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: "Tasa 790-012 quitada del expediente", userId: r.userId,
  });
  return NextResponse.json({ ok: true });
}
