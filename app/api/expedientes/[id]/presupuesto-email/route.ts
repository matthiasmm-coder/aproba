import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo } from "@/lib/encargo";
import { emailLayout } from "@/lib/notificaciones";
import { direccionEntrante } from "@/lib/email-entrante";

// «Enviar por email» del presupuesto (08/09/2026): el gestor lo manda al cliente sin
// descargarlo ni adjuntarlo a mano. Mismo PDF que el enlace de descarga — una sola
// fuente de precios. RLS valida que el expediente es de su workspace.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // La lectura pasa por RLS: si no es de su despacho, no existe.
  const { data: own } = await supabase.from("Expediente")
    .select("id, referencia, workspaceId, clienteId, oficinaId, Cliente(nombre, apellidos, email)")
    .eq("id", id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const cli = (Array.isArray(own.Cliente) ? own.Cliente[0] : own.Cliente) as { nombre?: string; apellidos?: string; email?: string } | null;
  const para = (cli?.email ?? "").trim();
  if (!para) return NextResponse.json({ error: "El cliente no tiene email registrado." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: exp } = await admin.from("Expediente").select("*, cliente:Cliente(*)").eq("id", id).maybeSingle();
  const datos = exp ? await datosEncargo(admin, exp as never) : null;
  if (!datos) return NextResponse.json({ error: "Configura primero el servicio del expediente." }, { status: 409 });

  let pdf: Uint8Array;
  try {
    pdf = await generarHojaEncargo(datos, "presupuesto");
  } catch (e) {
    console.error("[presupuesto-email] PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el presupuesto." }, { status: 500 });
  }

  const gestoria = datos.despacho.nombre;
  const nombreCli = `${cli?.nombre ?? ""} ${cli?.apellidos ?? ""}`.trim();
  const titulo = "Presupuesto de tu trámite";
  const cuerpo = `<p>Hola${nombreCli ? ` ${escapar(nombreCli)}` : ""},</p>`
    + `<p>Te adjuntamos el presupuesto de <b>${escapar(datos.servicios.map((s) => s.label).join(" + "))}</b>, con el detalle de honorarios y de las tasas previstas.</p>`
    + `<p>Es informativo y no supone ningún compromiso. Si estás de acuerdo, respóndenos a este email y preparamos la hoja de encargo.</p>`;

  // Sin clave de Resend (entornos de prueba) no se rompe el flujo: se avisa al gestor.
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, enviado: false, para });

  const { data: ws } = await admin.from("Workspace").select("emailEntranteToken").eq("id", own.workspaceId as string).maybeSingle();
  const token = (ws?.emailEntranteToken as string | null) ?? null;
  const from = `"${gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from, to: para, subject: `${titulo} · ${own.referencia}`,
    ...(token ? { replyTo: direccionEntrante(token) } : {}),
    html: emailLayout({ gestoria, titulo, cuerpoHtml: cuerpo, preheader: "Presupuesto adjunto en PDF" }),
    text: `${titulo}. Adjuntamos el presupuesto en PDF. Es informativo y no supone compromiso.`,
    attachments: [{ filename: `presupuesto-${own.referencia}.pdf`, content: Buffer.from(pdf) }],
  });
  if (error) {
    console.error("[presupuesto-email]", error.message);
    return NextResponse.json({ error: "No se pudo enviar el email." }, { status: 500 });
  }

  // Queda en el historial del expediente: el gestor ve qué se mandó y cuándo.
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "NOTIFICACION_ENVIADA", userId: user.id,
    descripcion: `📄 Presupuesto enviado por email a ${para}`,
  });
  return NextResponse.json({ ok: true, enviado: true, para });
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
