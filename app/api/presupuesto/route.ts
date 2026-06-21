import { NextResponse } from "next/server";
import { Resend } from "resend";

// Solicitud de presupuesto de servicios de implantación desde la landing (público,
// sin login). Notifica al equipo por email (best-effort). El presupuesto se elabora
// a mano, así que de momento no persistimos en BD: dejamos copia en logs por si falla
// el email.
const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const SERVICIOS = ["Puesta en marcha", "Aproba Despegue"];
const clamp = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: si el campo oculto viene relleno, es un bot → fingimos éxito.
  if (clamp(body.website, 80)) return NextResponse.json({ ok: true });

  const nombre = clamp(body.nombre, 120);
  const email = clamp(body.email, 160).toLowerCase();
  const servicio = SERVICIOS.includes(clamp(body.servicio, 60)) ? clamp(body.servicio, 60) : SERVICIOS[0];
  if (nombre.length < 2) return fail("Indica tu nombre.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Email no válido.");

  const rows: [string, string][] = [
    ["Servicio", servicio],
    ["Nombre", nombre],
    ["Despacho / empresa", clamp(body.empresa, 160) || "—"],
    ["Email", email],
    ["Teléfono", clamp(body.telefono, 40) || "—"],
    ["Expedientes a migrar", clamp(body.expedientes, 20) || "—"],
    ["Personas a formar", clamp(body.participantes, 20) || "—"],
    ["Disponibilidad", clamp(body.disponibilidad, 200) || "—"],
    ["Comentarios", clamp(body.comentarios, 2000) || "—"],
  ];

  // Copia de seguridad en logs (recuperable desde el panel de logs si el email falla).
  console.log("[presupuesto]", JSON.stringify(Object.fromEntries(rows)));

  // Destinatario de los leads. Configurable vía env (PRESUPUESTO_NOTIFY_EMAIL en Vercel);
  // por defecto, el email del fundador.
  const notify = process.env.PRESUPUESTO_NOTIFY_EMAIL || "matthias.merlemounier@gmail.com";
  if (process.env.RESEND_API_KEY) {
    const from = `Aproba Presupuestos <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const trs = rows
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0f172a;font-weight:500">${escapeHtml(v)}</td></tr>`)
      .join("");
    const html = `<p style="font-weight:700;color:#0f172a;margin:0 0 8px">Nueva solicitud de presupuesto</p>`
      + `<table style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px">${trs}</table>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from,
        to: notify,
        replyTo: email,
        subject: `[Presupuesto · ${servicio}] ${nombre}`,
        html,
        text,
      });
    } catch (e) {
      // No bloqueamos la respuesta: la solicitud queda registrada en logs.
      console.error("[presupuesto email]", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
