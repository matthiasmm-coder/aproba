import { NextResponse } from "next/server";
import { empresaPagadora } from "@/lib/notificaciones";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo } from "@/lib/encargo";
import { mandatoDelExpediente } from "@/lib/mandato";
import { emailLayout } from "@/lib/notificaciones";
import { logoDelWorkspace } from "@/lib/marca";
import { direccionEntrante } from "@/lib/email-entrante";
import { baseUrlFromRequest } from "@/lib/base-url";

// El gestor manda al cliente, sin descargar ni adjuntar a mano:
//   ?doc=presupuesto → el presupuesto (informativo, no compromete).
//   ?doc=encargo     → hoja de encargo + mandato, para firmar y devolver.
// Los PDF son los MISMOS que los enlaces de descarga (una sola fuente de precios).
// RLS valida que el expediente es del workspace del usuario.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = new URL(req.url).searchParams.get("doc") === "encargo" ? "encargo" : "presupuesto";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: own } = await supabase.from("Expediente")
    .select("id, referencia, workspaceId, oficinaId, portalToken, Cliente(nombre, apellidos, email)")
    .eq("id", id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const cli = (Array.isArray(own.Cliente) ? own.Cliente[0] : own.Cliente) as { nombre?: string; apellidos?: string; email?: string } | null;
  const admin = createSupabaseAdmin();
  // Cliente-EMPRESA: el presupuesto y la hoja de encargo van a la EMPRESA (quien contrata),
  // nunca al trabajador — misma regla que el encargo manual y la factura (Luis, 21/09).
  const pagador = await empresaPagadora(admin, id);
  const para = (pagador ? pagador.email : (cli?.email ?? "")).trim();
  if (!para) {
    return NextResponse.json({ error: pagador ? `${pagador.nombre} no tiene email de contacto. Añádelo en su ficha (Clientes → Empresas).` : "El cliente no tiene email registrado." }, { status: 400 });
  }
  const { data: exp } = await admin.from("Expediente").select("*, cliente:Cliente(*)").eq("id", id).maybeSingle();
  const datos = exp ? await datosEncargo(admin, exp as never) : null;
  if (!datos) return NextResponse.json({ error: "Configura primero el servicio del expediente." }, { status: 409 });

  const adjuntos: { filename: string; content: Buffer }[] = [];
  try {
    if (doc === "presupuesto") {
      adjuntos.push({ filename: `presupuesto-${own.referencia}.pdf`, content: Buffer.from(await generarHojaEncargo(datos, "presupuesto")) });
    } else {
      adjuntos.push({ filename: `hoja-de-encargo-${own.referencia}.pdf`, content: Buffer.from(await generarHojaEncargo(datos)) });
      // Mismo criterio que la descarga (lib/mandato), pero PLANO: sale hacia el cliente.
      const ex = exp as { tipo: string; servicioClave?: string | null };
      const m = await mandatoDelExpediente(admin, { workspaceId: own.workspaceId as string, tipo: ex.tipo, servicioClave: ex.servicioClave ?? null }, datos, undefined, { editable: false });
      adjuntos.push({ filename: `mandato-${own.referencia}.pdf`, content: Buffer.from(m.bytes) });
    }
  } catch (e) {
    console.error("[enviar-doc] PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el documento." }, { status: 500 });
  }

  const gestoria = datos.despacho.nombre;
  const nombreCli = pagador ? pagador.nombre : `${cli?.nombre ?? ""} ${cli?.apellidos ?? ""}`.trim();
  const servicios = escapar(datos.servicios.map((s) => s.label).join(" + "));
  const titulo = doc === "presupuesto" ? "Presupuesto de tu trámite" : "Documentos para firmar";
  const cuerpo = doc === "presupuesto"
    ? `<p>Hola${nombreCli ? ` ${escapar(nombreCli)}` : ""},</p>`
      + `<p>Te adjuntamos el presupuesto de <b>${servicios}</b>, con el detalle de honorarios y de las tasas previstas.</p>`
      + `<p>Es informativo y no supone ningún compromiso. Si estás de acuerdo, respóndenos a este email y preparamos la hoja de encargo.</p>`
    : `<p>Hola${nombreCli ? ` ${escapar(nombreCli)}` : ""},</p>`
      + `<p>Te adjuntamos la <b>hoja de encargo</b> de ${servicios} y el <b>mandato de representación</b>.</p>`
      + `<p>Para empezar, fírmalos y devuélvenoslos: puedes subirlos desde tu enlace o responder a este email con las fotos.</p>`;

  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, enviado: false, para });

  const { data: ws } = await admin.from("Workspace").select("emailEntranteToken").eq("id", own.workspaceId as string).maybeSingle();
  const token = (ws?.emailEntranteToken as string | null) ?? null;
  const portal = (own.portalToken as string | null) ?? null;
  const from = `"${gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from, to: para, subject: `${titulo} · ${own.referencia}`,
    ...(token ? { replyTo: direccionEntrante(token) } : {}),
    html: emailLayout({
      gestoria, titulo, cuerpoHtml: cuerpo,
      logoUrl: await logoDelWorkspace(admin, own.workspaceId as string, ((own as { oficinaId?: string | null }).oficinaId ?? null)),
      preheader: doc === "presupuesto" ? "Presupuesto adjunto en PDF" : "Hoja de encargo y mandato adjuntos",
      // Solo en el encargo: el enlace lleva justo a donde se suben los firmados.
      cta: doc === "encargo" && portal ? { url: `${baseUrlFromRequest(req)}/j/${portal}`, label: "Subir los documentos firmados" } : null,
    }),
    text: doc === "presupuesto"
      ? `${titulo}. Adjuntamos el presupuesto en PDF. Es informativo y no supone compromiso.`
      : `${titulo}. Adjuntamos la hoja de encargo y el mandato de representación. Fírmalos y devuélvenoslos.`,
    attachments: adjuntos,
  });
  if (error) {
    console.error("[enviar-doc]", error.message);
    return NextResponse.json({ error: "No se pudo enviar el email." }, { status: 500 });
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "NOTIFICACION_ENVIADA", userId: user.id,
    descripcion: doc === "presupuesto"
      ? `📄 Presupuesto enviado por email a ${para}`
      : `✍️ Hoja de encargo y mandato enviados por email a ${para}`,
  });
  return NextResponse.json({ ok: true, enviado: true, para });
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
