import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace, parsePacks } from "@/lib/data/config";
import { emailLayout, fotoDelOwner } from "@/lib/notificaciones";
import { packPct } from "@/lib/servicios";
import { SERVICIO_A_TIPO } from "@/lib/tramites";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { baseUrlFromRequest } from "@/lib/base-url";
import { oficinaDelCliente } from "@/lib/oficinas-server";

export const runtime = "nodejs";
export const maxDuration = 30;

// ESPACIO DEL CLIENTE — el cliente solicita un trámite nuevo desde /c/[token]:
// se crea el expediente al instante (aparece en el tablero del gestor, fase Recepción),
// el gestor recibe un email, y el cliente pasa directo a /j para subir sus documentos.
// Autorización = el espacioToken (misma familia de credenciales que /j /s /f).
const fail = (msg: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: msg, ...(extra ?? {}) }, { status });

const uuid = () => crypto.randomUUID();

// Freno por token (mismo lambda): un espacio no puede ametrallar expedientes.
const ultimas = new Map<string, number[]>();
const LIMITE = 5; // solicitudes
const VENTANA = 10 * 60 * 1000; // por 10 minutos

// Estados que cuentan como «en curso» para el anti-duplicado.
const TERMINALES = new Set(["FINALIZADO", "RECHAZADO"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; servicios?: unknown; pack?: unknown };
  const token = String(body.token ?? "").trim();
  const pedidos = Array.isArray(body.servicios) ? body.servicios.filter((s): s is string => typeof s === "string").slice(0, 4) : [];
  if (!token || token.length < 8) return fail("Enlace no válido.", 404);
  if (!pedidos.length) return fail("Elige al menos un servicio.");

  const ahora = Date.now();
  const previas = (ultimas.get(token) ?? []).filter((t) => ahora - t < VENTANA);
  if (previas.length >= LIMITE) return fail("Has enviado varias solicitudes seguidas. Espera unos minutos.", 429);
  ultimas.set(token, [...previas, ahora]);

  const admin = createSupabaseAdmin();
  type ClienteRow = { id: string; nombre: string | null; apellidos: string | null; workspaceId: string };
  let cliente: ClienteRow | null = null;
  try {
    const { data, error } = await admin
      .from("Cliente")
      .select("id, nombre, apellidos, workspaceId")
      .eq("espacioToken", token)
      .maybeSingle();
    if (!error) cliente = data as ClienteRow | null;
  } catch { /* columna ausente */ }
  if (!cliente) return fail("Enlace no válido.", 404);
  const workspaceId = cliente.workspaceId;

  // Servicios pedidos → validados contra el catálogo ACTIVO del despacho.
  const catalogo = await fetchServiciosDeWorkspace(admin, workspaceId);
  const activos = new Map(catalogo.filter((s) => s.active).map((s) => [s.id, s] as const));
  const servicios = pedidos.filter((s) => activos.has(s));
  if (!servicios.length) return fail("Ese servicio ya no está disponible. Recarga la página.");
  const principal = servicios[0];
  const extras = servicios.slice(1);

  // Anti-duplicado: mismo servicio principal ya en curso → no crear otro.
  let resDup = await admin.from("Expediente").select("referencia, estado, servicioClave, archivadoAt").eq("clienteId", cliente.id);
  if (resDup.error) resDup = await admin.from("Expediente").select("referencia, estado, servicioClave").eq("clienteId", cliente.id) as typeof resDup;
  const dup = ((resDup.data ?? []) as { referencia: string; estado: string; servicioClave: string | null; archivadoAt?: string | null }[])
    .find((e) => e.servicioClave === principal && !TERMINALES.has(e.estado) && !e.archivadoAt);
  if (dup) {
    return fail("Ya tienes un trámite de este servicio en curso.", 409, { codigo: "ya_en_curso", servicio: principal, servicioLabel: activos.get(principal)?.label ?? principal });
  }

  // Descuento del PACK: el cliente manda el ID, el % se lee del catálogo del
  // despacho (nunca del cuerpo). Se aplica al pedido entero — es exactamente lo
  // que el espacio le enseñó antes de pulsar.
  let descuentoPack: Record<string, unknown> | null = null;
  if (typeof body.pack === "string" && body.pack) {
    try {
      const { data: ws } = await admin.from("Workspace").select("packs").eq("id", workspaceId).maybeSingle();
      const pk = parsePacks((ws as { packs?: unknown } | null)?.packs).find((x) => x.id === body.pack);
      const pct = pk ? packPct(pk) : 0;
      if (pct > 0) descuentoPack = { tipo: "PORCENTAJE", valor: pct, motivo: pk!.nombre };
    } catch { /* sin catálogo legible → sin descuento, nunca se cobra de más */ }
  }

  // ── Creación del expediente (mismo patrón que POST /api/expedientes) ──
  const oficinaId = await oficinaDelCliente(admin, cliente.id); // multi-oficina
  const year = new Date().getFullYear();
  const expedienteId = uuid();
  const portalToken = uuid().replace(/-/g, "");
  let referencia = "";
  for (let intento = 0; ; intento++) {
    const { data: last } = await admin.from("Expediente").select("referencia").eq("workspaceId", workspaceId).like("referencia", `EXP-${year}-%`).order("referencia", { ascending: false }).limit(1).maybeSingle();
    const n = last ? Number(String(last.referencia).split("-")[2]) + 1 : 1;
    referencia = `EXP-${year}-${String(n).padStart(4, "0")}`;
    const fila: Record<string, unknown> = {
      id: expedienteId, workspaceId, clienteId: cliente.id, referencia, portalToken,
      tipo: SERVICIO_A_TIPO[principal] ?? "OTRO", servicioClave: principal,
      estado: "BORRADOR", updatedAt: new Date().toISOString(),
      ...(extras.length ? { serviciosExtra: extras } : {}),
      ...(descuentoPack ? { descuento: descuentoPack } : {}),
      ...(oficinaId ? { oficinaId } : {}), // multi-oficina: heredada del cliente
    };
    let { error: eExp } = await admin.from("Expediente").insert(fila);
    // Repli si falta alguna columna (migraciones multi-servicio / descuento / oficina):
    // el trámite se crea igual, sin el extra que la base no conoce.
    if (eExp && (extras.length || descuentoPack || oficinaId) && /serviciosExtra|descuento|oficinaId|column|schema cache|does not exist/i.test(eExp.message)) {
      delete fila.serviciosExtra;
      delete fila.descuento;
      delete fila.oficinaId;
      ({ error: eExp } = await admin.from("Expediente").insert(fila));
    }
    if (!eExp) break;
    if (/duplicate|unique|23505/i.test(eExp.message) && intento < 4) continue; // referencia en carrera
    return fail(eExp.message, 500);
  }

  const etiquetas = servicios.map((s) => activos.get(s)?.label ?? s);
  await admin.from("ExpedienteEvento").insert([
    { id: uuid(), expedienteId, tipo: "CREADO", descripcion: `🧑‍💻 Trámite solicitado por el cliente desde su espacio (${etiquetas.join(" + ")})` },
  ]);

  // Cuota mensual: un expediente real cuenta como cualquier otro (best-effort).
  const extra = await cobrarOverageSiProcede(admin, { workspaceId, expedienteId, referencia });

  // Email al despacho (OWNER) — mejor esfuerzo, nunca bloquea la respuesta al cliente.
  try {
    const { data: owner } = await admin.from("Membership").select("userId").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
    const email = owner ? (await admin.auth.admin.getUserById(owner.userId as string)).data.user?.email ?? null : null;
    if (email && process.env.RESEND_API_KEY) {
      const nombre = `${cliente.nombre ?? ""} ${cliente.apellidos ?? ""}`.trim() || "Un cliente";
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? baseUrlFromRequest(req)).replace(/\/$/, "");
      const cuerpo = `${nombre} ha solicitado un trámite desde su espacio:\n\n• ${etiquetas.join("\n• ")}\n\nEl expediente ${referencia} ya está en tu tablero (fase Recepción). El cliente está subiendo sus documentos.\n\nÁbrelo aquí:\n${appUrl}/app/expedientes/${expedienteId}`;
      // Misma cabecera que los emails al cliente: foto del despacho (OWNER) o sus
      // iniciales. Antes era un <pre> pelado — el gestor recibe ahora el mismo diseño.
      const { data: ws } = await admin.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
      const gestoria = (ws as { nombre?: string } | null)?.nombre ?? "Tu gestoría";
      const html = emailLayout({
        avatarUrl: await fotoDelOwner(admin, workspaceId),
        gestoria,
        titulo: "Nuevo trámite solicitado",
        cuerpoHtml: `<p style="margin:0 0 10px"><strong>${nombre}</strong> ha solicitado un trámite desde su espacio:</p>
          <p style="margin:0 0 10px">• ${etiquetas.join("<br>• ")}</p>
          <p style="margin:0">El expediente <strong>${referencia}</strong> ya está en tu tablero (fase Recepción). El cliente está subiendo sus documentos.</p>`,
        cta: { url: `${appUrl}/app/expedientes/${expedienteId}`, label: "Abrir el expediente" },
        footerNota: `Aviso de Aproba para ${gestoria}.`,
        preheader: `${nombre}: ${etiquetas.join(" + ")}`,
      });
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
        to: email,
        subject: `🆕 ${nombre} solicita: ${etiquetas.join(" + ")} (${referencia})`,
        text: cuerpo,
        html,
      });
    }
  } catch (e) {
    console.error("[espacio email gestor]", e instanceof Error ? e.message : e);
  }

  const base = baseUrlFromRequest(req);
  return NextResponse.json({ ok: true, referencia, url: `${base}/j/${portalToken}`, extra });
}
