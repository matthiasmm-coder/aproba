import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarConfirmacionCitaPrevia } from "@/lib/notificaciones";
import { crearReunionMeet, actualizarReunionMeet, borrarReunionMeet } from "@/lib/google-calendar";
import { fetchStripeKeyDeWorkspace } from "@/lib/cobros-tarjeta";
import { datosFiscalesDeCliente, r2, IVA } from "@/lib/facturas";
import { baseUrlFromRequest } from "@/lib/base-url";
import { siguienteNumero } from "@/lib/factura-numero";

// Citas previas (consulta): el gestor crea una cita con un cliente (existente o nombre
// libre). Todo bajo RLS (sesión): solo su workspace. Si la tabla no está migrada, el
// insert da error y se informa con un mensaje claro.

const ESTADOS = ["pendiente", "confirmada", "realizada", "cancelada"];

// Videollamada, dos modos (petición Matthias 07/08):
//   · "auto"   — Aproba crea la reunión de GOOGLE MEET en el calendario del gestor
//                (requiere la integración Google conectada en Ajustes).
//   · "manual" — el gestor pega el enlace de CUALQUIER herramienta (Meet, Teams,
//                Zoom…): solo se exige una URL https válida; el proveedor se deduce
//                del host para etiquetar el email.
// En ambos: email del cliente, hora y duración OBLIGATORIOS (la invitación que
// recibe el cliente debe poder abrirse). El lugar se fuerza a «Videollamada».
type CuerpoCita = { clienteId?: string; nombre?: string; email?: string; telefono?: string; fecha?: string; hora?: string; duracion?: number; precio?: number; lugar?: string; motivo?: string; notas?: string; notificar?: boolean; videoModo?: string; videoProveedor?: string; videoEnlace?: string; cobrar?: boolean; cobroTransferencia?: boolean; cobroTarjeta?: boolean };

// ─── Cobro de la cita ────────────────────────────────────────────────────────
// Marcar «cobrar» emite una FACTURA de verdad (numeración del año, IVA, listado de
// Facturas, cobro con tarjeta y conciliación ya existentes) en vez de inventar un
// circuito de pago paralelo para las citas. El importe tecleado por el gestor es lo
// que paga el cliente: IVA INCLUIDO — es el que ya se le enseñaba en el email.
type Cobro = NonNullable<Parameters<typeof enviarConfirmacionCitaPrevia>[0]["cobro"]>;

async function emitirFacturaCita(
  admin: ReturnType<typeof createSupabaseAdmin>,
  o: { workspaceId: string; clienteId: string | null; nombre: string; precio: number; fecha: string; motivo: string | null },
): Promise<{ facturaId: string; numero: string; total: number } | null> {
  const total = r2(o.precio);
  if (!(total > 0)) return null;
  const base = r2(total / (1 + IVA));
  const iva = r2(total - base);
  const year = new Date().getFullYear();
  const numero = await siguienteNumero(admin, o.workspaceId, year);

  const [a, m, d] = o.fecha.split("-");
  const concepto = `Cita previa — ${d}/${m}/${a}${o.motivo ? ` · ${o.motivo}` : ""}`.slice(0, 200);

  let clienteDatos: ReturnType<typeof datosFiscalesDeCliente> = null;
  if (o.clienteId) {
    const { data: cli } = await admin.from("Cliente")
      .select("numeroDocumento, pasaporte, via, numeroVia, piso, codigoPostal, municipio, provincia")
      .eq("id", o.clienteId).maybeSingle();
    clienteDatos = datosFiscalesDeCliente(cli as Parameters<typeof datosFiscalesDeCliente>[0]);
  }

  const facturaId = crypto.randomUUID();
  const ahora = new Date();
  const fila: Record<string, unknown> = {
    id: facturaId, workspaceId: o.workspaceId, expedienteId: null,
    ...(o.clienteId ? { clienteId: o.clienteId } : {}),
    numero, clienteNombre: o.nombre, concepto,
    baseImponible: base, iva, total,
    estado: "EMITIDA", origen: "MANUAL", momento: null, metodoPago: "TRANSFERENCIA",
    fechaEmision: ahora.toISOString(), fechaVencimiento: new Date(ahora.getTime() + 14 * 864e5).toISOString(),
    lineas: [{ concepto, base }], suplidos: [],
    ...(clienteDatos ? { clienteDatos } : {}),
  };
  // Replis por migración ausente, uno a uno (nunca se pierde la factura entera).
  let { error } = await admin.from("Factura").insert(fila);
  if (error && fila.clienteDatos && /clienteDatos/i.test(error.message)) {
    delete fila.clienteDatos;
    ({ error } = await admin.from("Factura").insert(fila));
  }
  if (error && fila.clienteId && /clienteId/i.test(error.message)) {
    delete fila.clienteId;
    ({ error } = await admin.from("Factura").insert(fila));
  }
  if (error) { console.error("[citas/factura]", error.message); return null; }
  return { facturaId, numero, total };
}

// Foto del gestor que lleva la cita (la creó o la edita): el cliente reconoce a su
// persona de contacto en vez de unas iniciales. Best-effort: sin foto, iniciales.
async function fotoDeUsuario(admin: ReturnType<typeof createSupabaseAdmin>, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("User").select("avatarUrl").eq("id", userId).maybeSingle();
    return (data as { avatarUrl?: string | null } | null)?.avatarUrl ?? null;
  } catch { return null; }
}

// Medios de pago REALES del despacho: nunca se anuncia al cliente un botón de
// tarjeta sin clave Stripe, ni un IBAN que no existe.
async function datosCobro(
  admin: ReturnType<typeof createSupabaseAdmin>,
  workspaceId: string,
  quiere: { transferencia: boolean; tarjeta: boolean },
): Promise<{ transferencia: boolean; tarjeta: boolean; cuenta: Cobro["cuenta"] }> {
  let cuenta: Cobro["cuenta"] = null;
  if (quiere.transferencia) {
    const { data } = await admin.from("CuentaBancaria").select("titular, iban, banco").eq("workspaceId", workspaceId).eq("activa", true).limit(1);
    cuenta = ((data ?? [])[0] as Cobro["cuenta"]) ?? null;
  }
  let tarjeta = false;
  if (quiere.tarjeta) {
    try { tarjeta = Boolean(await fetchStripeKeyDeWorkspace(admin, workspaceId)); } catch { tarjeta = false; }
  }
  return { transferencia: quiere.transferencia, tarjeta, cuenta };
}

const proveedorDeEnlace = (u: string): "meet" | "teams" | "otro" => {
  try {
    const h = new URL(u).host.toLowerCase();
    if (h === "meet.google.com") return "meet";
    if (h === "teams.live.com" || h === "teams.microsoft.com" || h.endsWith(".teams.microsoft.com")) return "teams";
  } catch { /* URL inválida → la valida el caller */ }
  return "otro";
};

function validarVideo(body: CuerpoCita): { modo: "auto" | "manual" | null; prov: "meet" | "teams" | "otro" | null; enlace: string | null; error?: string } {
  // Compat: la modal anterior enviaba videoProveedor sin videoModo → modo manual.
  const modo = body.videoModo === "auto" || body.videoModo === "manual" ? body.videoModo
    : body.videoProveedor === "meet" || body.videoProveedor === "teams" ? "manual"
    : null;
  if (!modo) return { modo: null, prov: null, enlace: null };
  if (!String(body.email ?? "").trim()) return { modo, prov: null, enlace: null, error: "Para una videollamada, el email del cliente es obligatorio." };
  if (!/^\d{2}:\d{2}$/.test(String(body.hora ?? "").trim())) return { modo, prov: null, enlace: null, error: "Para una videollamada, la hora es obligatoria." };
  if (!Number.isFinite(body.duracion) || Number(body.duracion) <= 0) return { modo, prov: null, enlace: null, error: "Para una videollamada, la duración es obligatoria." };
  if (modo === "auto") return { modo, prov: "meet", enlace: null }; // el enlace lo crea el servidor
  const enlace = String(body.videoEnlace ?? "").trim();
  // El enlace es OPCIONAL (pedido de Matthias): marcar la cita como videollamada no
  // debe bloquear al gestor si todavía no tiene la sala. Se guarda como videollamada
  // sin enlace («otro» hace de marca para que al reabrir la casilla siga marcada) y
  // el enlace se añade editando la cita. Si SÍ escribe algo, debe ser una URL válida:
  // un enlace roto en la invitación del cliente es peor que ninguno.
  if (!enlace) return { modo, prov: "otro", enlace: null };
  let valida = /^https:\/\/\S{4,480}$/.test(enlace);
  if (valida) { try { new URL(enlace); } catch { valida = false; } }
  if (!valida) return { modo, prov: null, enlace: null, error: "Pega el enlace https:// de la reunión (Meet, Teams, Zoom…) o déjalo vacío para añadirlo más tarde." };
  return { modo, prov: proveedorDeEnlace(enlace), enlace };
}

// Replis pre-migración GRANULARES: cada migración pendiente quita SOLO sus columnas.
// (Si falta google-calendar.sql pero cita-videollamada.sql ya está, el proveedor y el
// enlace SÍ se persisten — un repli de todo-o-nada los perdía sin necesidad.)
const sinGoogleEvento = <T extends { googleEventoId?: unknown }>(fila: T) => {
  const { googleEventoId: _ge, ...resto } = fila;
  return resto;
};
const sinVideo = <T extends { videoProveedor?: unknown; videoEnlace?: unknown; googleEventoId?: unknown }>(fila: T) => {
  const { videoProveedor: _vp, videoEnlace: _ve, googleEventoId: _ge, ...resto } = fila;
  return resto;
};
const faltaColumnaGoogle = (msg: string) => /googleEventoId/i.test(msg);
const faltaColumnaVideo = (msg: string) => /videoProveedor|videoEnlace/i.test(msg);

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: CuerpoCita;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const nombre = (body.nombre ?? "").trim();
  const fecha = (body.fecha ?? "").trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });
  const video = validarVideo(body);
  if (video.error) return NextResponse.json({ error: video.error }, { status: 400 });

  const { data: mem } = await supabase.from("Membership").select("workspaceId, Workspace(nombre)").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const gestoria = (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace)?.nombre ?? "Tu gestoría";

  // Modo automático: crear la reunión de Meet ANTES del insert — si Google falla,
  // el gestor recibe un mensaje accionable y puede pasar al modo manual sin perder nada.
  let googleEventoId: string | null = null;
  if (video.modo === "auto") {
    const r = await crearReunionMeet(createSupabaseAdmin(), mem.workspaceId as string, {
      titulo: `Cita — ${nombre}`,
      fecha,
      hora: String(body.hora).trim(),
      duracion: Math.round(Number(body.duracion)),
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 502 });
    video.enlace = r.enlace;
    googleEventoId = r.eventoId;
  }

  const fila = {
    id: crypto.randomUUID(),
    workspaceId: mem.workspaceId as string,
    clienteId: body.clienteId?.trim() || null,
    nombre,
    email: body.email?.trim() || null,
    telefono: body.telefono?.trim() || null,
    fecha,
    hora: body.hora?.trim() || null,
    duracion: Number.isFinite(body.duracion) && Number(body.duracion) > 0 ? Math.round(Number(body.duracion)) : null,
    precio: Number.isFinite(body.precio) && Number(body.precio) >= 0 ? Number(body.precio) : null,
    lugar: video.prov ? "Videollamada" : (body.lugar?.trim() || null),
    motivo: body.motivo?.trim() || null,
    notas: body.notas?.trim() || null,
    estado: "confirmada",
    asignadoAId: user.id,
    videoProveedor: video.prov,
    videoEnlace: video.enlace,
    googleEventoId,
  };

  let { error } = await supabase.from("CitaPrevia").insert(fila);
  if (error && faltaColumnaGoogle(error.message)) ({ error } = await supabase.from("CitaPrevia").insert(sinGoogleEvento(fila)));
  if (error && faltaColumnaVideo(error.message)) ({ error } = await supabase.from("CitaPrevia").insert(sinVideo(fila)));
  if (error) {
    const falta = /relation .*CitaPrevia.* does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/cita-previa.sql." : error.message }, { status: 500 });
  }

  // Cobro opt-in: factura real + instrucciones de pago en el email. Sin email del
  // cliente no se emite nada (no habría dónde mandarle la factura).
  let cobro: Cobro | null = null;
  if (body.cobrar && fila.email && fila.precio && fila.precio > 0) {
    const admin = createSupabaseAdmin();
    const emitida = await emitirFacturaCita(admin, {
      workspaceId: mem.workspaceId as string, clienteId: fila.clienteId, nombre,
      precio: fila.precio, fecha, motivo: fila.motivo,
    });
    if (emitida) {
      const medios = await datosCobro(admin, mem.workspaceId as string, {
        transferencia: body.cobroTransferencia !== false,
        tarjeta: Boolean(body.cobroTarjeta),
      });
      cobro = { ...emitida, baseUrl: baseUrlFromRequest(req), ...medios };
      // Vínculo cita → factura: al editar la cita no se emite una segunda.
      const { error: eLink } = await supabase.from("CitaPrevia").update({ facturaId: emitida.facturaId }).eq("id", fila.id);
      if (eLink) console.error("[citas/facturaId]", eLink.message); // falta cita-cobro.sql: la factura ya existe igualmente
    }
  }

  let avisado = false;
  if (body.notificar && fila.email) {
    const avatarUrl = await fotoDeUsuario(createSupabaseAdmin(), user.id);
    avisado = await enviarConfirmacionCitaPrevia({ nombre, email: fila.email, gestoria, fecha, hora: fila.hora, duracion: fila.duracion, precio: fila.precio, lugar: fila.lugar, motivo: fila.motivo, videoProveedor: video.prov, videoEnlace: video.enlace, citaId: fila.id, cobro, avatarUrl });
  }
  return NextResponse.json({ ok: true, id: fila.id, avisado, facturaEmitida: Boolean(cobro) });
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { id?: string; estado?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const estado = (body.estado ?? "").trim();
  if (!id || !ESTADOS.includes(estado)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { error } = await supabase.from("CitaPrevia").update({ estado }).eq("id", id); // RLS: solo su workspace
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, estado });
}

// Una cita (para editar). RLS: solo si es del workspace del usuario.
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  const sel = (cols: string) => supabase.from("CitaPrevia").select(cols).eq("id", id).maybeSingle();
  let res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, duracion, precio, lugar, motivo, notas, videoProveedor, videoEnlace");
  if (res.error) res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, duracion, precio, lugar, motivo, notas");
  if (res.error) res = await sel("id, clienteId, nombre, email, telefono, fecha, hora, lugar, motivo, notas");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  if (!res.data) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  return NextResponse.json(res.data);
}

// Editar una cita.
export async function PUT(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: CuerpoCita & { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const id = (body.id ?? "").trim();
  const nombre = (body.nombre ?? "").trim();
  const fecha = (body.fecha ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Falta la fecha de la cita." }, { status: 400 });
  const video = validarVideo(body);
  if (video.error) return NextResponse.json({ error: video.error }, { status: 400 });

  const { data: mem } = await supabase.from("Membership").select("workspaceId, Workspace(nombre)").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const gestoria = (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace)?.nombre ?? "Tu gestoría";
  const wsId = mem.workspaceId as string;

  // Fila anterior (bajo RLS): necesaria para el ciclo de vida del evento de Google.
  const selPrev = (cols: string) => supabase.from("CitaPrevia").select(cols).eq("id", id).maybeSingle();
  let prevRes = await selPrev("id, videoEnlace, googleEventoId");
  if (prevRes.error) prevRes = await selPrev("id, videoEnlace");
  if (prevRes.error) prevRes = await selPrev("id");
  if (prevRes.error) return NextResponse.json({ error: prevRes.error.message }, { status: 500 });
  if (!prevRes.data) return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  const prev = prevRes.data as unknown as { id: string; videoEnlace?: string | null; googleEventoId?: string | null };

  // Ciclo de vida del evento Google Calendar del gestor (best-effort salvo la creación):
  //   auto + evento previo → se REPROGRAMA y se conserva el mismo enlace de Meet;
  //   auto sin evento      → se CREA (fallo de Google = 502 accionable, nada se pisa);
  //   manual con evento    → mismo enlace: reprogramar; enlace nuevo: borrar el evento;
  //   sin videollamada     → borrar el evento si lo había.
  const admin = createSupabaseAdmin();
  const horaStr = String(body.hora ?? "").trim();
  const durNum = Math.round(Number(body.duracion));
  const datosEvento = { titulo: `Cita — ${nombre}`, fecha, hora: horaStr, duracion: durNum };
  let googleEventoId: string | null = prev.googleEventoId ?? null;
  if (video.modo === "auto") {
    if (googleEventoId && prev.videoEnlace) {
      video.enlace = prev.videoEnlace;
      await actualizarReunionMeet(admin, wsId, googleEventoId, datosEvento);
    } else {
      const r = await crearReunionMeet(admin, wsId, datosEvento);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: 502 });
      video.enlace = r.enlace;
      googleEventoId = r.eventoId;
    }
  } else if (video.modo === "manual") {
    if (googleEventoId) {
      if (video.enlace === prev.videoEnlace) {
        await actualizarReunionMeet(admin, wsId, googleEventoId, datosEvento);
      } else {
        await borrarReunionMeet(admin, wsId, googleEventoId);
        googleEventoId = null;
      }
    }
  } else if (googleEventoId) {
    await borrarReunionMeet(admin, wsId, googleEventoId);
    googleEventoId = null;
  }

  const patch = {
    clienteId: body.clienteId?.trim() || null,
    nombre,
    email: body.email?.trim() || null,
    telefono: body.telefono?.trim() || null,
    fecha,
    hora: body.hora?.trim() || null,
    duracion: Number.isFinite(body.duracion) && Number(body.duracion) > 0 ? Math.round(Number(body.duracion)) : null,
    precio: Number.isFinite(body.precio) && Number(body.precio) >= 0 ? Number(body.precio) : null,
    lugar: video.prov ? "Videollamada" : (body.lugar?.trim() || null),
    motivo: body.motivo?.trim() || null,
    notas: body.notas?.trim() || null,
    videoProveedor: video.prov,
    videoEnlace: video.enlace,
    googleEventoId,
  };
  let { error } = await supabase.from("CitaPrevia").update(patch).eq("id", id); // RLS
  if (error && faltaColumnaGoogle(error.message)) ({ error } = await supabase.from("CitaPrevia").update(sinGoogleEvento(patch)).eq("id", id));
  if (error && faltaColumnaVideo(error.message)) ({ error } = await supabase.from("CitaPrevia").update(sinVideo(patch)).eq("id", id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cobro al editar: NUNCA se emite una segunda factura. Si ya había una se
  // reutiliza (y se actualiza el importe si cambió y sigue pendiente de cobro);
  // una factura PAGADA no se toca ni se vuelve a reclamar.
  let cobro: Cobro | null = null;
  if (body.cobrar && patch.email && patch.precio && patch.precio > 0) {
    const { data: prevFac, error: eFac } = await supabase.from("CitaPrevia").select("facturaId").eq("id", id).maybeSingle();
    const facturaId = (prevFac as { facturaId?: string | null } | null)?.facturaId ?? null;
    let emitida: { facturaId: string; numero: string; total: number } | null = null;
    // Sin la columna (falta cita-cobro.sql) no se puede saber si ya hay factura:
    // se prefiere NO cobrar a emitir un duplicado con número real en cada edición.
    if (eFac) console.error("[citas/facturaId]", eFac.message);
    else if (facturaId) {
      const { data: f } = await admin.from("Factura").select("id, numero, total, estado").eq("id", facturaId).maybeSingle();
      const fac = f as { id: string; numero: string; total: number; estado: string } | null;
      if (fac && fac.estado !== "PAGADA" && fac.estado !== "ANULADA") {
        const total = Math.round(Number(patch.precio) * 100) / 100;
        if (Math.abs(Number(fac.total) - total) >= 0.01) {
          const base = Math.round((total / (1 + IVA)) * 100) / 100;
          await admin.from("Factura").update({ baseImponible: base, iva: Math.round((total - base) * 100) / 100, total }).eq("id", fac.id);
        }
        emitida = { facturaId: fac.id, numero: fac.numero, total };
      }
    } else if (!eFac) {
      emitida = await emitirFacturaCita(admin, {
        workspaceId: wsId, clienteId: patch.clienteId, nombre,
        precio: patch.precio, fecha, motivo: patch.motivo,
      });
      if (emitida) {
        const { error: eLink } = await supabase.from("CitaPrevia").update({ facturaId: emitida.facturaId }).eq("id", id);
        if (eLink) console.error("[citas/facturaId]", eLink.message);
      }
    }
    if (emitida) {
      const medios = await datosCobro(admin, wsId, {
        transferencia: body.cobroTransferencia !== false,
        tarjeta: Boolean(body.cobroTarjeta),
      });
      cobro = { ...emitida, baseUrl: baseUrlFromRequest(req), ...medios };
    }
  }

  // Aviso opt-in al cliente con los DATOS NUEVOS (best-effort; nunca rompe el guardado).
  let avisado = false;
  if (body.notificar && patch.email) {
    // La foto es la del gestor ASIGNADO (quien creó la cita), no la de quien edita:
    // el cliente sigue viendo a su persona de contacto.
    const { data: asg } = await supabase.from("CitaPrevia").select("asignadoAId").eq("id", id).maybeSingle();
    const dueno = (asg as { asignadoAId?: string | null } | null)?.asignadoAId ?? user.id;
    const avatarUrl = await fotoDeUsuario(admin, dueno);
    avisado = await enviarConfirmacionCitaPrevia({ nombre, email: patch.email, gestoria, fecha, hora: patch.hora, duracion: patch.duracion, precio: patch.precio, lugar: patch.lugar, motivo: patch.motivo, actualizada: true, videoProveedor: video.prov, videoEnlace: video.enlace, citaId: id, cobro, avatarUrl });
  }
  return NextResponse.json({ ok: true, avisado, facturaEmitida: Boolean(cobro) });
}

// Eliminar una cita.
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* permite ?id= */ }
  const id = (body.id ?? new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  // Si la cita tenía reunión de Meet automática, borrar también el evento del
  // calendario del gestor (best-effort: Google nunca bloquea el borrado local).
  try {
    const { data: prev } = await supabase.from("CitaPrevia").select("googleEventoId").eq("id", id).maybeSingle();
    const eventoId = (prev as { googleEventoId?: string | null } | null)?.googleEventoId;
    if (eventoId) {
      const { data: mem } = await supabase.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
      if (mem) await borrarReunionMeet(createSupabaseAdmin(), mem.workspaceId as string, eventoId);
    }
  } catch { /* columna sin migrar o fallo Google → seguir con el borrado local */ }

  const { error } = await supabase.from("CitaPrevia").delete().eq("id", id); // RLS
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
