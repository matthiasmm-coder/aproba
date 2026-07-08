import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { PLAN_IDS, plyMax, puedeGestionarEquipo, puedeAsignarRol, ROLES_ASIGNABLES, type PlanId } from "@/lib/planes";
import { getStripe, precioDePlan, stripeDisponible } from "@/lib/billing";

const fail = (msg: string, status = 400, code?: string) => NextResponse.json({ error: msg, code }, { status });

// Gestion d'équipe — toutes les mutations passent ici. L'autorisation est vérifiée
// côté serveur (rôle de l'appelant) AVANT toute écriture, avec le client service_role.
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("No autenticado.", 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Petición inválida.");
  }
  const action = String(body.action ?? "");
  const admin = createSupabaseAdmin();

  // Appartenance + rôle de l'appelant (source de vérité côté serveur).
  const { data: myMem } = await admin
    .from("Membership")
    .select("id, workspaceId, role")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();
  if (!myMem) return fail("No perteneces a ningún despacho.", 403);
  const ws = myMem.workspaceId as string;
  const miRol = myMem.role as string;

  // Plan + nº de miembros actuels.
  const [{ data: sub }, { count: nMiembros }] = await Promise.all([
    admin.from("Subscription").select("*").eq("workspaceId", ws).maybeSingle(),
    admin.from("Membership").select("id", { count: "exact", head: true }).eq("workspaceId", ws),
  ]);
  const plan = (sub as { plan?: string } | null)?.plan ?? "STARTER";
  const total = nMiembros ?? 0;

  // ── Inviter un usuario ─────────────────────────────────────────────────────
  if (action === "invitar") {
    if (!puedeGestionarEquipo(miRol)) return fail("No tienes permiso para invitar.", 403);
    const email = String(body.email ?? "").trim().toLowerCase();
    const nombre = String(body.nombre ?? "").trim();
    const role = String(body.role ?? "GESTOR");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email no válido.");
    if (!ROLES_ASIGNABLES.includes(role as never)) return fail("Rol no válido.");
    if (!puedeAsignarRol(miRol, role)) return fail("No puedes asignar ese rol.", 403);

    const max = plyMax(plan);
    if (total >= max) {
      return fail(`Has alcanzado el límite de tu plan (${max} ${max === 1 ? "usuario" : "usuarios"}). Sube de plan para invitar a más.`, 403, "SEATS");
    }

    // Utilisateur déjà existant ?
    const { data: existente } = await admin.from("User").select("id, nombre, email, avatarUrl").eq("email", email).maybeSingle();
    let userId: string;
    let nombreFinal = nombre;
    let email_final = email;
    let avatarUrl: string | null = null;
    let tempPassword: string | null = null;

    if (existente) {
      userId = (existente as { id: string }).id;
      nombreFinal = (existente as { nombre?: string }).nombre || nombre || email;
      email_final = (existente as { email?: string }).email || email;
      avatarUrl = (existente as { avatarUrl?: string | null }).avatarUrl ?? null;
      const { data: yaMiembro } = await admin.from("Membership").select("id").eq("userId", userId).eq("workspaceId", ws).maybeSingle();
      if (yaMiembro) return fail("Esa persona ya forma parte de tu equipo.", 409);
    } else {
      tempPassword = "Aproba-" + randomBytes(4).toString("hex");
      const { data: creado, error: createError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nombre: nombre || email },
      });
      if (createError || !creado?.user) return fail(createError?.message ?? "No se pudo crear el usuario.");
      userId = creado.user.id;
      nombreFinal = nombre || email;
      email_final = email;
    }

    const membershipId = crypto.randomUUID();
    const { error: memError } = await admin.from("Membership").insert({
      id: membershipId,
      userId,
      workspaceId: ws,
      role,
      createdAt: new Date().toISOString(),
    });
    if (memError) return fail(memError.message);

    return NextResponse.json({
      ok: true,
      miembro: { membershipId, userId, nombre: nombreFinal, email: email_final, avatarUrl, role },
      tempPassword,
    });
  }

  // ── Changer un rôle ────────────────────────────────────────────────────────
  if (action === "rol") {
    if (!puedeGestionarEquipo(miRol)) return fail("No tienes permiso.", 403);
    const membershipId = String(body.membershipId ?? "");
    const role = String(body.role ?? "");
    const { data: target } = await admin.from("Membership").select("id, role, userId, workspaceId").eq("id", membershipId).maybeSingle();
    if (!target || target.workspaceId !== ws) return fail("Miembro no encontrado.", 404);
    if (target.id === myMem.id) return fail("No puedes cambiar tu propio rol.", 403);
    if (target.role === "OWNER") return fail("No se puede modificar al administrador que creó el despacho.", 403);
    if (!puedeAsignarRol(miRol, role)) return fail("No puedes asignar ese rol.", 403);

    const { error } = await admin.from("Membership").update({ role }).eq("id", membershipId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, membershipId, role });
  }

  // ── Retirer un miembro ─────────────────────────────────────────────────────
  if (action === "eliminar") {
    if (!puedeGestionarEquipo(miRol)) return fail("No tienes permiso.", 403);
    const membershipId = String(body.membershipId ?? "");
    const { data: target } = await admin.from("Membership").select("id, role, workspaceId").eq("id", membershipId).maybeSingle();
    if (!target || target.workspaceId !== ws) return fail("Miembro no encontrado.", 404);
    if (target.id === myMem.id) return fail("No puedes quitarte a ti mismo.", 403);
    if (target.role === "OWNER") return fail("No se puede quitar al administrador que creó el despacho.", 403);
    if (!puedeAsignarRol(miRol, target.role)) return fail("No puedes quitar a ese miembro.", 403);

    const { error } = await admin.from("Membership").delete().eq("id", membershipId);
    if (error) return fail(error.message);
    // On conserve la cuenta del usuario (puede pertenecer a otros despachos / reincorporarse).
    return NextResponse.json({ ok: true, membershipId });
  }

  // ── Changer de plan ────────────────────────────────────────────────────────
  if (action === "plan") {
    if (!puedeGestionarEquipo(miRol)) return fail("Solo un administrador puede cambiar el plan.", 403);
    const nuevo = String(body.plan ?? "");
    if (!PLAN_IDS.includes(nuevo as never)) return fail("Plan no válido.");
    const maxNuevo = plyMax(nuevo);
    if (total > maxNuevo) {
      return fail(`Tu equipo tiene ${total} usuarios y el plan ${nuevo} permite ${maxNuevo}. Quita miembros antes de bajar de plan.`, 403, "SEATS");
    }

    // Abonnement Stripe actif → on change le prix là-bas d'abord (prorata) ;
    // le webhook re-confirmera l'état. Sans Stripe : simple mise à jour locale.
    const stripeSubId = (sub as { stripeSubscriptionId?: string | null } | null)?.stripeSubscriptionId;
    if (stripeDisponible() && stripeSubId) {
      try {
        const stripe = getStripe();
        const s = await stripe.subscriptions.retrieve(stripeSubId);
        // Conserva el ciclo actual: un abonado ANUAL que cambia de plan sigue en anual
        // (sin esto pasaría silenciosamente a mensual).
        const ciclo = s.items.data[0]?.price?.recurring?.interval === "year" ? "anual" as const : "mensual" as const;
        await stripe.subscriptions.update(stripeSubId, {
          items: [{ id: s.items.data[0].id, price: await precioDePlan(nuevo as PlanId, ciclo) }],
          proration_behavior: "create_prorations",
        });
      } catch (e) {
        return fail(`No se pudo actualizar la suscripción en Stripe: ${e instanceof Error ? e.message : "error"}`, 502);
      }
    }

    const { error } = await admin.from("Subscription").update({ plan: nuevo }).eq("workspaceId", ws);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, plan: nuevo });
  }

  // ── Renombrar el despacho ──────────────────────────────────────────────────
  // El nombre del Workspace se propaga a TODO: portal del cliente, emails, facturas.
  if (action === "renombrarDespacho") {
    if (!puedeGestionarEquipo(miRol)) return fail("Solo un administrador puede renombrar el despacho.", 403);
    const nombre = String(body.nombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2 || nombre.length > 80) return fail("El nombre debe tener entre 2 y 80 caracteres.");
    const { error } = await admin.from("Workspace").update({ nombre, updatedAt: new Date().toISOString() }).eq("id", ws);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, nombre });
  }

  // ── Renombrar a un miembro ─────────────────────────────────────────────────
  // Cada uno puede cambiar SU nombre; para renombrar a otro hace falta ser admin
  // (y un ADMIN no puede renombrar al OWNER). OJO: User.nombre es la cuenta global
  // de esa persona — el cambio le sigue si algún día pertenece a otro despacho.
  if (action === "renombrar") {
    const membershipId = String(body.membershipId ?? "");
    const nombre = String(body.nombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2 || nombre.length > 80) return fail("El nombre debe tener entre 2 y 80 caracteres.");
    const { data: target } = await admin.from("Membership").select("id, role, userId, workspaceId").eq("id", membershipId).maybeSingle();
    if (!target || target.workspaceId !== ws) return fail("Miembro no encontrado.", 404);
    const esMiPropio = target.userId === user.id;
    if (!esMiPropio) {
      if (!puedeGestionarEquipo(miRol)) return fail("No tienes permiso para renombrar a otros miembros.", 403);
      if (target.role === "OWNER" && miRol !== "OWNER") return fail("No se puede renombrar al administrador que creó el despacho.", 403);
    }
    const { error } = await admin.from("User").update({ nombre }).eq("id", target.userId);
    if (error) return fail(error.message);
    // El saludo del dashboard lee user_metadata.nombre → mantener sincronizado (best-effort).
    try { await admin.auth.admin.updateUserById(target.userId as string, { user_metadata: { nombre } }); } catch { /* la tabla User ya manda */ }
    return NextResponse.json({ ok: true, membershipId, nombre });
  }

  return fail("Acción desconocida.");
}
