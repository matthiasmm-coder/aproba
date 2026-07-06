import { NextResponse } from "next/server";
import { Resend } from "resend";

// Solicitud de demo desde la landing — endpoint PÚBLICO (sin sesión).
// Defensas anti-abuso en capas: rate limit por IP + tope global diario (en memoria,
// por instancia — suficiente contra floods simples; un abuso distribuido requeriría
// KV/Turnstile), honeypot, y topes de longitud. El contenido va escapado al HTML.
// OJO: la clave Resend es compartida con los emails transaccionales del producto
// (reset de contraseña, avisos) — el tope global protege ese canal.
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
// Sin saltos de línea en campos cortos: nadie inyecta cabeceras ni «párrafos» falsos.
const linea = (v: unknown, max: number) => String(typeof v === "string" ? v : "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

const DESTINO = process.env.DEMO_NOTIFY_EMAIL || "matthias.merlemounier@gmail.com";

// ── Rate limit en memoria ──
const HORA = 3_600_000;
const MAX_POR_IP_HORA = 3;
const MAX_GLOBAL_DIA = 50;
const porIp = new Map<string, number[]>();
let global = { dia: "", n: 0 };

function admitir(ip: string): boolean {
  const ahora = Date.now();
  const dia = new Date().toISOString().slice(0, 10);
  if (global.dia !== dia) global = { dia, n: 0 };
  if (global.n >= MAX_GLOBAL_DIA) return false;
  const previos = (porIp.get(ip) ?? []).filter((t) => ahora - t < HORA);
  if (previos.length >= MAX_POR_IP_HORA) return false;
  previos.push(ahora);
  porIp.set(ip, previos);
  // La Map no crece sin límite aunque roten las IPs.
  if (porIp.size > 500) {
    for (const [k, v] of porIp) if (v.every((t) => ahora - t >= HORA)) porIp.delete(k);
  }
  global.n += 1;
  return true;
}

export async function POST(req: Request) {
  const raw = (await req.json().catch(() => null)) as unknown;
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";

  // Honeypot relleno = bot seguro. Respondemos ok para no darle señal.
  if (linea(body.web, 10) !== "") {
    console.warn("[demo] honeypot", ip);
    return NextResponse.json({ ok: true });
  }

  const nombre = linea(body.nombre, 120);
  const despacho = linea(body.despacho, 160);
  const email = linea(body.email, 200);
  const telefono = linea(body.telefono, 40);
  const volumen = linea(body.volumen, 20);
  const mensaje = String(typeof body.mensaje === "string" ? body.mensaje : "").trim().slice(0, 2000);

  if (nombre.length < 2) return fail("Falta tu nombre.");
  if (despacho.length < 2) return fail("Falta el nombre del despacho.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("El email no parece válido.");

  if (!admitir(ip)) return fail("Demasiadas solicitudes seguidas. Espera un momento o escríbenos directamente.", 429);

  // Tiempo de rellenado autodeclarado: NUNCA descarta el lead (el autofill legítimo
  // baja de 3 s y un bot puede mentir de todos modos) — solo marca el email.
  const elapsed = typeof body.t === "number" ? body.t : 0;
  const sospechoso = elapsed < 1500;

  if (!process.env.RESEND_API_KEY) {
    console.error("[demo] RESEND_API_KEY ausente");
    return fail("No se pudo enviar la solicitud. Inténtalo de nuevo.", 500);
  }

  const filas = [
    ["Nombre", nombre],
    ["Despacho", despacho],
    ["Email", email],
    ["Teléfono", telefono || "—"],
    ["Expedientes/mes", volumen || "—"],
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#64748b;white-space:nowrap">${k}</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${escapeHtml(v)}</td></tr>`)
    .join("");
  const html =
    `<h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">Nueva solicitud de demo</h2>` +
    `<p style="margin:0 0 16px;color:#64748b;font-size:13px">Enviada desde la landing de Aproba.${sospechoso ? " ⚠︎ Rellenada en menos de 1,5 s (posible bot)." : ""}</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${filas}</table>` +
    (mensaje ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f8fafc;padding:12px;border-radius:8px;margin-top:16px">${escapeHtml(mensaje)}</pre>` : "");

  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Aproba Demo <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`,
      to: DESTINO,
      replyTo: email,
      subject: `[Aproba demo]${sospechoso ? " ⚠︎" : ""} ${despacho} — ${nombre}`,
      html,
      text: `Nombre: ${nombre}\nDespacho: ${despacho}\nEmail: ${email}\nTeléfono: ${telefono || "—"}\nExpedientes/mes: ${volumen || "—"}\n\n${mensaje}`,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[demo email]", e instanceof Error ? e.message : e);
    return fail("No se pudo enviar la solicitud. Inténtalo de nuevo.", 500);
  }

  return NextResponse.json({ ok: true });
}
