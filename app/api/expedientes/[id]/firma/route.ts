import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { emailDeRespuesta } from "@/lib/notificaciones";
import { encargoActivoEfectivo } from "@/lib/facturacion-oficina";
import { ErrorFirma, crearSobres, evidencia, type SobreFila } from "@/lib/firma/servicio";
import { enviarSolicitudFirma } from "@/lib/firma/emails";
import { esDocFirmable, estadoVisibleSobre, type DocFirmable } from "@/lib/firma/sobre";

// FIRMA EN LÍNEA desde la ficha del expediente (lib/firma): el despacho envía documentos a
// firmar, sigue su estado (enviado → abierto → firmado), recuerda o anula. Sesión + RLS: el
// expediente se resuelve bajo la sesión (un id ajeno no existe); después, service_role.
const uuid = () => crypto.randomUUID();

async function expedienteDeSesion(id: string) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  const { data: exp } = await supa.from("Expediente").select("id, workspaceId, oficinaId, clienteId").eq("id", id).maybeSingle();
  if (!exp) return { error: NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 }) };
  return { user, exp: exp as { id: string; workspaceId: string; oficinaId: string | null; clienteId: string | null } };
}

// Lo que la ficha necesita de cada sobre (nunca la huella del código).
function publico(s: SobreFila, baseUrl: string) {
  return {
    id: s.id, estado: estadoVisibleSobre(s), firmanteNombre: s.firmanteNombre, firmanteEmail: s.firmanteEmail,
    documentos: s.documentos.map((d) => ({ doc: d.doc, titulo: d.titulo, documentoId: d.documentoId ?? null })),
    enviadoAt: s.enviadoAt, abiertoAt: s.abiertoAt, firmadoAt: s.firmadoAt, anuladoAt: s.anuladoAt, expiraAt: s.expiraAt,
    recordatorios: s.recordatorios, createdAt: s.createdAt,
    enlace: s.estado === "PENDIENTE" ? `${baseUrl}/firma/${s.token}` : null,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await expedienteDeSesion(id);
  if ("error" in r) return r.error;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("FirmaSobre").select("*").eq("expedienteId", id).order("createdAt", { ascending: false }).limit(20);
  const activos = await encargoActivoEfectivo(admin, r.exp.workspaceId, r.exp.oficinaId).catch(() => ({ hoja: false, mandato: false }));
  let email: string | null = null;
  if (r.exp.clienteId) {
    const { data: c } = await admin.from("Cliente").select("email").eq("id", r.exp.clienteId).maybeSingle();
    email = (c as { email?: string | null } | null)?.email ?? null;
  }
  const base = baseUrlFromRequest(req);
  return NextResponse.json({
    activa: !error,
    sobres: error ? [] : ((data ?? []) as SobreFila[]).map((s) => publico(s, base)),
    porDefecto: { hoja: activos.hoja, mandato: activos.mandato, presupuesto: false },
    email,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await expedienteDeSesion(id);
  if ("error" in r) return r.error;
  let body: { docs?: unknown; email?: unknown; enviar?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const docs = [...new Set(Array.isArray(body.docs) ? body.docs.filter(esDocFirmable) : [])] as DocFirmable[];
  if (!docs.length) return NextResponse.json({ error: "Elige al menos un documento." }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "El email no es válido." }, { status: 400 });

  const admin = createSupabaseAdmin();
  // Un email escrito aquí para un cliente que no tenía: se guarda en su ficha.
  if (email && r.exp.clienteId) {
    const { data: c } = await admin.from("Cliente").select("email").eq("id", r.exp.clienteId).maybeSingle();
    if (!((c as { email?: string | null } | null)?.email ?? "").trim()) await admin.from("Cliente").update({ email }).eq("id", r.exp.clienteId);
  }
  let sobres: SobreFila[];
  try {
    sobres = await crearSobres(admin, { expedienteId: id, docs, email: email || null, creadoPor: r.user.id });
  } catch (e) {
    if (e instanceof ErrorFirma) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[firma crear]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron preparar los documentos." }, { status: 500 });
  }

  const base = baseUrlFromRequest(req);
  const enviarYa = body.enviar !== false;
  const replyTo = await emailDeRespuesta(admin, r.exp.workspaceId);
  const salida = [];
  for (const s of sobres) {
    let fila = s;
    if (enviarYa) {
      const res = await enviarSolicitudFirma(admin, s, { baseUrl: base, replyTo });
      if (res.enviado || res.simulado) {
        const ahora = new Date().toISOString();
        const evid = await evidencia(admin, s, { evento: "enviado", detalle: `A ${s.firmanteEmail}` }, { enviadoAt: ahora });
        fila = { ...s, enviadoAt: ahora, evidencias: evid };
      }
    }
    await admin.from("ExpedienteEvento").insert({
      id: uuid(), expedienteId: id, userId: r.user.id, tipo: "NOTIFICACION_ENVIADA",
      descripcion: `✍️ ${enviarYa ? "Enviado para firmar en línea" : "Preparado para firmar en línea"}: ${s.documentos.map((d) => d.titulo).join(", ")} · ${s.firmanteNombre} <${s.firmanteEmail}>`,
    });
    salida.push(publico(fila, base));
  }
  return NextResponse.json({ ok: true, sobres: salida });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await expedienteDeSesion(id);
  if ("error" in r) return r.error;
  let body: { sobreId?: unknown; accion?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("FirmaSobre").select("*").eq("id", String(body.sobreId ?? "")).eq("expedienteId", id).maybeSingle();
  const s = data as SobreFila | null;
  if (!s) return NextResponse.json({ error: "Envío no encontrado." }, { status: 404 });
  if (s.estado !== "PENDIENTE") return NextResponse.json({ error: "Este envío ya no está pendiente." }, { status: 409 });
  const base = baseUrlFromRequest(req);
  const ahora = new Date().toISOString();

  if (body.accion === "anular") {
    const evid = await evidencia(admin, s, { evento: "anulado" }, { estado: "ANULADO", anuladoAt: ahora, otpHash: null });
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: id, userId: r.user.id, tipo: "COMENTARIO", descripcion: `✍️ Firma en línea anulada: ${s.documentos.map((d) => d.titulo).join(", ")}` });
    return NextResponse.json({ ok: true, sobre: publico({ ...s, estado: "ANULADO", anuladoAt: ahora, evidencias: evid }, base) });
  }
  if (body.accion === "recordar") {
    const res = await enviarSolicitudFirma(admin, s, { baseUrl: base, recordatorio: Boolean(s.enviadoAt), replyTo: await emailDeRespuesta(admin, s.workspaceId) });
    if (!res.enviado && !res.simulado) return NextResponse.json({ error: "No se pudo enviar el correo." }, { status: 502 });
    const extra = s.enviadoAt ? { recordatorios: s.recordatorios + 1, ultimoRecordatorio: ahora } : { enviadoAt: ahora };
    const evid = await evidencia(admin, s, { evento: s.enviadoAt ? "recordatorio" : "enviado", detalle: `A ${s.firmanteEmail}` }, extra);
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: id, userId: r.user.id, tipo: "NOTIFICACION_ENVIADA", descripcion: `✍️ ${s.enviadoAt ? "Recordatorio de firma enviado" : "Enviado para firmar en línea"} a ${s.firmanteEmail}` });
    return NextResponse.json({ ok: true, sobre: publico({ ...s, ...extra, evidencias: evid } as SobreFila, base) });
  }
  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
