import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";

// Vaciar la agenda de clientes de golpe — el caso real: una importación que salió mal
// y hay que rehacerla. MISMA vara que borrar un cliente uno a uno (app/api/clientes/[id]):
//
//   · solo un ADMINISTRADOR del workspace;
//   · NUNCA un cliente con expedientes: el FK Expediente.clienteId es ON DELETE CASCADE
//     y arrastraría documentos, extracciones e historial en silencio;
//   · NUNCA un miembro de una familia: se gestiona desde el expediente familiar;
//   · las FACTURAS no se tocan jamás (documento legal, con obligación de conservación).
//
// El cliente manda `esperados`: si la cuenta real no coincide, se aborta. Así nadie borra
// 200 fichas creyendo borrar 12 porque otra persona importó entre medias.
export async function POST(req: Request) {
  let body: { confirmacion?: string; esperados?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // El workspace sale de la sesión, jamás del cuerpo de la petición.
  const { data: mem } = await supa.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 404 });
  if (!puedeGestionarEquipo(mem.role as string | undefined)) {
    return NextResponse.json({ error: "Solo un administrador puede vaciar la lista de clientes." }, { status: 403 });
  }
  if ((body.confirmacion ?? "").trim().toUpperCase() !== "ELIMINAR") {
    return NextResponse.json({ error: "Falta la confirmación." }, { status: 400 });
  }

  // Fotografía bajo RLS: quién se puede borrar y quién no, con el motivo.
  const { data: filas, error: eLista } = await supa
    .from("Cliente")
    .select("id, familiaId, expedientes:Expediente(id)");
  if (eLista) return NextResponse.json({ error: eLista.message }, { status: 500 });

  type Fila = { id: string; familiaId: string | null; expedientes: { id: string }[] | null };
  const todos = (filas ?? []) as unknown as Fila[];
  const borrables = todos.filter((c) => !c.familiaId && (c.expedientes?.length ?? 0) === 0);
  const conExpedientes = todos.filter((c) => (c.expedientes?.length ?? 0) > 0).length;
  const enFamilia = todos.filter((c) => c.familiaId && (c.expedientes?.length ?? 0) === 0).length;

  // La pantalla y la base tienen que estar de acuerdo ANTES de borrar nada.
  if (typeof body.esperados === "number" && body.esperados !== borrables.length) {
    return NextResponse.json({
      error: `La lista ha cambiado: ahora hay ${borrables.length} cliente(s) que se pueden borrar y tu pantalla decía ${body.esperados}. Recarga y vuelve a intentarlo.`,
    }, { status: 409 });
  }
  if (!borrables.length) {
    return NextResponse.json({ ok: true, eliminados: 0, conExpedientes, enFamilia });
  }

  const admin = createSupabaseAdmin();
  const ids = borrables.map((c) => c.id);
  const trozos = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  // Documentos sueltos (metadato + fichero del bucket privado) y vencimientos: son PII,
  // desaparecen con la ficha. Mejor esfuerzo, igual que en el borrado unitario.
  for (const lote of trozos(ids, 100)) {
    try {
      const { data: docs } = await admin.from("DocumentoCliente").select("id, storagePath").in("clienteId", lote);
      const paths = (docs ?? []).map((d) => d.storagePath as string | null).filter((p): p is string => Boolean(p));
      if (paths.length) await admin.storage.from("documentos").remove(paths).catch(() => {});
      await admin.from("DocumentoCliente").delete().in("clienteId", lote);
    } catch { /* tabla ausente / sin docs → fail-soft */ }
    try { await admin.from("Vencimiento").delete().in("clienteId", lote); } catch { /* fail-soft */ }
  }

  let eliminados = 0;
  for (const lote of trozos(ids, 100)) {
    const { error } = await admin.from("Cliente").delete().in("id", lote);
    if (error) return NextResponse.json({ error: error.message, eliminados }, { status: 500 });
    eliminados += lote.length;
  }

  console.warn("[clientes:borrar-todos]", { workspaceId: mem.workspaceId, userId: user.id, eliminados, conExpedientes, enFamilia });
  return NextResponse.json({ ok: true, eliminados, conExpedientes, enFamilia });
}
