import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { moverClienteDeOficina, oficinaValida } from "@/lib/oficinas-server";

// El GESTOR edita los datos personales de un cliente desde su ficha (/app/clientes/[id]).
// Autorización: sesión + el cliente se resuelve BAJO RLS (anti-IDOR) antes de tocar nada
// con service_role — un id ajeno al workspace simplemente no existe.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { ficha?: ClienteFicha; oficinaId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Pertenencia al workspace bajo RLS + nombre actual (para resincronizar facturas si cambia).
  const { data: actual } = await supa.from("Cliente").select("id, workspaceId, nombre, apellidos").eq("id", id).maybeSingle();
  if (!actual) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  // Solo claves conocidas de la ficha (nunca escritura arbitraria) — mismo whitelist que el portal.
  const ficha = body.ficha ?? {};
  const patch: Record<string, string> = {};
  for (const k of FICHA_KEYS) {
    const v = (ficha as Record<string, unknown>)[k];
    if (typeof v === "string") patch[k] = v.trim();
  }
  if ("nombre" in patch && !patch.nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  // MULTI-OFICINA: la sede NO forma parte de la ficha (no la rellena el cliente en el
  // portal, la decide el despacho) → clave aparte, con su propia validación.
  // `undefined` = no se toca; `null` o "" = quitar la sede.
  const tocaOficina = "oficinaId" in body;
  const admin = createSupabaseAdmin();
  let oficinaId: string | null = null;
  if (tocaOficina) {
    const bruto = body.oficinaId;
    if (bruto !== null && bruto !== undefined && String(bruto) !== "") {
      oficinaId = String(bruto);
      if (!(await oficinaValida(admin, oficinaId, actual.workspaceId as string))) {
        return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });
      }
    }
  }

  if (Object.keys(patch).length === 0 && !tocaOficina) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  patch.updatedAt = new Date().toISOString();

  const { error } = await admin.from("Cliente").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mover de sede re-estampa TAMBIÉN sus expedientes: si no, el board del otro
  // despacho seguiría mostrando sus trámites bajo la sede antigua.
  if (tocaOficina) await moverClienteDeOficina(admin, id, actual.workspaceId as string, oficinaId);

  // La Factura está denormalizada por clienteNombre (sin FK clienteId). Si el nombre cambia,
  // resincronizamos SOLO las facturas de ESTE cliente, vía sus expedientes — NUNCA por nombre,
  // que reasignaría las facturas de un homónimo del mismo despacho (dos «Juan García» son
  // frecuentes en extranjería). Las facturas manuales sin expediente no se resincronizan
  // (raro); conservan el nombre anterior. Fail-soft con log (no bloquea la edición).
  const nombreAntes = `${actual.nombre ?? ""} ${actual.apellidos ?? ""}`.trim();
  const nombreDespues = `${patch.nombre ?? actual.nombre ?? ""} ${patch.apellidos ?? actual.apellidos ?? ""}`.trim();
  if (nombreDespues && nombreAntes && nombreDespues !== nombreAntes) {
    // 1) Por FK (facturas con clienteId — cubre también familiares y manuales vinculadas).
    //    Defensivo: si la migración factura-cliente-id.sql no está aplicada, se ignora.
    const porFk = await admin.from("Factura").update({ clienteNombre: nombreDespues })
      .eq("clienteId", id).eq("clienteNombre", nombreAntes);
    if (porFk.error && !/clienteId/i.test(porFk.error.message)) {
      console.error("[clientes:PATCH] re-sync facturas (FK) falló", { clienteId: id, error: porFk.error.message });
    }
    // 2) Por expediente (facturas antiguas sin FK) — el camino histórico, intacto.
    const { data: exps } = await admin.from("Expediente").select("id").eq("clienteId", id);
    const expIds = (exps ?? []).map((e) => e.id as string);
    if (expIds.length) {
      const { error: eFac } = await admin.from("Factura").update({ clienteNombre: nombreDespues })
        .in("expedienteId", expIds).eq("clienteNombre", nombreAntes);
      if (eFac) console.error("[clientes:PATCH] re-sync facturas falló", { clienteId: id, error: eFac.message });
    }
  }

  return NextResponse.json({ ok: true });
}

// Eliminación DEFINITIVA de un cliente (pedido por Juan: clientes de prueba o duplicados).
// Misma vara que borrar un expediente: sesión + resolución BAJO RLS (anti-IDOR) + SOLO
// administrador (OWNER/ADMIN).
//
// GUARDA CRÍTICA: el FK Expediente.clienteId es ON DELETE CASCADE — borrar un cliente con
// expedientes ARRASTRARÍA sus documentos, extracciones e historial en silencio. Por eso
// SOLO se permite borrar un cliente SIN expedientes; si tiene, se bloquea con el número.
// Las facturas (documento legal, ligadas por nombre) NUNCA se tocan. Los documentos
// sueltos y los vencimientos del cliente sí se limpian (PII).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: cli } = await supa.from("Cliente").select("id, nombre, apellidos, workspaceId, familiaId").eq("id", id).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });

  const { data: mem } = await supa.from("Membership").select("role").eq("workspaceId", cli.workspaceId).eq("userId", user.id).maybeSingle();
  if (!puedeGestionarEquipo(mem?.role as string | undefined)) {
    return NextResponse.json({ error: "Solo un administrador puede eliminar un cliente." }, { status: 403 });
  }

  // Guarda anti-cascada: no borrar un cliente con expedientes (arrastraría todo).
  const { count } = await supa.from("Expediente").select("id", { count: "exact", head: true }).eq("clienteId", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Este cliente tiene ${count} expediente${count === 1 ? "" : "s"}. Elimínalos o archívalos antes de borrar el cliente.` },
      { status: 409 },
    );
  }
  // Miembro de una familia: se gestiona desde el expediente familiar (evita dejar la
  // familia inconsistente por un borrado suelto).
  if (cli.familiaId) {
    return NextResponse.json(
      { error: "Este cliente pertenece a una familia. Quítalo desde el expediente familiar." },
      { status: 409 },
    );
  }

  const admin = createSupabaseAdmin();

  // Documentos sueltos del cliente (metadato + archivo del bucket privado).
  try {
    const { data: docs } = await admin.from("DocumentoCliente").select("id, storagePath").eq("clienteId", id);
    const paths = (docs ?? []).map((d) => d.storagePath as string | null).filter((p): p is string => Boolean(p));
    if (paths.length) await admin.storage.from("documentos").remove(paths).catch(() => {});
    await admin.from("DocumentoCliente").delete().eq("clienteId", id);
  } catch { /* tabla ausente / sin docs → fail-soft */ }

  // Vigía: los vencimientos del cliente desaparecen con él (PII) — mejor esfuerzo.
  try { await admin.from("Vencimiento").delete().eq("clienteId", id); } catch { /* columnas ausentes → fail-soft */ }

  const { error } = await admin.from("Cliente").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nombre = `${cli.nombre ?? ""} ${cli.apellidos ?? ""}`.trim() || "Cliente";
  return NextResponse.json({ ok: true, nombre });
}
