import "server-only";
import type { Resend } from "resend";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { IaNoDisponible } from "@/lib/extraction";
import { leerAvisoDehu } from "@/lib/extraction-notificacion";
import { emailLayout } from "@/lib/notificaciones";
import { direccionEntrante } from "@/lib/email-entrante";
import { esCandidatoAvisoDehu, normalizarAvisoLeido, TIPO_NOTIFICACION_LABEL, URL_DEHU, type NotificacionDehu } from "@/lib/notificaciones-dehu";
import { faltaMigracionDehu, guardarAvisoDehu, importarNotificacion } from "@/lib/notificaciones-dehu-guardar";
import type { AdjuntoBandeja } from "@/lib/email-entrante-procesar";

// DEHú POR EMAIL (28/09/2026) — rama de la recepción por email (lib/email-entrante-procesar.ts):
//  · AVISO: el despacho añadió su dirección de Aproba en la DEHú («Mis datos de contacto»);
//    cada «tiene una notificación puesta a disposición» entra en la pestaña DEHú con los 10
//    días naturales para abrirla. La verificación de la dirección llega al owner.
//  · PDF reenviado por un MIEMBRO: las notificaciones van a la pestaña DEHú con su
//    expediente propuesto; lo que no es una notificación sigue el circuito de siempre.
// Los emails de clientes no cambian de camino.

type Admin = ReturnType<typeof createSupabaseAdmin>;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PISTA_ADJUNTO = /notificaci|requerimiento|resoluci|acuse|justificante|dehu|citaci|notific@/i;

export async function procesarDehuDelEmail(admin: Admin, resend: Resend, o: {
  workspaceId: string; gestoria: string; token: string; emailId: string; remitente: string; asunto: string; cuerpo: string;
  recibidoAt: string | null; esMiembro: boolean; adjuntos: AdjuntoBandeja[]; emailOwner: string | null; userIdRemitente: string | null; baseUrl: string;
}): Promise<{ terminado: boolean; motivo: string; restantes: AdjuntoBandeja[] }> {
  const sigue = { terminado: false, motivo: "", restantes: o.adjuntos };
  const candidato = esCandidatoAvisoDehu({ remitente: o.remitente, asunto: o.asunto, texto: o.cuerpo });
  const leibles = o.adjuntos.filter((a) => /^(application\/pdf|image\/)/.test(a.mime));
  const pdfs = leibles.filter((a) => a.mime === "application/pdf");

  // ── Aviso: «tiene una notificación», o la verificación de la dirección. Llega de la
  //    DEHú (sin PDF: una imagen suelta sería un logo) o lo reenvía el gestor sin adjuntos.
  if (candidato && (o.esMiembro ? !leibles.length : !pdfs.length)) {
    const previo = await admin.from("NotificacionDehu").select("id").eq("workspaceId", o.workspaceId).eq("huella", `email:${o.emailId}`).maybeSingle();
    if (previo.error) { if (!faltaMigracionDehu(previo.error.message)) console.error("[dehu email]", previo.error.message); return sigue; }
    if (previo.data) return { terminado: true, motivo: "aviso DEHú duplicado", restantes: [] };
    const dominio = o.remitente.split("@")[1] ?? "";
    let leido;
    try { leido = await leerAvisoDehu({ remitente: o.remitente, asunto: o.asunto, texto: o.cuerpo }); }
    catch (err) {
      // Sin IA: si viene de un dominio oficial, se guarda igual (fecha = la de llegada) — un
      // aviso perdido es un plazo perdido. Si no, sigue a la bandeja como cualquier email.
      if (!(err instanceof IaNoDisponible) || !/(^|\.)(redsara\.es|gob\.es)$/i.test(dominio)) return sigue;
      leido = normalizarAvisoLeido({ es_aviso: true, concepto: o.asunto });
    }
    if (!leido.esAviso && !leido.esVerificacion) return sigue;
    const r = await guardarAvisoDehu(admin, { workspaceId: o.workspaceId, emailId: o.emailId, remitente: o.remitente, asuntoEmail: o.asunto, recibidoAt: o.recibidoAt, leido });
    if (leido.esVerificacion && !leido.esAviso && o.emailOwner && !r.duplicado) {
      await avisarVerificacion(resend, { para: o.emailOwner, gestoria: o.gestoria, codigo: leido.codigo, baseUrl: o.baseUrl });
    }
    return { terminado: true, motivo: leido.esVerificacion && !leido.esAviso ? "verificación de la dirección DEHú" : "aviso DEHú registrado", restantes: [] };
  }

  // ── PDF de notificaciones reenviados por el despacho ──
  if (!o.esMiembro || !(candidato || leibles.some((a) => PISTA_ADJUNTO.test(a.nombre)))) return sigue;
  const importadas: NotificacionDehu[] = [];
  const restantes: AdjuntoBandeja[] = o.adjuntos.filter((a) => !leibles.includes(a));
  // De tres en tres (cada lectura son varios segundos; la función tiene 60).
  for (let i = 0; i < leibles.length; i += 3) {
    const tanda = leibles.slice(i, i + 3);
    const res = await Promise.all(tanda.map(async (a) => {
      try {
        const dl = await admin.storage.from("documentos").download(a.storagePath);
        if (dl.error || !dl.data) return { a, fila: null };
        const r = await importarNotificacion(admin, {
          workspaceId: o.workspaceId, buffer: Buffer.from(await dl.data.arrayBuffer()), mime: a.mime, nombre: a.nombre,
          storagePath: a.storagePath, creadoPorId: o.userIdRemitente, siNoEs: "descartar",
        });
        return { a, fila: r.estado === "no_es_notificacion" ? null : r.fila };
      } catch (err) {
        console.error("[dehu email] adjunto:", err instanceof Error ? err.message : err);
        return { a, fila: null };
      }
    }));
    for (const { a, fila } of res) { if (fila) importadas.push(fila); else restantes.push(a); }
  }
  if (!importadas.length) return sigue;
  await responderNotificaciones(admin, resend, { ...o, importadas, quedan: restantes.length });
  return { terminado: restantes.length === 0, motivo: `${importadas.length} notificación(es) DEHú importada(s)`, restantes };
}

// Respuesta en el hilo al gestor que reenvió: qué es cada notificación y a qué expediente
// la propone Aproba. Se confirma en la pestaña DEHú (nada se vincula solo).
async function responderNotificaciones(admin: Admin, resend: Resend, o: {
  workspaceId: string; gestoria: string; token: string; remitente: string; asunto: string; baseUrl: string; importadas: NotificacionDehu[]; quedan: number;
}) {
  const ids = [...new Set(o.importadas.map((n) => n.sugerencia?.expedienteId).filter((x): x is string => Boolean(x)))];
  const refs = new Map<string, string>();
  if (ids.length) {
    const { data } = await admin.from("Expediente").select("id, referencia").in("id", ids);
    for (const e of (data ?? []) as { id: string; referencia: string }[]) refs.set(e.id, e.referencia);
  }
  const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" }) : "");
  const filas = o.importadas.map((n) => {
    const persona = [n.titularNombre, n.nie].filter(Boolean).join(" · ");
    const prop = n.sugerencia?.expedienteId && refs.get(n.sugerencia.expedienteId) ? ` → propuesta: <b>${esc(refs.get(n.sugerencia.expedienteId)!)}</b> (por ${esc(n.sugerencia.motivo)})` : " → sin expediente propuesto";
    const plazo = n.fechaLimite ? ` · plazo hasta el <b>${fecha(n.fechaLimite)}</b>` : "";
    return `<li><b>${esc(TIPO_NOTIFICACION_LABEL[n.tipo])}</b>${persona ? ` — ${esc(persona)}` : ""}${plazo}${prop}</li>`;
  }).join("");
  const n = o.importadas.length;
  const titulo = n === 1 ? "Notificación de la DEHú recibida" : `${n} notificaciones de la DEHú recibidas`;
  const cuerpo = `<ul style="padding-left:18px">${filas}</ul><p>Confírmalas en la pestaña DEHú: con un clic quedan en su expediente y, si es un requerimiento, se registra con su plazo.</p>`
    + (o.quedan ? `<p>Los otros ${o.quedan} adjunto(s) no eran notificaciones y siguen el camino de siempre.</p>` : "");
  const from = `"${o.gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const html = emailLayout({ gestoria: o.gestoria, titulo, cuerpoHtml: cuerpo, cta: { url: `${o.baseUrl}/app/dehu`, label: "Revisar en Aproba" } });
  const text = `${titulo}\n\n${cuerpo.replace(/<[^>]+>/g, "")}\n${o.baseUrl}/app/dehu`;
  const { error } = await resend.emails.send({ from, to: o.remitente, replyTo: direccionEntrante(o.token), subject: `Re: ${o.asunto || "Notificaciones"}`.slice(0, 200), html, text });
  if (error) console.error("[dehu email] respuesta no enviada:", error.message);
}

// La DEHú pide verificar la dirección de avisos: el owner recibe el CÓDIGO (nunca un
// enlace del email: si lo hay, se entra por la DEHú oficial).
async function avisarVerificacion(resend: Resend, o: { para: string; gestoria: string; codigo: string | null; baseUrl: string }) {
  const titulo = "La DEHú pide verificar tu dirección de avisos";
  const cuerpo = o.codigo
    ? `<p>Código de verificación: <b style="font-size:18px;letter-spacing:1px">${esc(o.codigo)}</b></p><p>Escríbelo en la DEHú (${esc(URL_DEHU.replace("https://", ""))}), en «Mis datos de contacto», donde añadiste tu dirección de Aproba.</p>`
    : `<p>La DEHú ha enviado un email de verificación a tu dirección de Aproba. Entra en la DEHú (${esc(URL_DEHU.replace("https://", ""))}) › «Mis datos de contacto» y termina la verificación desde allí. Por seguridad, Aproba no reenvía enlaces.</p>`;
  const from = `"${o.gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const html = emailLayout({ gestoria: o.gestoria, titulo, cuerpoHtml: cuerpo, cta: { url: `${o.baseUrl}/app/dehu`, label: "Ver en Aproba" } });
  const { error } = await resend.emails.send({ from, to: o.para, subject: titulo, html, text: `${titulo}\n\n${cuerpo.replace(/<[^>]+>/g, "")}` });
  if (error) console.error("[dehu email] verificación no enviada:", error.message);
}
