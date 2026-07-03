import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { cobrarOverageSiProcede } from "@/lib/overage";

// Creación de un expediente DESDE EL SERVIDOR (antes era client-side). Se hace aquí para
// poder decidir, de forma autoritativa y no falsificable, el cobro del excedente: si el
// despacho supera su límite mensual (Starter 20 / Pro 50 / Business 100) y NO está en prueba
// gratuita, cada expediente extra añade PRECIO_EXPEDIENTE_EXTRA € a su próxima factura Stripe.
// El cobro es best-effort: nunca rompe la creación del expediente.

const uuid = () => crypto.randomUUID();

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: {
    clienteId?: string; nuevo?: { nombre?: string; apellidos?: string; telefono?: string }; familiaId?: string; parentesco?: string;
    // Expediente FAMILIAR: crea/usa una Familia y un titular; un solo expediente la cubre.
    familiaNueva?: { nombre?: string; titular?: { nombre?: string; apellidos?: string; telefono?: string } };
    familiaExistenteId?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  // Workspace del usuario (validado bajo su sesión) — nunca se toma del cliente.
  const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  const admin = createSupabaseAdmin();

  let clienteId = "";
  let expedienteFamiliaId: string | null = null; // si != null → expediente FAMILIAR

  if (body.familiaNueva?.nombre?.trim()) {
    // ── Familia NUEVA: crea la Familia + un titular (representante). El cliente rellenará
    // su ficha y añadirá los demás miembros desde el portal. Un solo expediente la cubre.
    const famId = uuid();
    const { error: eFam } = await admin.from("Familia").insert({ id: famId, workspaceId, nombre: body.familiaNueva.nombre.trim(), updatedAt: new Date().toISOString() });
    if (eFam) return NextResponse.json({ error: /Familia|relation|column|does not exist/i.test(eFam.message) ? "Falta la migración: ejecuta supabase/familia.sql." : eFam.message }, { status: 500 });
    const tit = body.familiaNueva.titular ?? {};
    clienteId = uuid();
    const { error: eCli } = await admin.from("Cliente").insert({
      id: clienteId, workspaceId,
      nombre: tit.nombre?.trim() || body.familiaNueva.nombre.trim(),
      apellidos: tit.apellidos?.trim() || null,
      telefono: tit.telefono?.trim() || null,
      familiaId: famId, parentesco: "TITULAR",
      updatedAt: new Date().toISOString(),
    });
    if (eCli) return NextResponse.json({ error: eCli.message }, { status: 500 });
    expedienteFamiliaId = famId;
  } else if (body.familiaExistenteId?.trim()) {
    // ── Familia EXISTENTE: el expediente se ancla al titular (o primer miembro). ──
    const famId = body.familiaExistenteId.trim();
    const { data: fam } = await admin.from("Familia").select("id").eq("id", famId).eq("workspaceId", workspaceId).maybeSingle();
    if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });
    const { data: miembros } = await admin.from("Cliente").select("id, parentesco").eq("familiaId", famId).eq("workspaceId", workspaceId);
    const titular = (miembros ?? []).find((m) => m.parentesco === "TITULAR") ?? (miembros ?? [])[0] ?? null;
    if (titular) {
      clienteId = titular.id as string;
    } else {
      clienteId = uuid();
      await admin.from("Cliente").insert({ id: clienteId, workspaceId, nombre: "Titular", familiaId: famId, parentesco: "TITULAR", updatedAt: new Date().toISOString() });
    }
    expedienteFamiliaId = famId;
  } else {
    // ── Modo INDIVIDUAL: cliente existente o creado al vuelo. (Compat: familiaId/parentesco
    // sueltos siguen adjuntando el cliente a una familia, sin hacer el expediente familiar.)
    let familiaId = body.familiaId?.trim() || null;
    if (familiaId) {
      const { data: fam } = await admin.from("Familia").select("id").eq("id", familiaId).eq("workspaceId", workspaceId).maybeSingle();
      if (!fam) familiaId = null;
    }
    const familia = familiaId ? { familiaId, parentesco: body.parentesco?.trim() || null } : {};

    clienteId = body.clienteId?.trim() || "";
    if (!clienteId) {
      const nombre = body.nuevo?.nombre?.trim();
      if (!nombre) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });
      clienteId = uuid();
      const { error } = await admin.from("Cliente").insert({
        id: clienteId, workspaceId, nombre,
        apellidos: body.nuevo?.apellidos?.trim() || null,
        telefono: body.nuevo?.telefono?.trim() || null,
        updatedAt: new Date().toISOString(),
        ...familia,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { data: c } = await admin.from("Cliente").select("id").eq("id", clienteId).eq("workspaceId", workspaceId).maybeSingle();
      if (!c) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
      if (familiaId) await admin.from("Cliente").update(familia).eq("id", clienteId).eq("workspaceId", workspaceId);
    }
  }

  // Referencia secuencial del año + inserción, con reintento ante colisión (dos creaciones
  // simultáneas calculan el mismo nº → violación de unicidad → recomputa en vez de 500 crudo).
  const year = new Date().getFullYear();
  const expedienteId = uuid();
  // 32 hex = 128 bits: el token del portal es la ÚNICA credencial de /j y /s (protege
  // pasaporte/NIE). Los tokens antiguos de 10 chars siguen funcionando (columna TEXT).
  const portalToken = uuid().replace(/-/g, "");
  let referencia = "";
  for (let intento = 0; ; intento++) {
    const { data: last } = await admin.from("Expediente").select("referencia").eq("workspaceId", workspaceId).like("referencia", `EXP-${year}-%`).order("referencia", { ascending: false }).limit(1).maybeSingle();
    const n = last ? Number(String(last.referencia).split("-")[2]) + 1 : 1;
    referencia = `EXP-${year}-${String(n).padStart(4, "0")}`;
    const fila: Record<string, unknown> = {
      id: expedienteId, workspaceId, clienteId, referencia, portalToken,
      tipo: "OTRO", estado: "BORRADOR", asignadoAId: user.id, updatedAt: new Date().toISOString(),
      ...(expedienteFamiliaId ? { familiaId: expedienteFamiliaId } : {}),
    };
    let { error: eExp } = await admin.from("Expediente").insert(fila);
    // Repli si la columna Expediente.familiaId no existe aún (migración no aplicada).
    if (eExp && expedienteFamiliaId && /familiaId|column|schema cache|does not exist/i.test(eExp.message)) {
      delete fila.familiaId;
      ({ error: eExp } = await admin.from("Expediente").insert(fila));
    }
    if (!eExp) break;
    if (/duplicate|unique|23505/i.test(eExp.message) && intento < 4) continue; // colisión de referencia → reintenta
    return NextResponse.json({ error: eExp.message }, { status: 500 });
  }

  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "CREADO", descripcion: "Expediente creado", userId: user.id },
    { id: uuid(), expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace del portal generado para el cliente", userId: user.id },
  ]);

  // ── Cobro del excedente (best-effort; jamás rompe la creación) ──
  // Lógica compartida con «Iniciar renovación» (Vigía) — ver lib/overage.ts.
  const extra = await cobrarOverageSiProcede(admin, { workspaceId, expedienteId, referencia });

  return NextResponse.json({ ok: true, expedienteId, referencia, portalToken, extra, familiar: Boolean(expedienteFamiliaId) });
}
