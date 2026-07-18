import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SERVICIO_A_TIPO, TIPO_LABEL } from "@/lib/tramites";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { asignacionValida } from "@/lib/multi-servicio";

// Le client (portail /j/[token]) confirme son trámite :
// → tipo réel + estado DOCS_PENDIENTES + événement dans l'historial du gestor.
// Authentifié par le token du portail (pas de session : c'est le client final).

export async function POST(req: Request) {
  let body: { token?: string; clave?: string; asignacion?: unknown };
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
    .select("id, estado, workspaceId, familiaId")
    .eq("portalToken", token)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  if (!exp) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  // La clave debe ser un servicio del despacho: una clave arbitraria dejaría el
  // principal «huérfano» y la factura automática cobraría solo los extras (multi-
  // servicio suma tarifas de los servicios RESUELTOS). Mismo criterio que el gestor.
  let catalogo: { id: string }[] = [];
  try {
    catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId as string);
    if (catalogo.length && !catalogo.some((s) => s.id === clave)) {
      return NextResponse.json({ error: "Servicio no válido" }, { status: 400 });
    }
  } catch { /* sin catálogo legible → comportamiento anterior */ }

  // Familia heterogénea: el TITULAR asigna los trámites por miembro desde el portal.
  // Se filtra contra la realidad (solo servicios del catálogo y miembros de SU familia)
  // y se derivan principal + extras de la propia asignación — mismo modelo que el gestor.
  let extraCols: Record<string, unknown> = {};
  if (exp.familiaId && body.asignacion !== undefined) {
    const bruta = asignacionValida(body.asignacion);
    if (bruta) {
      const { data: fam } = await admin.from("Cliente").select("id").eq("familiaId", exp.familiaId);
      const idsFam = new Set(((fam ?? []) as { id: string }[]).map((m) => m.id));
      const filtrada: Record<string, string[]> = {};
      for (const [k, ids] of Object.entries(bruta)) {
        if (catalogo.length && !catalogo.some((s) => s.id === k)) continue;
        const propios = ids.filter((x) => idsFam.has(x));
        if (propios.length) filtrada[k] = propios;
      }
      if (filtrada[clave]) {
        const claves = [clave, ...Object.keys(filtrada).filter((k) => k !== clave)];
        extraCols = { serviciosExtra: claves.slice(1), serviciosAsignacion: filtrada };
      }
    }
  }

  const tipo = SERVICIO_A_TIPO[clave] ?? "OTRO";
  let { error: e2 } = await admin
    .from("Expediente")
    .update({
      tipo,
      servicioClave: clave, // mémorise le service choisi (gère les services custom, sans équivalent enum)
      // l'expediente démarre vraiment : on attend désormais ses documents
      estado: exp.estado === "BORRADOR" ? "DOCS_PENDIENTES" : exp.estado,
      updatedAt: new Date().toISOString(),
      ...extraCols,
    })
    .eq("id", exp.id);
  // Repli: migración serviciosAsignacion sin ejecutar → guardar al menos el trámite.
  if (e2 && Object.keys(extraCols).length && /serviciosAsignacion|column|schema cache/i.test(e2.message)) {
    e2 = (await admin.from("Expediente").update({
      tipo, servicioClave: clave,
      estado: exp.estado === "BORRADOR" ? "DOCS_PENDIENTES" : exp.estado,
      updatedAt: new Date().toISOString(),
    }).eq("id", exp.id)).error;
  }
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: exp.id,
    tipo: "ESTADO_CAMBIADO",
    descripcion: `Eligió: ${TIPO_LABEL[tipo] ?? tipo}`,
  });

  return NextResponse.json({ ok: true, tipo });
}
