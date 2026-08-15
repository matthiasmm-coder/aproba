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

// Une oficina au-delà du forfait = 50 €/mois à ajouter À LA MAIN dans Stripe.
// Automatiser une ligne de facturation récurrente pour un volume nul serait du code
// de paiement risqué sans contrepartie ; un email suffit, et il part TOUJOURS, même
// si l'envoi échoue l'oficina reste créée (fail-soft : jamais bloquant pour le client).
async function avisarOficinaExtra(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any, workspaceId: string, nombreOficina: string, total: number, euros: number,
) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { data: ws } = await admin.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
    const despacho = (ws as { nombre?: string } | null)?.nombre ?? workspaceId;
    const { Resend } = await import("resend");
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com",
      subject: `🏢 ${despacho}: ${total}ª oficina — +${euros} €/mes por añadir en Stripe`,
      text: `«${despacho}» acaba de crear la oficina «${nombreOficina}».\n\n`
        + `Ahora tiene ${total} oficinas: ${OFICINAS_INCLUIDAS} incluidas en Business y `
        + `${total - OFICINAS_INCLUIDAS} ${total - OFICINAS_INCLUIDAS === 1 ? "adicional" : "adicionales"}.\n`
        + `→ Añade +${euros} €/mes (sin IVA) a su suscripción en Stripe. La app NO lo cobra sola.\n\n`
        + `El despacho ya ha visto el aviso del importe en Ajustes → Oficinas.`,
    });
  } catch (e) {
    console.error("[oficinas] aviso de oficina extra no enviado", e instanceof Error ? e.message : e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function avisarBajaOficina(admin: any, workspaceId: string, nombreOficina: string, quedan: number) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { data: ws } = await admin.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
    const despacho = (ws as { nombre?: string } | null)?.nombre ?? workspaceId;
    const { Resend } = await import("resend");
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com",
      subject: `🏢 ${despacho}: baja de oficina — revisa el suplemento en Stripe`,
      text: `«${despacho}» ha eliminado la oficina «${nombreOficina}».\n\n`
        + `${quedan === 1 ? "Le queda 1 oficina" : `Le quedan ${quedan} oficinas`}, dentro de las ${OFICINAS_INCLUIDAS} incluidas en Business.\n`
        + `→ QUITA el suplemento de oficinas de su suscripción en Stripe si lo tenía.`,
    });
  } catch (e) {
    console.error("[oficinas] aviso de baja no enviado", e instanceof Error ? e.message : e);
  }
}

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
    // Au-delà du forfait : l'app prévient (ici et dans Ajustes), elle ne prélève rien.
    const extra = total > OFICINAS_INCLUIDAS ? precioOficinaExtra(total) : null;
    if (extra) await avisarOficinaExtra(admin, ws, nombre, total, extra.euros);

    return NextResponse.json({
      ok: true,
      oficina: { id, nombre, direccion, telefono, orden: filas.length, clientes: 0, miembros: 0 },
      extra,
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

    // Symétrique de la création : si le despacho repasse dans le forfait, il faut
    // RETIRER la ligne Stripe. Sans cet avis, on continuerait à facturer 50 €/mois
    // une oficina qui n'existe plus — l'erreur qu'un client remarque.
    const { count: nOficinas } = await admin.from("Oficina").select("id", { count: "exact", head: true }).eq("workspaceId", ws);
    const quedan = nOficinas ?? 0;
    if (quedan <= OFICINAS_INCLUIDAS) await avisarBajaOficina(admin, ws, o.nombre, quedan);
    return NextResponse.json({ ok: true, oficinas: quedan });
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

  // ── Datos de facturación de una sede (fase 6): identidad fiscal + prefijo de serie ──
  if (action === "facturacion") {
    const o = await mia(String(body.oficinaId ?? ""));
    if (!o) return fail("Oficina no encontrada.", 404);
    const limpio = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
    const prefijo = String(body.prefijoSerie ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || null;
    // El prefijo debe ser único en el despacho: dos sedes con «DG» compartirían serie sin querer.
    if (prefijo) {
      const { data: chocan } = await admin.from("Oficina").select("id")
        .eq("workspaceId", ws).eq("prefijoSerie", prefijo).neq("id", o.id).limit(1);
      if ((chocan ?? []).length) return fail("Ese prefijo de serie ya lo usa otra oficina.", 409);
    }
    const { error } = await admin.from("Oficina").update({
      razonSocial: limpio(body.razonSocial, 160),
      nif: limpio(body.nif, 20),
      domicilio: limpio(body.domicilio, 200),
      emailFacturacion: limpio(body.emailFacturacion, 120),
      prefijoSerie: prefijo,
      updatedAt: new Date().toISOString(),
    }).eq("id", o.id);
    if (error) {
      return fail(/razonSocial|prefijoSerie|column|schema cache|does not exist/i.test(error.message)
        ? "Falta la migración: ejecuta supabase/oficinas-facturacion.sql en Supabase." : error.message, 500);
    }
    return NextResponse.json({ ok: true });
  }

  return fail("Acción desconocida.");
}
