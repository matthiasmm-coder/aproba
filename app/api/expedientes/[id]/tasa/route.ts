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
  const { data, error } = await supa.from("Expediente").select("id, tasaPath").eq("id", id).maybeSingle();
  if (error || !data) return { error: NextResponse.json({ error: "No encontrado." }, { status: 404 }) };
  return { supa, exp: data as { id: string; tasaPath: string | null }, userId: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolver(id);
  if ("error" in r) return r.error;
  if (!r.exp.tasaPath) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const { data: blob, error } = await admin.storage.from("documentos").download(r.exp.tasaPath);
  if (error || !blob) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  return new Response(Buffer.from(await blob.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tasa-790-012.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolver(id);
  if ("error" in r) return r.error;
  if (!r.exp.tasaPath) return NextResponse.json({ ok: true }); // ya no hay

  const admin = createSupabaseAdmin();
  try { await admin.storage.from("documentos").remove([r.exp.tasaPath]); } catch { /* fail-soft */ }
  const { error } = await admin.from("Expediente").update({ tasaPath: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: "Tasa 790-012 quitada del expediente", userId: r.userId,
  });
  return NextResponse.json({ ok: true });
}
