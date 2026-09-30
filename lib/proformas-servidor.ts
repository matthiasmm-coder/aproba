import "server-only";
import { Resend } from "resend";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { emisorParaFijar, emisorParaOficina, conEmisorFijado, cuentaParaOficina } from "@/lib/facturacion-oficina";
import { siguienteNumeroProforma } from "@/lib/factura-numero";
import { aCobrar } from "@/lib/facturas";
import { crearFacturaManual, importesDeCuerpo, oficinaDeCuerpo, receptorDeCuerpo, type CuerpoDocumento, type Fallo } from "@/lib/factura-manual";
import { marcarFacturaPagada } from "@/lib/cobros-tarjeta";
import { facturaToPdf, type EmisorPdf } from "@/lib/export-pdf";
import { emailLayout, emailDeRespuesta, resendDisponible } from "@/lib/notificaciones";
import {
  AVISO_PROFORMA, COLS_PROFORMA, DIAS_VALIDEZ_PROFORMA, cuerpoFacturaDeProforma, mapFilaProforma, proformaBorrable, proformaComoFactura, proformaViva,
  type Proforma,
} from "@/lib/proformas";

// FACTURAS PROFORMA — parte con red (29/09/2026). Ver lib/proformas.ts para las reglas.
// Todo se escribe con el admin DESPUÉS de que la ruta haya comprobado el despacho bajo
// sesión; cada función vuelve a filtrar por workspaceId (anti-IDOR).

type Admin = ReturnType<typeof createSupabaseAdmin>;
export const ERROR_MIGRACION_PROFORMAS = "Falta la migración: ejecuta supabase/proformas.sql.";
const faltaTabla = (msg: string) => /Proforma|relation|schema cache|does not exist|PGRST205/i.test(msg);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtEur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export type CuerpoProforma = CuerpoDocumento & { validaHasta?: string | null };
type Ok<T> = { ok: true } & T;

export async function leerProforma(admin: Admin, workspaceId: string, id: string): Promise<Proforma | null> {
  const { data, error } = await admin.from("Proforma").select(COLS_PROFORMA).eq("id", id).eq("workspaceId", workspaceId).maybeSingle();
  if (error) throw new Error(faltaTabla(error.message) ? ERROR_MIGRACION_PROFORMAS : error.message);
  return data ? mapFilaProforma(data as Record<string, unknown>) : null;
}

// Válida hasta: la fecha elegida (AAAA-MM-DD) o, si no, DIAS_VALIDEZ_PROFORMA desde hoy.
function validezDe(v: unknown, desde: Date): string {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  // Mediodía UTC: el mismo día en Madrid en verano (UTC+2) y en invierno (UTC+1).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const d = new Date(`${s}T12:00:00Z`); if (!Number.isNaN(d.getTime()) && d > desde) return d.toISOString(); }
  return new Date(desde.getTime() + DIAS_VALIDEZ_PROFORMA * 86_400_000).toISOString();
}

// Los campos que salen del formulario, con los MISMOS cálculos que una factura manual.
async function camposDe(admin: Admin, workspaceId: string, body: CuerpoProforma): Promise<Ok<{ campos: Record<string, unknown> }> | Fallo> {
  const cliente = String(body.cliente ?? "").trim();
  const concepto = String(body.concepto ?? "").trim();
  if (!cliente || !concepto) return { ok: false, status: 400, error: "Faltan el cliente o el concepto." };
  const ofi = await oficinaDeCuerpo(admin, workspaceId, body.oficinaId);
  if (!ofi.ok) return ofi;
  const imp = importesDeCuerpo(body);
  if (!imp.ok) return { ok: false, status: 400, error: "El importe de la proforma debe ser mayor que 0" };
  const rec = await receptorDeCuerpo(admin, workspaceId, body);
  return {
    ok: true,
    campos: {
      oficinaId: ofi.oficinaId, clienteNombre: cliente, concepto,
      baseImponible: imp.baseImponible, iva: imp.iva, total: imp.total,
      lineas: body.avanzada ? imp.lineas : null, suplidos: body.avanzada ? imp.suplidos : null, notas: body.avanzada ? body.notas?.trim() || null : null,
      clienteDatos: rec.clienteDatos, clienteId: rec.clienteId, empresaId: rec.empresaId,
      retencionPct: imp.retencionPct, retencion: imp.retencionPct ? imp.retencion : null,
      // Emisor congelado, como en una factura: la identidad fiscal de la oficina (o del despacho).
      emisorDatos: await emisorParaFijar(admin, workspaceId, ofi.oficinaId),
    },
  };
}

export async function crearProforma(admin: Admin, o: { workspaceId: string; userId: string; body: CuerpoProforma }): Promise<Ok<{ proforma: Proforma }> | Fallo> {
  const c = await camposDe(admin, o.workspaceId, o.body);
  if (!c.ok) return c;
  const hoy = new Date();
  // Dos proformas creadas a la vez pueden pedir el mismo número: el índice único lo impide
  // y aquí se pide el siguiente (serie propia, sin huecos que importen).
  for (let intento = 0; intento < 4; intento++) {
    const id = crypto.randomUUID();
    const numero = await siguienteNumeroProforma(admin, o.workspaceId, hoy.getFullYear());
    const { error } = await admin.from("Proforma").insert({
      id, workspaceId: o.workspaceId, numero, estado: "PENDIENTE", fechaEmision: hoy.toISOString(),
      validaHasta: validezDe(o.body.validaHasta, hoy), creadoPorId: o.userId, ...c.campos, updatedAt: hoy.toISOString(),
    });
    if (!error) {
      const p = await leerProforma(admin, o.workspaceId, id);
      return p ? { ok: true, proforma: p } : { ok: false, status: 500, error: "No se pudo leer la proforma creada." };
    }
    if (/duplicate|unique/i.test(error.message)) continue;
    return { ok: false, status: 500, error: faltaTabla(error.message) ? ERROR_MIGRACION_PROFORMAS : error.message };
  }
  return { ok: false, status: 409, error: "No se pudo numerar la proforma. Vuelve a intentarlo." };
}

// Editar: mientras está viva (ni convertida ni anulada). El número no cambia.
export async function actualizarProforma(admin: Admin, o: { workspaceId: string; id: string; body: CuerpoProforma }): Promise<Ok<{ proforma: Proforma }> | Fallo> {
  const p = await leerProforma(admin, o.workspaceId, o.id);
  if (!p) return { ok: false, status: 404, error: "Proforma no encontrada." };
  if (!proformaViva(p.estado)) return { ok: false, status: 409, error: "Esta proforma ya no se puede modificar." };
  const c = await camposDe(admin, o.workspaceId, o.body);
  if (!c.ok) return c;
  const ahora = new Date();
  const { error } = await admin.from("Proforma").update({ ...c.campos, validaHasta: validezDe(o.body.validaHasta, ahora), updatedAt: ahora.toISOString() })
    .eq("id", o.id).eq("workspaceId", o.workspaceId).in("estado", ["PENDIENTE", "ENVIADA"]);
  if (error) return { ok: false, status: 500, error: error.message };
  const nueva = await leerProforma(admin, o.workspaceId, o.id);
  return nueva ? { ok: true, proforma: nueva } : { ok: false, status: 404, error: "Proforma no encontrada." };
}

export async function anularProforma(admin: Admin, o: { workspaceId: string; id: string }): Promise<Ok<{ proforma: Proforma }> | Fallo> {
  const p = await leerProforma(admin, o.workspaceId, o.id);
  if (!p) return { ok: false, status: 404, error: "Proforma no encontrada." };
  if (p.estado === "CONVERTIDA") return { ok: false, status: 409, error: "Ya se convirtió en factura: si hay que corregirla, emite una rectificativa de la factura." };
  if (p.estado === "ANULADA") return { ok: true, proforma: p };
  await admin.from("Proforma").update({ estado: "ANULADA", updatedAt: new Date().toISOString() }).eq("id", o.id).eq("workspaceId", o.workspaceId).is("facturaId", null);
  const nueva = await leerProforma(admin, o.workspaceId, o.id);
  return nueva ? { ok: true, proforma: nueva } : { ok: false, status: 404, error: "Proforma no encontrada." };
}

// Borrar: solo si nunca salió del despacho (o ya estaba anulada): su número se libera.
export async function borrarProforma(admin: Admin, o: { workspaceId: string; id: string }): Promise<{ ok: true } | Fallo> {
  const p = await leerProforma(admin, o.workspaceId, o.id);
  if (!p) return { ok: false, status: 404, error: "Proforma no encontrada." };
  if (!proformaBorrable(p.estado)) return { ok: false, status: 409, error: p.estado === "CONVERTIDA" ? "Ya se convirtió en factura: no se puede borrar." : "Ya se envió al cliente: anúlala en lugar de borrarla." };
  const { error } = await admin.from("Proforma").delete().eq("id", o.id).eq("workspaceId", o.workspaceId).is("facturaId", null);
  return error ? { ok: false, status: 500, error: error.message } : { ok: true };
}

// CONVERTIR en factura. Primero se «reserva» la proforma (convertidaAt, update condicional):
// un doble clic no puede emitir dos facturas. Si la factura no llega a nacer, se libera.
export async function convertirProforma(admin: Admin, o: {
  workspaceId: string; id: string; cobrada: boolean; metodo?: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO";
}): Promise<Ok<{ proforma: Proforma; facturaId: string; numero: string }> | Fallo> {
  const p = await leerProforma(admin, o.workspaceId, o.id);
  if (!p) return { ok: false, status: 404, error: "Proforma no encontrada." };
  if (p.estado === "CONVERTIDA" && p.facturaId) return { ok: false, status: 409, error: `Ya se convirtió en la factura ${p.facturaNumero ?? ""}.`.trim() };
  if (!proformaViva(p.estado)) return { ok: false, status: 409, error: "Una proforma anulada no se puede convertir." };
  const reserva = new Date().toISOString();
  const { data: tomada } = await admin.from("Proforma").update({ convertidaAt: reserva })
    .eq("id", o.id).eq("workspaceId", o.workspaceId).is("facturaId", null).is("convertidaAt", null).in("estado", ["PENDIENTE", "ENVIADA"]).select("id");
  if (!tomada?.length) return { ok: false, status: 409, error: "Esta proforma ya se está convirtiendo. Recarga la página." };

  const f = await crearFacturaManual(admin, o.workspaceId, cuerpoFacturaDeProforma(p));
  if (!f.ok) {
    await admin.from("Proforma").update({ convertidaAt: null }).eq("id", o.id).eq("convertidaAt", reserva);
    return f;
  }
  // El vínculo, primero: pase lo que pase con el cobro, la proforma ya no es convertible.
  await admin.from("Proforma").update({ estado: "CONVERTIDA", facturaId: f.id, updatedAt: new Date().toISOString() }).eq("id", o.id);
  if (o.cobrada) await marcarFacturaPagada(admin as never, f.id, o.metodo ?? "TRANSFERENCIA");
  const nueva = await leerProforma(admin, o.workspaceId, o.id);
  return { ok: true, proforma: nueva ?? { ...p, estado: "CONVERTIDA", facturaId: f.id, facturaNumero: f.numero }, facturaId: f.id, numero: f.numero };
}

// PDF de la proforma: el de las facturas (lib/export-pdf.ts), con su título y su aviso.
// El emisor, con la regla de la pantalla (app/app/facturas/proformas/[id]): la sede si tiene
// identidad fiscal propia, y manda el emisor congelado al crearla (facturaToPdf lo aplica).
// Hasta el 30/09/2026 el PDF partía siempre del despacho: la identidad salía bien gracias al
// congelado, pero el logo era el del despacho y no el de la sede.
export async function pdfDeProforma(admin: Admin, workspaceId: string, p: Proforma): Promise<Uint8Array> {
  const vivo = await emisorParaOficina(admin, workspaceId, p.oficinaId ?? null);
  const e = conEmisorFijado({ nombre: vivo.nombre, nif: vivo.nif, domicilio: vivo.domicilio, email: vivo.email }, p.emisorDatos);
  const emisor: EmisorPdf = { nombre: e.nombre || "Mi despacho", nif: e.nif, domicilio: e.domicilio, email: e.email, logo: vivo.logo };
  return facturaToPdf(proformaComoFactura(p), emisor, {
    titulo: "FACTURA PROFORMA", etiquetaVence: "Válida hasta", aviso: AVISO_PROFORMA, pie: "Factura proforma",
  });
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ENVIAR al cliente: el PDF adjunto, el importe y, si la sede tiene IBAN, cómo pagar.
export async function enviarProforma(admin: Admin, o: { workspaceId: string; id: string; para: string }): Promise<Ok<{ proforma: Proforma; simulado: boolean }> | Fallo> {
  const para = o.para.trim().toLowerCase();
  if (!EMAIL_OK.test(para)) return { ok: false, status: 400, error: "Escribe un email válido." };
  const p = await leerProforma(admin, o.workspaceId, o.id);
  if (!p) return { ok: false, status: 404, error: "Proforma no encontrada." };
  if (!proformaViva(p.estado)) return { ok: false, status: 409, error: "Esta proforma ya no se puede enviar." };

  const { data: ws } = await admin.from("Workspace").select("nombre, logoUrl").eq("id", o.workspaceId).maybeSingle();
  const gestoria = String((ws as { nombre?: string | null } | null)?.nombre ?? "Tu gestoría");
  const importe = aCobrar({ total: p.total, retencion: p.retencion });
  const cuenta = await cuentaParaOficina(admin, o.workspaceId, p.oficinaId).catch(() => null);
  const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const banco = cuenta?.iban
    ? `<p style="margin:14px 0 6px;font-family:${FUENTE};font-size:14px;color:#475569">Puedes pagar por <strong>transferencia bancaria</strong>:</p>
       <p style="margin:0;font-family:${FUENTE};font-size:14px;color:#1e293b">${cuenta.titular ? `${esc(cuenta.titular)}<br>` : ""}IBAN <strong style="font-family:'SFMono-Regular',Consolas,monospace">${esc(cuenta.iban)}</strong><br>Concepto: <strong>${esc(p.numero)}</strong></p>`
    : "";
  const html = emailLayout({
    gestoria, logoUrl: (ws as { logoUrl?: string | null } | null)?.logoUrl ?? null,
    titulo: `Factura proforma ${p.numero}`,
    cuerpoHtml: `<p style="margin:0 0 10px">Hola ${esc(p.cliente)},</p>
      <p style="margin:0">Te enviamos la factura proforma <strong>${esc(p.numero)}</strong> (${esc(p.concepto)}). El importe a pagar es de <strong>${fmtEur(importe)}</strong>, IVA incluido${p.validaHasta ? `, válido hasta el ${esc(p.validaHasta)}` : ""}.</p>
      ${banco}
      <p style="margin:14px 0 0;font-family:${FUENTE};font-size:13px;color:#64748b;line-height:1.6">Es un documento informativo, sin validez fiscal: la factura se emitirá cuando recibamos el pago. Te adjuntamos la proforma en PDF.</p>`,
    cta: null,
    footerNota: `Mensaje de ${gestoria}. Puedes responder a este correo.`,
    preheader: `Factura proforma ${p.numero} · ${fmtEur(importe)}`,
  });
  const text = [
    `Hola ${p.cliente},`,
    `Te enviamos la factura proforma ${p.numero} (${p.concepto}). Importe a pagar: ${fmtEur(importe)}, IVA incluido${p.validaHasta ? `, válido hasta el ${p.validaHasta}` : ""}.`,
    ...(cuenta?.iban ? [`Transferencia: IBAN ${cuenta.iban}${cuenta.titular ? ` (${cuenta.titular})` : ""}, concepto ${p.numero}.`] : []),
    "Es un documento informativo, sin validez fiscal: la factura se emitirá cuando recibamos el pago. Adjuntamos la proforma en PDF.",
  ].join("\n\n");

  let simulado = true;
  if (resendDisponible()) {
    const pdf = await pdfDeProforma(admin, o.workspaceId, p);
    const responder = await emailDeRespuesta(admin as never, o.workspaceId);
    const from = `"${gestoria.replace(/["\\\r\n]/g, " ").trim()}" <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: para, subject: `Factura proforma ${p.numero} · ${gestoria}`.slice(0, 200), html, text,
      attachments: [{ filename: `proforma_${p.numero}.pdf`, content: Buffer.from(pdf) }],
      ...(responder ? { replyTo: responder } : {}),
    });
    if (error) return { ok: false, status: 502, error: `No se pudo enviar el email: ${error.message}` };
    simulado = false;
  }
  const ahora = new Date().toISOString();
  await admin.from("Proforma").update({ estado: "ENVIADA", enviadaAt: ahora, enviadaA: para, updatedAt: ahora }).eq("id", o.id).eq("workspaceId", o.workspaceId).in("estado", ["PENDIENTE", "ENVIADA"]);
  console.log(`[proforma ${simulado ? "SIMULADO" : "ENVIADO"}] ${p.numero} → ${para}`);
  const nueva = await leerProforma(admin, o.workspaceId, o.id);
  return { ok: true, proforma: nueva ?? p, simulado };
}
