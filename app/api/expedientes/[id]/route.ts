import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// Eliminación DEFINITIVA de un expediente (pedido por Juan: expedientes de prueba o
// creados por error). Autorización en dos capas: sesión + el expediente se resuelve BAJO
// RLS (anti-IDOR), y SOLO un administrador (OWNER/ADMIN) puede borrar — misma vara que
// las demás rutas destructivas (equipo, billing, ajustes). La acción más irreversible de
// la app no puede tener menos guardas que renombrar el despacho.
//
// Cascada: el esquema SÍ tiene FKs ON DELETE CASCADE (Documento/Extraction/Formulario/
// ExpedienteEvento → schema.sql) — la cascada manual de abajo es defensa en profundidad
// (y cubre lo que las FKs no alcanzan: Storage, Factura→desvincular, Vigía→liberar).
// Las facturas emitidas son documentos legales: NUNCA se borran, solo se desvinculan.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa.from("Expediente").select("id, referencia, workspaceId").eq("id", id).maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Solo administradores: borrar destruye también el historial (auditoría) del expediente.
  const { data: mem } = await supa.from("Membership").select("role").eq("workspaceId", exp.workspaceId).eq("userId", user.id).maybeSingle();
  if (!puedeGestionarEquipo(mem?.role as string | undefined)) {
    return NextResponse.json({ error: "Solo un administrador puede eliminar un expediente." }, { status: 403 });
  }

  const admin = createSupabaseAdmin();

  // Storage: todos los archivos del expediente (documentos + tasas) viven bajo <id>/.
  // Las re-subidas acumulan objetos (ruta con timestamp) → paginar hasta vaciar, no un
  // solo list(200): si no, un expediente muy retrabajado dejaría PII huérfana en el bucket.
  try {
    for (let i = 0; i < 50; i++) {
      const { data: files } = await admin.storage.from("documentos").list(id, { limit: 200 });
      if (!files?.length) break;
      const { error: eRm } = await admin.storage.from("documentos").remove(files.map((f) => `${id}/${f.name}`));
      if (eRm) break; // evita un bucle infinito si el remove falla
    }
  } catch { /* sin archivos o bucket ausente: no bloquea */ }

  // Extraction de los documentos del expediente, luego los documentos.
  const { data: docs } = await admin.from("Documento").select("id").eq("expedienteId", id);
  const docIds = (docs ?? []).map((d) => d.id as string);
  if (docIds.length) await admin.from("Extraction").delete().in("documentoId", docIds);
  await admin.from("Documento").delete().eq("expedienteId", id);

  await admin.from("ExpedienteEvento").delete().eq("expedienteId", id);
  // Revisiones Centinela (tabla puede no existir → fail-soft).
  try { await admin.from("CentinelaRevision").delete().eq("expedienteId", id); } catch { /* */ }

  // Facturas: se conservan (documento legal), solo se desvinculan.
  await admin.from("Factura").update({ expedienteId: null }).eq("expedienteId", id);

  // Vigía: una renovación TRAMITANDO vuelve a PENDIENTE (el radar no se apaga);
  // los vencimientos sembrados por este expediente se desvinculan pero se conservan
  // (la caducidad de la tarjeta es real independientemente del expediente).
  try {
    await admin.from("Vencimiento")
      .update({ estado: "PENDIENTE", expedienteRenovacionId: null, updatedAt: new Date().toISOString() })
      .eq("expedienteRenovacionId", id).eq("estado", "TRAMITANDO");
    await admin.from("Vencimiento").update({ expedienteId: null }).eq("expedienteId", id);
  } catch { /* columnas Vigía ausentes → fail-soft */ }

  const { error } = await admin.from("Expediente").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, referencia: exp.referencia });
}
