import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { OFICINAS_INCLUIDAS, precioOficinaExtra } from "@/lib/oficinas";

// MULTI-OFICINA — toutes les mutations passent ici. Autorisation vérifiée côté serveur
// (rôle de l'appelant) AVANT toute écriture, puis écriture en service_role.
// Anti-IDOR : on ne fait jamais confiance à un id envoyé par le client — chaque
// oficina/membership visé est relu et son workspaceId comparé à celui de l'appelant.

const fail = (msg: string, status = 400, code?: string) => NextResponse.json({ error: msg, code }, { status });

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Petición inválida."); }
  const action = String(body.action ?? "");
  const admin = createSupabaseAdmin();

  const { data: myMem } = await admin
    .from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!myMem) return fail("No perteneces a ningún despacho.", 403);
  const ws = myMem.workspaceId as string;
  if (!puedeGestionarEquipo(myMem.role as string)) return fail("Solo los administradores pueden gestionar las oficinas.", 403);

  const { data: sub } = await admin.from("Subscription").select("plan").eq("workspaceId", ws).maybeSingle();
  const plan = (sub as { plan?: string } | null)?.plan ?? "STARTER";

  // Une oficina visée existe-t-elle DANS mon despacho ? (jamais l'id nu du client)
  async function mia(oficinaId: string) {
    const { data } = await admin.from("Oficina").select("id, nombre, workspaceId").eq("id", oficinaId).maybeSingle();
    if (!data || (data as { workspaceId: string }).workspaceId !== ws) return null;
    return data as { id: string; nombre: string };
  }

  // ── Crear ────────────────────────────────────────────────────────────────────
  if (action === "crear") {
    if (plan !== "BUSINESS") {
      return fail("Multi-oficina está incluido en el plan Business.", 403, "PLAN");
    }
    const nombre = String(body.nombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2) return fail("Pon un nombre a la oficina.");

    const { data: existentes } = await admin.from("Oficina").select("id, nombre").eq("workspaceId", ws);
    const filas = (existentes ?? []) as { id: string; nombre: string }[];
    if (filas.some((o) => o.nombre.toLowerCase() === nombre.toLowerCase())) {
      return fail("Ya tienes una oficina con ese nombre.", 409);
    }

    const id = crypto.randomUUID();
    const direccion = String(body.direccion ?? "").trim() || null;
    const telefono = String(body.telefono ?? "").trim() || null;
    const { error } = await admin.from("Oficina").insert({
      id, workspaceId: ws, nombre, direccion, telefono,
      orden: filas.length,
      updatedAt: new Date().toISOString(),
    });
    if (error) return fail("No se pudo crear la oficina.", 500);

    // On renvoie ce qui a VRAIMENT été inséré : l'UI l'affiche sans recharger, et
    // renvoyer null en dur ferait mentir la ligne (« Sin dirección » sur une oficina
    // qui en a une) jusqu'au prochain refresh.
    const total = filas.length + 1;
    return NextResponse.json({
      ok: true,
      oficina: { id, nombre, direccion, telefono, orden: filas.length, clientes: 0, miembros: 0 },
      extra: total > OFICINAS_INCLUIDAS ? precioOficinaExtra(total) : null,
    });
  }

  // ── Renombrar / editar ───────────────────────────────────────────────────────
  if (action === "editar") {
    const o = await mia(String(body.oficinaId ?? ""));
    if (!o) return fail("Oficina no encontrada.", 404);
    const nombre = String(body.nombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2) return fail("Pon un nombre a la oficina.");
    const { error } = await admin.from("Oficina").update({
      nombre,
      direccion: String(body.direccion ?? "").trim() || null,
      telefono: String(body.telefono ?? "").trim() || null,
      updatedAt: new Date().toISOString(),
    }).eq("id", o.id);
    if (error) return fail("No se pudo guardar.", 500);
    return NextResponse.json({ ok: true, nombre });
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────────
  // Refus si des clients y sont rattachés : la FK les détacherait en silence
  // (ON DELETE SET NULL) et personne ne saurait que 200 clients ont perdu leur sede.
  if (action === "eliminar") {
    const o = await mia(String(body.oficinaId ?? ""));
    if (!o) return fail("Oficina no encontrada.", 404);
    const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("oficinaId", o.id);
    if ((count ?? 0) > 0) {
      return fail(`«${o.nombre}» tiene ${count} ${count === 1 ? "cliente asignado" : "clientes asignados"}. Muévelos a otra oficina antes de eliminarla.`, 409, "CON_CLIENTES");
    }
    const { error } = await admin.from("Oficina").delete().eq("id", o.id);
    if (error) return fail("No se pudo eliminar.", 500);
    return NextResponse.json({ ok: true });
  }

  // ── Asignar un miembro del equipo a una oficina (null = todas) ────────────────
  if (action === "asignar") {
    const membershipId = String(body.membershipId ?? "");
    const { data: mem } = await admin.from("Membership").select("id, workspaceId").eq("id", membershipId).maybeSingle();
    if (!mem || (mem as { workspaceId: string }).workspaceId !== ws) return fail("Miembro no encontrado.", 404);

    const bruto = body.oficinaId;
    let oficinaId: string | null = null;
    if (bruto !== null && bruto !== undefined && String(bruto) !== "") {
      const o = await mia(String(bruto));
      if (!o) return fail("Oficina no encontrada.", 404);
      oficinaId = o.id;
    }
    const { error } = await admin.from("Membership").update({ oficinaId }).eq("id", membershipId);
    if (error) return fail("No se pudo asignar.", 500);
    return NextResponse.json({ ok: true, oficinaId });
  }

  return fail("Acción desconocida.");
}
