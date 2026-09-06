import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { emailLayout } from "@/lib/notificaciones";

// RESUMEN SEMANAL — cron de los viernes (vercel.json, 15:00 UTC).
//
// Principio (06/09/2026): Aproba trabaja en los canales del gestor (email hoy, WhatsApp
// después) y el gestor apenas abre la app. Un servicio invisible se olvida y deja de
// pagarse; por eso rinde cuentas cada viernes, en el mismo canal: documentos recibidos,
// formularios rellenados, facturas emitidas, citas de la semana que viene, renovaciones
// que tocan, y lo que queda por decidir en la bandeja. Solo a los despachos con algo que
// contar. ?ws=<id> limita a un despacho; ?to=<email> desvía el envío (pruebas).
export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
const fmt = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" });
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "sin RESEND_API_KEY" }, { status: 500 });
  const url = new URL(req.url);
  const soloWs = url.searchParams.get("ws"); const desvio = url.searchParams.get("to");
  const admin = createSupabaseAdmin(); const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://aproba-software.com").replace(/\/$/, "");
  const ahora = new Date(); const desde = new Date(ahora.getTime() - 7 * 86_400_000); const hasta7 = new Date(ahora.getTime() + 7 * 86_400_000); const hasta60 = new Date(ahora.getTime() + 60 * 86_400_000);
  const desdeIso = desde.toISOString();

  let wsQ = admin.from("Workspace").select("id, nombre");
  if (soloWs) wsQ = wsQ.eq("id", soloWs);
  const { data: wss } = await wsQ;
  const enviados: { ws: string; a: string; resumen: Record<string, number> }[] = [];
  for (const ws of wss ?? []) {
    const { data: owner } = await admin.from("Membership").select("user:User(email)").eq("workspaceId", ws.id).eq("role", "OWNER").limit(1).maybeSingle();
    const u = owner ? ((Array.isArray(owner.user) ? owner.user[0] : owner.user) as { email?: string } | null) : null;
    const para = desvio || u?.email; if (!para) continue;

    const { data: exps } = await admin.from("Expediente").select("id, referencia, clienteId, createdAt, fechaCita, archivadoAt").eq("workspaceId", ws.id);
    const ids = (exps ?? []).map((e) => e.id as string);
    const creados = (exps ?? []).filter((e) => String(e.createdAt) >= desdeIso).length;
    let docs = 0, formularios = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { count: d } = await admin.from("Documento").select("id", { count: "exact", head: true }).in("expedienteId", lote).gte("uploadedAt", desdeIso); docs += d ?? 0;
      const { count: f } = await admin.from("ExpedienteEvento").select("id", { count: "exact", head: true }).in("expedienteId", lote).eq("tipo", "FORM_GENERADO").gte("createdAt", desdeIso); formularios += f ?? 0;
    }
    const { count: docsCli } = await admin.from("DocumentoCliente").select("id", { count: "exact", head: true }).eq("workspaceId", ws.id).gte("createdAt", desdeIso); docs += docsCli ?? 0;
    const { count: facturas } = await admin.from("Factura").select("id", { count: "exact", head: true }).eq("workspaceId", ws.id).neq("estado", "BORRADOR").gte("createdAt", desdeIso);
    const { count: pendientes } = await admin.from("BandejaEntrada").select("id", { count: "exact", head: true }).eq("workspaceId", ws.id).eq("estado", "PENDIENTE");
    const citas = (exps ?? []).filter((e) => !e.archivadoAt && e.fechaCita && String(e.fechaCita).slice(0, 10) >= iso(ahora) && String(e.fechaCita).slice(0, 10) <= iso(hasta7));
    const { data: venc } = await admin.from("Vencimiento").select("id, fecha, clienteId").eq("workspaceId", ws.id).eq("estado", "PENDIENTE").lte("fecha", hasta60.toISOString()).order("fecha").limit(10);
    const resumen = { documentos: docs, formularios, facturas: facturas ?? 0, expedientes: creados, citas: citas.length, renovaciones: (venc ?? []).length, pendientes: pendientes ?? 0 };
    if (!Object.values(resumen).some((n) => n > 0)) continue; // nada que contar: silencio

    const fila = (k: string, v: number | string) => `<tr><td style="padding:6px 0;color:#475569">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`;
    const cuerpo = `<p>Semana del ${fmt(desde)} al ${fmt(ahora)}. Esto es lo que ha pasado en tu despacho:</p>`
      + `<table style="width:100%;border-collapse:collapse;font-size:14px">${fila("Documentos recibidos y colocados", docs)}${fila("Formularios rellenados", formularios)}${fila("Facturas emitidas", resumen.facturas)}${fila("Expedientes nuevos", creados)}</table>`
      + (citas.length ? `<p><b>Citas de la semana que viene:</b> ${citas.map((c) => `${String(c.fechaCita).slice(0, 10).split("-").reverse().slice(0, 2).join("/")} · ${c.referencia}`).join(" · ")}.</p>` : "")
      + ((venc ?? []).length ? `<p><b>Renovaciones en los próximos 60 días:</b> ${(venc ?? []).length}. Cada una se lanza en un clic desde Vencimientos.</p>` : "")
      + ((pendientes ?? 0) > 0 ? `<p><b>${pendientes} email(s) en la bandeja sin asignar</b>: responde a cada uno con el nombre del cliente, o asígnalos desde la app.</p>` : "");
    const html = emailLayout({ gestoria: ws.nombre as string, titulo: "Tu semana en Aproba", cuerpoHtml: cuerpo, cta: { url: `${baseUrl}/app`, label: "Abrir Aproba" }, footerNota: "Recibes este resumen los viernes porque Aproba trabaja con tus emails; si algo no cuadra, responde a este correo." });
    const from = `"${String(ws.nombre).replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await resend.emails.send({ from, to: para, subject: `Tu semana en Aproba · ${fmt(desde)} – ${fmt(ahora)}`, html, text: cuerpo.replace(/<[^>]+>/g, " ") });
    if (error) console.error("[resumen semanal]", ws.nombre, error.message); else enviados.push({ ws: ws.nombre as string, a: para, resumen });
  }
  return NextResponse.json({ ok: true, enviados: enviados.length, detalle: enviados });
}
