import "server-only";
import type { Resend } from "resend";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { emailLayout } from "@/lib/notificaciones";
import { direccionEntrante, MARCADOR } from "@/lib/email-entrante";
import { fetchExpedienteDetallePorToken } from "@/lib/data/expedientes";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { docsDeExpediente, serviciosDeExpediente } from "@/lib/multi-servicio";
import { docsFaltantes } from "@/lib/tramites";
import { camposQueFaltan } from "@/lib/ficha";
import { formulariosDelTramite, rellenarOficial, P2_OPCIONES } from "@/lib/ex-forms";
import { datosNormalizados } from "@/lib/formularios";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { randomUUID as uuid } from "node:crypto";

type Admin = ReturnType<typeof createSupabaseAdmin>;

// ─────────────────────────────────────────────────────────────────────────────
// RESPUESTA EN EL HILO (06/09/2026, principio «Aproba se adapta al gestor»): el gestor
// reenvía un email y recibe, en el mismo hilo, lo que Aproba hizo con él — sin abrir la
// app. Documentos colocados, lo que aún falta y, si la ficha está completa, los
// formularios oficiales ya rellenados como adjuntos. Si no se sabe de qué cliente es, se
// le pide el nombre en una respuesta; el marcador del asunto cierra el círculo.
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoRespuesta = { enviado: boolean; formularios: string[]; docsFaltan: string[]; datosFaltan: string[] };

export async function responderAlGestor(admin: Admin, resend: Resend, o: {
  workspaceId: string; gestoria: string; token: string; para: string; asunto: string; filaId: string; baseUrl: string;
  nAdjuntos: number; etiquetas: string[];
  clienteId: string | null; clienteNombre: string | null; expedienteId: string | null;
  candidatos?: string[]; // nombres posibles cuando la pista es ambigua
  creado?: string[]; // cliente CREADO desde el email: campos de la ficha leídos del documento
  userId?: string | null; // gestor que reenvió (para el diario)
}): Promise<ResultadoRespuesta> {
  const from = `"${o.gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const replyTo = direccionEntrante(o.token);
  const asuntoBase = (o.asunto || "Documentos").replace(/^\s*(re|fwd?|rv|tr)\s*:\s*/gi, "").slice(0, 120);
  const res: ResultadoRespuesta = { enviado: false, formularios: [], docsFaltan: [], datosFaltan: [] };
  const attachments: { filename: string; content: Buffer }[] = [];
  let titulo: string; let cuerpo: string; let cta: { url: string; label: string } | null = null; let subject: string;

  if (!o.clienteId) {
    // Pendiente: pedir el nombre en una respuesta (el marcador identifica la fila).
    const marcador = MARCADOR(o.filaId);
    subject = `Re: ${asuntoBase} · ¿de quién es? ${marcador}`;
    titulo = "He guardado los adjuntos, pero no sé de qué cliente son";
    const lista = (o.candidatos ?? []).slice(0, 5);
    cuerpo = `<p>Guardé ${o.nAdjuntos} adjunto(s) del email «${esc(o.asunto)}».</p>`
      + (lista.length ? `<p>Podría ser uno de estos clientes: <b>${lista.map(esc).join("</b>, <b>")}</b>.</p>` : "")
      + `<p><b>Responde a este email con el nombre completo del cliente</b> (o su NIE, pasaporte o teléfono) y lo coloco en su expediente. Si es un cliente nuevo, dímelo también y lo creo.</p>`;
    cta = { url: `${o.baseUrl}/app/bandeja`, label: "O asignarlo en la bandeja" };
  } else if (!o.expedienteId) {
    subject = `Re: ${asuntoBase}`;
    if (o.creado) {
      titulo = `He creado a ${o.clienteNombre ?? "el cliente"} y guardado sus documentos`;
      const origen = o.creado.length ? `con lo que dice su documento de identidad (${o.creado.map(esc).join(", ")})` : "con el nombre que me has dado";
      const docs = o.nAdjuntos > 0 ? ` y ${o.nAdjuntos} documento(s) en su ficha${o.etiquetas.length ? ` (${o.etiquetas.map(esc).join(", ")})` : ""}` : "";
      cuerpo = `<p>No lo tenía: he creado a <b>${esc(o.clienteNombre ?? "")}</b> ${origen}${docs}.</p>`
        + (o.creado.length ? `<p>Revisa la ficha por si algo está mal leído. ` : `<p>Completa su ficha cuando tengas su pasaporte: reenvíamelo y la relleno. `) + `Cuando le abras un expediente, sus documentos caerán en sus casillas.</p>`;
    } else {
      titulo = `Guardado en la ficha de ${o.clienteNombre ?? "el cliente"}`;
      cuerpo = `<p>${o.nAdjuntos} documento(s) guardado(s) en la ficha de <b>${esc(o.clienteNombre ?? "")}</b>${o.etiquetas.length ? ` (${o.etiquetas.map(esc).join(", ")})` : ""}.</p>`
        + `<p>No tiene ningún expediente abierto: cuando le abras uno, estos documentos caerán en sus casillas.</p>`;
    }
    cta = { url: `${o.baseUrl}/app/clientes/${o.clienteId}`, label: o.creado ? "Revisar su ficha" : "Abrir su ficha" };
  } else {
    // Expediente: lo que se colocó, lo que falta y, si se puede, los formularios rellenados.
    const d = await detalleParaRespuesta(admin, o.expedienteId, o.userId ?? null);
    res.formularios = d.formularios.map((f) => f.code); res.docsFaltan = d.docsFaltan; res.datosFaltan = d.datosFaltan;
    for (const f of d.formularios) attachments.push({ filename: f.filename, content: f.content });
    subject = `Re: ${asuntoBase}`;
    titulo = `${o.clienteNombre ?? "Cliente"} · ${d.referencia ?? "expediente"}: ${o.nAdjuntos} documento(s) colocado(s)`;
    cuerpo = `<p>Colocado en el expediente <b>${esc(d.referencia ?? "")}</b>${o.etiquetas.length ? `: ${o.etiquetas.map(esc).join(", ")}` : ""}.</p>`;
    if (d.docsFaltan.length) cuerpo += `<p><b>Todavía falta:</b> ${d.docsFaltan.map(esc).join(", ")}.</p>`;
    else cuerpo += `<p><b>Documentación completa.</b></p>`;
    if (d.formularios.length) cuerpo += `<p><b>Formularios rellenados y adjuntos</b> (${d.formularios.map((f) => esc(f.code)).join(", ")}): ábrelos, revísalos y firma antes de presentar.</p>`;
    else if (d.datosFaltan.length) cuerpo += `<p>Para rellenar los formularios faltan datos en su ficha: ${d.datosFaltan.map(esc).join(", ")}.</p>`;
    cta = { url: `${o.baseUrl}/app/expedientes/${o.expedienteId}`, label: "Ver el expediente" };
  }

  const html = emailLayout({ gestoria: o.gestoria, titulo, cuerpoHtml: cuerpo, cta, footerNota: "Responde a este email para añadir documentos o decirme de quién son." });
  const text = `${titulo}\n\n${cuerpo.replace(/<[^>]+>/g, "")}\n${cta ? cta.url : ""}`;
  const { error } = await resend.emails.send({ from, to: o.para, replyTo, subject, html, text, ...(attachments.length ? { attachments } : {}) });
  if (error) console.error("[email respuesta] no enviada:", error.message); else res.enviado = true;
  return res;
}

// Lo que falta y los formularios listos, calculado como en la ficha (mismo catálogo por sede).
async function detalleParaRespuesta(admin: Admin, expedienteId: string, userId: string | null): Promise<{ referencia: string | null; docsFaltan: string[]; datosFaltan: string[]; formularios: { code: string; filename: string; content: Buffer }[] }> {
  const vacio = { referencia: null, docsFaltan: [], datosFaltan: [], formularios: [] as { code: string; filename: string; content: Buffer }[] };
  const { data: row } = await admin.from("Expediente").select("id, referencia, portalToken, workspaceId, oficinaId").eq("id", expedienteId).maybeSingle();
  const r = row as { id: string; referencia: string; portalToken: string | null; workspaceId: string; oficinaId: string | null } | null;
  if (!r?.portalToken) return vacio;
  const exp = await fetchExpedienteDetallePorToken(r.portalToken);
  if (!exp) return vacio;
  let docsFaltan: string[] = [];
  try {
    const catalogo = await fetchServiciosDeWorkspace(admin, r.workspaceId, r.oficinaId ?? null);
    const requeridos = docsDeExpediente(serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipoEnum }, catalogo), exp.docsExtra);
    docsFaltan = docsFaltantes(requeridos, exp.documentos);
  } catch (err) { console.error("[email respuesta] docs requeridos:", err instanceof Error ? err.message : err); }
  const datosFaltan = exp.familiaId ? [] : camposQueFaltan(exp.clienteFicha);
  const formularios: { code: string; filename: string; content: Buffer }[] = [];
  if (!exp.familiaId && datosFaltan.length === 0) {
    const codes = (exp.formulariosCurados ? exp.formularios.map((f) => f.code) : formulariosDelTramite(exp.tipoEnum, [exp.servicioClave, ...exp.serviciosExtra])).slice(0, 3);
    if (codes.length) {
      let p2: Record<string, string> = {}; try { p2 = await fetchP2Overrides(admin, exp.id); } catch { /* sin overrides */ }
      const datos = datosNormalizados(exp);
      for (const code of codes) {
        try {
          const persistido = p2[code]; const valido = Boolean(persistido && P2_OPCIONES[code]?.some((op) => op.value === persistido));
          const pdf = await rellenarOficial(code, datos, valido ? persistido : exp.tipoEnum, undefined, { editable: true });
          if (pdf) formularios.push({ code, filename: `${code}_${limpio(exp.referencia)}.pdf`, content: Buffer.from(pdf) });
        } catch (err) { console.error(`[email respuesta] ${code}:`, err instanceof Error ? err.message : err); }
      }
      if (formularios.length) {
        // Igual que «Generar»: el expediente sabe que están hechos (guía, progreso, memoria).
        const actuales = (exp.formulariosGenerados ?? []) as string[];
        const union = [...new Set([...actuales, ...formularios.map((f) => f.code)])];
        const up = await admin.from("Expediente").update({ formulariosGenerados: union }).eq("id", exp.id);
        if (up.error) console.error("[email respuesta] formulariosGenerados:", up.error.message);
        await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: exp.id, tipo: "FORM_GENERADO", descripcion: `Formularios rellenados y enviados por email: ${formularios.map((f) => f.code).join(", ")}`, userId });
      }
    }
  }
  return { referencia: exp.referencia, docsFaltan, datosFaltan, formularios };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
const limpio = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_");
