import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SERVICIO_A_TIPO, TIPO_LABEL } from "@/lib/tramites";

// Le client (portail /j/[token]) confirme son trámite :
// → tipo réel + estado DOCS_PENDIENTES + événement dans l'historial du gestor.
// Authentifié par le token du portail (pas de session : c'est le client final).

export async function POST(req: Request) {
  let body: { token?: string; clave?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const token = body.token?.trim();
  const clave = body.clave?.trim();
  if (!token || !clave) return NextResponse.json({ error: "token y clave requeridos" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp, error: e1 } = await admin
    .from("Expediente")
    .select("id, estado")
    .eq("portalToken", token)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const tipo = SERVICIO_A_TIPO[clave] ?? "OTRO";
  const { error: e2 } = await admin
    .from("Expediente")
    .update({
      tipo,
      // l'expediente démarre vraiment : on attend désormais ses documents
      estado: exp.estado === "BORRADOR" ? "DOCS_PENDIENTES" : exp.estado,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", exp.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: exp.id,
    tipo: "ESTADO_CAMBIADO",
    descripcion: `Eligió: ${TIPO_LABEL[tipo] ?? tipo}`,
  });

  return NextResponse.json({ ok: true, tipo });
}
