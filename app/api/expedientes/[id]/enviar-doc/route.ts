import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo, generarMandato } from "@/lib/encargo";
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
  const para = (cli?.email ?? "").trim();
  if (!para) return NextResponse.json({ error: "El cliente no tiene email registrado." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("*, cliente:Cliente(*)").eq("id", id).maybeSingle();
  const datos = exp ? await datosEncargo(admin, exp as never) : null;
  if (!datos) return NextResponse.json({ error: "Configura primero el servicio del expediente." }, { status: 409 });

  const adjuntos: { filename: string; content: Buffer }[] = [];
  try {
    if (doc === "presupuesto") {
      adjuntos.push({ filename: `presupuesto-${own.referencia}.pdf`, content: Buffer.from(await generarHojaEncargo(datos, "presupuesto")) });
    } else {
      adjuntos.push({ filename: `hoja-de-encargo-${own.referencia}.pdf`, content: Buffer.from(await generarHojaEncargo(datos)) });
      adjuntos.push({ filename: `mandato-${own.referencia}.pdf`, content: await mandatoPdf(admin, own.workspaceId as string, datos) });
    }
  } catch (e) {
    console.error("[enviar-doc] PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el documento." }, { status: 500 });
  }

  const gestoria = datos.despacho.nombre;
  const nombreCli = `${cli?.nombre ?? ""} ${cli?.apellidos ?? ""}`.trim();
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

// Mandato PROPIO del despacho (Ajustes) si lo hay — el mismo criterio que la descarga.
async function mandatoPdf(admin: ReturnType<typeof createSupabaseAdmin>, workspaceId: string, datos: Awaited<ReturnType<typeof datosEncargo>>): Promise<Buffer> {
  try {
    const { data: wsm } = await admin.from("Workspace").select("mandatoPropioPath").eq("id", workspaceId).maybeSingle();
    const path = (wsm as { mandatoPropioPath?: string | null } | null)?.mandatoPropioPath;
    if (path) {
      const { data: blob, error } = await admin.storage.from("documentos").download(path);
      if (!error && blob) return Buffer.from(await blob.arrayBuffer());
      console.error("[enviar-doc] mandato propio ilocalizable, repli al generado:", path, error?.message);
    }
  } catch { /* columna sin migrar → mandato generado */ }
  return Buffer.from(await generarMandato(datos!));
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
