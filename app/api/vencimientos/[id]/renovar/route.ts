import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { oficinaDelCliente, contextoDeCreacion, sedeElegible } from "@/lib/oficinas-server";
import { enviarAvisoRenovacion } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { sugerirServicioRenovacion, serviciosElegibles } from "@/lib/renovacion-servicio";
import { totalDe, r2 } from "@/lib/facturas";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// VIGÍA — «Iniciar renovación»: a partir de un vencimiento, crea el expediente de
// renovación pre-anclado al cliente + avisa al cliente EN SU IDIOMA (enlace /j) +
// marca el vencimiento TRAMITANDO. La factura de anticipo la pide la UI después vía
// POST /api/pagos (misma lógica financiera de siempre, sin duplicarla aquí).
//
// SERVICIO (11/09/2026): la renovación nace SIEMPRE con un servicio del catálogo —
// el que manda el gestor (body.servicioClave, elegido en el diálogo) o la sugerencia
// por tipo de vencimiento (lib/renovacion-servicio). Sin ninguno → 400 y el gestor
// elige; nunca se crea un expediente «sin trámite» que el cliente no sabe qué es.
// GET devuelve lo que el diálogo necesita: servicios elegibles + sugerencia.
//
// Autorización: el vencimiento se resuelve BAJO SESIÓN (RLS) — si el usuario no es
// miembro del workspace, no existe (anti-IDOR). Solo después se usa el admin.
const SELECT_VENC = "id, workspaceId, clienteId, fecha, tipo, estado, expedienteRenovacionId";

async function vencimientoBajoSesion(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { user: null, venc: null, error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: venc, error: eV } = await supa.from("Vencimiento").select(SELECT_VENC).eq("id", id).maybeSingle();
  if (eV) return { user, venc: null, error: NextResponse.json({ error: eV.message }, { status: 500 }) };
  if (!venc) return { user, venc: null, error: NextResponse.json({ error: "Vencimiento no encontrado." }, { status: 404 }) };
  return { user, venc, error: null };
}

// Catálogo de la SEDE del cliente (cascade multi-oficina), solo servicios activos.
async function catalogoDelCliente(admin: ReturnType<typeof createSupabaseAdmin>, workspaceId: string, clienteId: string) {
  const oficinaId = await oficinaDelCliente(admin, clienteId);
  const servicios = await fetchServiciosDeWorkspace(admin, workspaceId, oficinaId).catch(() => []);
  return { oficinaId, servicios: serviciosElegibles(servicios) };
}

// Importes que verá el cliente: honorarios CON IVA (misma cuenta que el portal /j:
// IVA sobre cada pago) + tasas/suplidos (sin IVA). «Precio a consultar» → sin importes.
function importesParaCliente(s: { precio: number; anticipo: number; resto: number; precioOculto?: boolean; suplidos?: { importe: number }[] }) {
  if (s.precioOculto) return { total: null, anticipo: null };
  const tasas = (s.suplidos ?? []).reduce((a, x) => a + (Number(x.importe) || 0), 0);
  const total = r2(totalDe(s.anticipo) + totalDe(s.resto) + tasas);
  // Servicio sin tarifa (0 €) → sin importes: «0,00 €» en un email es peor que nada.
  if (total <= 0) return { total: null, anticipo: null };
  const anticipo = s.anticipo > 0 && s.resto > 0 ? r2(totalDe(s.anticipo) + tasas) : null;
  return { total, anticipo };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { venc, error } = await vencimientoBajoSesion(id);
  if (error || !venc) return error;
  const admin = createSupabaseAdmin();
  const { servicios } = await catalogoDelCliente(admin, String(venc.workspaceId), String(venc.clienteId));
  const { data: cli } = await admin.from("Cliente").select("nombre, apellidos").eq("id", String(venc.clienteId)).maybeSingle();
  return NextResponse.json({
    tipo: venc.tipo, fecha: venc.fecha,
    clienteNombre: [cli?.nombre, cli?.apellidos].filter(Boolean).join(" "),
    sugerido: sugerirServicioRenovacion(String(venc.tipo ?? ""), servicios),
    servicios: servicios.map((s) => ({ id: s.id, label: s.label, precioOculto: Boolean(s.precioOculto), ...importesParaCliente(s) })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // El body se lee UNA vez (antes se leía dentro de la rama de oficina).
  const body = (await req.json().catch(() => ({}))) as { oficinaId?: unknown; servicioClave?: unknown };

  const { user, venc, error } = await vencimientoBajoSesion(id);
  if (error || !venc || !user) return error;

  // Idempotencia: si ya hay una renovación en marcha, devolvemos esa (doble clic, recarga…).
  if (venc.expedienteRenovacionId) {
    return NextResponse.json({ ok: true, yaExistia: true, expedienteId: venc.expedienteRenovacionId });
  }
  if (venc.estado === "HECHO") {
    return NextResponse.json({ error: "Este vencimiento ya está renovado." }, { status: 409 });
  }

  const admin = createSupabaseAdmin();
  const workspaceId = String(venc.workspaceId);
  const clienteId = String(venc.clienteId);
  // Cliente-empresa: la renovación de un trabajador se factura a su empresa, como el original.
  let empresaCliente: string | null = null;
  try {
    const { data: ce } = await admin.from("Cliente").select("empresaId").eq("id", clienteId).maybeSingle();
    empresaCliente = ((ce as { empresaId?: string | null } | null)?.empresaId ?? null) || null;
  } catch { empresaCliente = null; }
  let oficinaId = await oficinaDelCliente(admin, clienteId); // multi-oficina
  // Cliente SIN oficina: la renovación lo ADOPTA en la sede elegida (body.oficinaId,
  // mandado por la UI) o en la pastilla activa. Desde «Todas» con ≥2 oficinas → 400:
  // el expediente y la factura de anticipo no deben nacer sin sede por accidente.
  if (!oficinaId) {
    const sedeExplicita: string | null = typeof body.oficinaId === "string" && body.oficinaId.trim() ? body.oficinaId.trim() : null;
    if (sedeExplicita && !(await sedeElegible(admin, user.id, sedeExplicita, workspaceId))) {
      return NextResponse.json({ error: "Esa oficina no es válida para tu usuario." }, { status: 400 });
    }
    const ctx = await contextoDeCreacion(admin, user.id, workspaceId);
    const sede = sedeExplicita ?? ctx.sede;
    if (!sede && ctx.requerida) {
      return NextResponse.json({ error: "Este cliente no tiene oficina. Estás en «Todas» (solo lectura): elige la pastilla de la oficina que llevará la renovación." }, { status: 400 });
    }
    if (sede) {
      try { await admin.from("Cliente").update({ oficinaId: sede }).eq("id", clienteId).eq("workspaceId", workspaceId); } catch { /* columna sin migrar */ }
      oficinaId = sede;
    }
  }
  const expedienteId = uuid();

  // SERVICIO de la renovación: el elegido por el gestor (validado contra el catálogo
  // activo de la sede) o la sugerencia por tipo. Sin ninguno → 400 y el diálogo pide
  // elegir. Un pasaporte YA NO cae en «Renovación de TIE», y nada nace sin trámite.
  const servicios = serviciosElegibles(await fetchServiciosDeWorkspace(admin, workspaceId, oficinaId).catch(() => []));
  const pedido = typeof body.servicioClave === "string" && body.servicioClave.trim() ? body.servicioClave.trim() : null;
  if (pedido && !servicios.some((s) => s.id === pedido)) {
    return NextResponse.json({ error: "Ese servicio no está activo en el catálogo de esta oficina.", requiereServicio: true }, { status: 400 });
  }
  const servicioClave = pedido ?? sugerirServicioRenovacion(String(venc.tipo ?? ""), servicios);
  if (!servicioClave) {
    return NextResponse.json({ error: "Elige el servicio de la renovación: ninguno del catálogo corresponde a este vencimiento.", requiereServicio: true }, { status: 400 });
  }
  const servicio = servicios.find((s) => s.id === servicioClave)!;

  // (1) Crear el expediente PRIMERO (la FK de Vencimiento.expedienteRenovacionId exige que
  // exista). Mismo patrón que POST /api/expedientes: referencia secuencial con reintento,
  // portalToken de 128 bits. Aún sin efectos visibles para el cliente (eventos/aviso después).
  const year = new Date().getFullYear();
  const portalToken = uuid().replace(/-/g, "");
  let referencia = "";
  for (let intento = 0; ; intento++) {
    const { data: last } = await admin
      .from("Expediente")
      .select("referencia")
      .eq("workspaceId", workspaceId)
      .like("referencia", `EXP-${year}-%`)
      .order("referencia", { ascending: false })
      .limit(1)
      .maybeSingle();
    const n = last ? Number(String(last.referencia).split("-")[2]) + 1 : 1;
    referencia = `EXP-${year}-${String(n).padStart(4, "0")}`;
    const fila: Record<string, unknown> = {
      id: expedienteId, workspaceId, clienteId, referencia, portalToken,
      tipo: "RENOVACION", estado: "EN_PREPARACION", asignadoAId: user.id, updatedAt: new Date().toISOString(),
      servicioClave,
      ...(oficinaId ? { oficinaId } : {}), // multi-oficina: heredada del cliente
      ...(empresaCliente ? { empresaId: empresaCliente } : {}),
    };
    let { error: eExp } = await admin.from("Expediente").insert(fila);
    if (eExp && fila.empresaId && /empresaId/i.test(eExp.message)) { delete fila.empresaId; ({ error: eExp } = await admin.from("Expediente").insert(fila)); }
    // Repli si oficinaId no está migrada: la renovación se crea igual.
    if (eExp && oficinaId && /oficinaId|column|schema cache|does not exist/i.test(eExp.message)) {
      delete fila.oficinaId;
      ({ error: eExp } = await admin.from("Expediente").insert(fila));
    }
    if (!eExp) break;
    if (/duplicate|unique/i.test(eExp.message) && intento < 4) continue; // referencia en carrera → recalcula
    return NextResponse.json({ error: eExp.message }, { status: 500 }); // vencimiento intacto
  }

  // (2) CLAIM ATÓMICO anti-carrera: solo UNA petición concurrente consigue enlazar su
  // expediente (las demás ven expedienteRenovacionId ya puesto). Cubre el caso "TRAMITANDO
  // huérfano" (expediente borrado → SetNull): vuelve a ser reclamable.
  const { data: claim, error: eClaim } = await admin
    .from("Vencimiento")
    .update({ estado: "TRAMITANDO", expedienteRenovacionId: expedienteId, updatedAt: new Date().toISOString() })
    .eq("id", venc.id)
    .is("expedienteRenovacionId", null)
    .neq("estado", "HECHO")
    .select("id");
  if (eClaim || !claim?.length) {
    // Perdimos la carrera (u otro error): retiramos el expediente recién creado, aún sin
    // eventos ni cobros ni emails, y devolvemos la renovación del ganador.
    await admin.from("Expediente").delete().eq("id", expedienteId);
    if (eClaim) return NextResponse.json({ error: eClaim.message }, { status: 500 });
    const { data: otro } = await admin.from("Vencimiento").select("expedienteRenovacionId").eq("id", venc.id).maybeSingle();
    return NextResponse.json({ ok: true, yaExistia: true, expedienteId: otro?.expedienteRenovacionId ?? null });
  }

  const fechaTxt = new Date(venc.fecha as string).toLocaleDateString("es-ES");
  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "COMENTARIO", descripcion: `🔄 Renovación iniciada desde Vigía (${venc.tipo} caduca el ${fechaTxt})`, userId: user.id },
    { id: uuid(), expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace del portal generado para el cliente", userId: user.id },
  ]);

  // La renovación es un expediente normal: cuenta para la cuota mensual (overage compartido).
  const extra = await cobrarOverageSiProcede(admin, { workspaceId, expedienteId, referencia });

  // Aviso al cliente en su idioma (mejor esfuerzo — sin email no rompe).
  const aviso = await enviarAvisoRenovacion(admin, {
    expedienteId,
    tipoVencimiento: String(venc.tipo ?? "TIE"),
    fechaCaducidad: venc.fecha as string,
    baseUrl: baseUrlFromRequest(req),
    // El cliente lee QUÉ trámite es y CUÁNTO cuesta (antes: «tu TIE caduca», sin más).
    servicio: { id: servicio.id, label: servicio.label, ...importesParaCliente(servicio) },
  });

  return NextResponse.json({ ok: true, expedienteId, referencia, extra, avisoEnviado: aviso.enviado, servicioClave });
}
