import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { oficinaDelCliente, contextoDeCreacion, sedeElegible } from "@/lib/oficinas-server";
import { enviarPropuestaRenovacion } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { sugerirServicioRenovacion, serviciosElegibles, importesParaCliente, ESTADOS_EN_VUELO, NOMBRE_SERVICIO_NUEVO } from "@/lib/renovacion-servicio";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// VIGÍA — «Proponer renovación» (11/09/2026): a partir de CUALQUIER vencimiento (TIE,
// pasaporte, NIE…), crea el expediente de renovación con un servicio del catálogo,
// marca el vencimiento PROPUESTA y envía al cliente la propuesta con el trámite, el
// precio y dos botones (aceptar / rechazar). NO se emite ninguna factura ni se cobra
// overage hasta que el cliente acepte (app/api/portal/renovacion).
// El servicio: sugerencia «segura» del catálogo por defecto (TIE → Renovación de TIE)
// → sale sola; sugerencia «probable» (servicio propio que encaja por nombre) o ninguna
// → 400 requiereServicio y el gestor VALIDA, elige o CREA el servicio en el diálogo
// (body.servicioClave, o body.nuevoServicio {label, anticipo, resto} → ServicioConfig).
// GET devuelve lo que el diálogo necesita: servicios, sugerencia y nombre propuesto.
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { venc, error } = await vencimientoBajoSesion(id);
  if (error || !venc) return error;
  const admin = createSupabaseAdmin();
  const { servicios } = await catalogoDelCliente(admin, String(venc.workspaceId), String(venc.clienteId));
  const { data: cli } = await admin.from("Cliente").select("nombre, apellidos").eq("id", String(venc.clienteId)).maybeSingle();
  const sug = sugerirServicioRenovacion(String(venc.tipo ?? ""), servicios);
  return NextResponse.json({
    tipo: venc.tipo, fecha: venc.fecha,
    clienteNombre: [cli?.nombre, cli?.apellidos].filter(Boolean).join(" "),
    sugerido: sug?.id ?? null,
    certeza: sug?.certeza ?? null,
    nombreNuevo: NOMBRE_SERVICIO_NUEVO[String(venc.tipo ?? "").toUpperCase()] ?? "Renovación",
    servicios: servicios.map((s) => ({ id: s.id, label: s.label, precioOculto: Boolean(s.precioOculto), ...importesParaCliente(s) })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // El body se lee UNA vez (antes se leía dentro de la rama de oficina).
  const body = (await req.json().catch(() => ({}))) as { oficinaId?: unknown; servicioClave?: unknown; nuevoServicio?: { label?: unknown; anticipo?: unknown; resto?: unknown } };

  const { user, venc, error } = await vencimientoBajoSesion(id);
  if (error || !venc || !user) return error;

  // Idempotencia: propuesta ya enviada o renovación en marcha → devolvemos esa (doble clic, recarga…).
  if (venc.expedienteRenovacionId && (ESTADOS_EN_VUELO as readonly string[]).includes(String(venc.estado))) {
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
  let servicios = serviciosElegibles(await fetchServiciosDeWorkspace(admin, workspaceId, oficinaId).catch(() => []));

  // Servicio NUEVO creado desde el diálogo (p. ej. «Renovación de pasaporte», 60 + 40 €):
  // se guarda en el catálogo de la sede como un servicio más — la próxima vez saldrá solo.
  let pedido = typeof body.servicioClave === "string" && body.servicioClave.trim() ? body.servicioClave.trim() : null;
  const nuevo = body.nuevoServicio && typeof body.nuevoServicio === "object" ? body.nuevoServicio : null;
  if (nuevo) {
    const label = String(nuevo.label ?? "").trim().slice(0, 80);
    const anticipo = Math.max(0, Math.round((Number(nuevo.anticipo) || 0) * 100) / 100);
    const resto = Math.max(0, Math.round((Number(nuevo.resto) || 0) * 100) / 100);
    if (!label) return NextResponse.json({ error: "Ponle un nombre al servicio nuevo.", requiereServicio: true }, { status: 400 });
    const clave = "srv_" + Math.random().toString(36).slice(2, 9);
    const fila: Record<string, unknown> = {
      id: oficinaId ? `svc_${workspaceId}_${oficinaId}_${clave}` : `svc_${workspaceId}_${clave}`, // mismo id determinista que Ajustes (lib/config-browser)
      ...(oficinaId ? { oficinaId } : {}), workspaceId, clave, label, descripcion: null, docs: [], active: true, anticipo, resto,
      citaPresencial: false, citaQuien: null, noIncluye: null, suplidos: [], porcentaje: null, porcentajeSobre: null, precioOculto: false, categoria: null,
      orden: servicios.length, updatedAt: new Date().toISOString(),
    };
    let { error: eSv } = await admin.from("ServicioConfig").insert(fila);
    if (eSv && /categoria|column|schema cache/i.test(eSv.message)) { const { categoria: _c, ...sinCat } = fila; void _c; ({ error: eSv } = await admin.from("ServicioConfig").insert(sinCat)); }
    if (eSv) return NextResponse.json({ error: `No se pudo crear el servicio: ${eSv.message}` }, { status: 500 });
    servicios = serviciosElegibles(await fetchServiciosDeWorkspace(admin, workspaceId, oficinaId).catch(() => []));
    pedido = clave;
  }

  if (pedido && !servicios.some((s) => s.id === pedido)) {
    return NextResponse.json({ error: "Ese servicio no está activo en el catálogo de esta oficina.", requiereServicio: true }, { status: 400 });
  }
  // Sin clave del gestor: solo una sugerencia SEGURA sale sola. Una «probable» (servicio
  // propio que encaja por nombre) o ninguna → el gestor la valida en el diálogo.
  const sug = pedido ? null : sugerirServicioRenovacion(String(venc.tipo ?? ""), servicios);
  const servicioClave = pedido ?? (sug?.certeza === "seguro" ? sug.id : null);
  if (!servicioClave) {
    return NextResponse.json({
      error: sug ? "Confirma el servicio de la renovación." : "Elige o crea el servicio de la renovación: ninguno del catálogo corresponde a este vencimiento.",
      requiereServicio: true, sugerido: sug?.id ?? null,
    }, { status: 400 });
  }
  const servicio = servicios.find((s) => s.id === servicioClave)!;

  // Sin email no hay propuesta: no se crea expediente ni se marca nada (el cliente no
  // podría aceptar ni rechazar lo que no recibe).
  const { data: cliEmail } = await admin.from("Cliente").select("email").eq("id", clienteId).maybeSingle();
  if (!(cliEmail as { email?: string | null } | null)?.email?.trim()) {
    return NextResponse.json({ error: "El cliente no tiene email: añádelo en su ficha y vuelve a intentarlo. No se ha propuesto nada.", sinEmail: true }, { status: 400 });
  }

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
  // expediente. Se reclama desde PENDIENTE/AVISADO, desde RECHAZADA (proponer de nuevo:
  // el expediente anterior quedó archivado y desenlazado) y desde un PROPUESTA/TRAMITANDO
  // huérfano (expediente borrado → SetNull).
  const ahora = new Date().toISOString();
  const claimar = (conColumnas: boolean) => admin
    .from("Vencimiento")
    .update(conColumnas ? { estado: "PROPUESTA", expedienteRenovacionId: expedienteId, propuestaAt: ahora, respuestaCliente: null, respondidoAt: null, updatedAt: ahora } : { estado: "PROPUESTA", expedienteRenovacionId: expedienteId, updatedAt: ahora })
    .eq("id", venc.id)
    .is("expedienteRenovacionId", null)
    .not("estado", "in", "(HECHO,TRAMITANDO)")
    .select("id");
  let { data: claim, error: eClaim } = await claimar(true);
  if (eClaim && /propuestaAt|respuestaCliente|respondidoAt|column|schema cache/i.test(eClaim.message)) {
    // Sin la migración no hay dónde guardar la respuesta del cliente: se corta y se dice.
    await admin.from("Expediente").delete().eq("id", expedienteId);
    return NextResponse.json({ error: "Falta la migración supabase/vigia-propuesta.sql (respuesta del cliente a la renovación)." }, { status: 500 });
  }
  if (eClaim || !claim?.length) {
    // Perdimos la carrera (u otro error): retiramos el expediente recién creado, aún sin
    // eventos ni emails, y devolvemos la propuesta del ganador.
    await admin.from("Expediente").delete().eq("id", expedienteId);
    if (eClaim) return NextResponse.json({ error: eClaim.message }, { status: 500 });
    const { data: otro } = await admin.from("Vencimiento").select("expedienteRenovacionId").eq("id", venc.id).maybeSingle();
    return NextResponse.json({ ok: true, yaExistia: true, expedienteId: otro?.expedienteRenovacionId ?? null });
  }

  const fechaTxt = new Date(venc.fecha as string).toLocaleDateString("es-ES");
  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "COMENTARIO", descripcion: `🔄 Renovación propuesta desde Vigía (${venc.tipo} caduca el ${fechaTxt}) · pendiente de que el cliente acepte`, userId: user.id },
    { id: uuid(), expedienteId, tipo: "NOTIFICACION_ENVIADA", descripcion: "Enlace del portal generado para el cliente", userId: user.id },
  ]);

  // Propuesta al cliente en su idioma: trámite, precio y botones aceptar/rechazar.
  // Ni factura ni overage aquí: llegan cuando ACEPTA (app/api/portal/renovacion).
  const aviso = await enviarPropuestaRenovacion(admin, {
    expedienteId,
    tipoVencimiento: String(venc.tipo ?? "TIE"),
    fechaCaducidad: venc.fecha as string,
    baseUrl: baseUrlFromRequest(req),
    servicio: { id: servicio.id, label: servicio.label, ...importesParaCliente(servicio) },
  });

  if (!aviso.enviado && aviso.motivo !== "simulado") {
    // El cliente no ha recibido nada → se deshace la propuesta entera (aún sin factura ni
    // overage): fuera el expediente y sus eventos, el vencimiento vuelve a como estaba.
    await admin.from("ExpedienteEvento").delete().eq("expedienteId", expedienteId);
    await admin.from("Vencimiento").update({ estado: String(venc.estado), expedienteRenovacionId: null, propuestaAt: null, updatedAt: new Date().toISOString() }).eq("id", venc.id).eq("expedienteRenovacionId", expedienteId);
    await admin.from("Expediente").delete().eq("id", expedienteId);
    return NextResponse.json({ error: aviso.motivo === "sin_email" ? "El cliente no tiene email: añádelo en su ficha y vuelve a intentarlo. No se ha propuesto nada." : "No se pudo enviar la propuesta al cliente. No se ha propuesto nada: inténtalo de nuevo.", sinEmail: aviso.motivo === "sin_email" }, { status: aviso.motivo === "sin_email" ? 400 : 502 });
  }
  return NextResponse.json({ ok: true, propuesta: true, expedienteId, referencia, avisoEnviado: aviso.enviado, motivoAviso: aviso.motivo ?? null, servicioClave });
}
