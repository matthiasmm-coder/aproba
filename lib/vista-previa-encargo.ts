import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { datosEncargo, generarHojaEncargo, generarMandato } from "@/lib/encargo";
import { mandatoDelExpediente } from "@/lib/mandato";
import { rellenarMandatoConsejo } from "@/lib/mandato-consejo";
import { camposMandatoConsejo, type ModeloConsejo } from "@/lib/mandato-modelos";

// VISTA PREVIA de los documentos del despacho (01/10/2026, Matthias): SU hoja de encargo, SU
// presupuesto y SUS mandatos tal como saldrán —sus datos, su profesional responsable, sus formas
// de pago, su logo, su modelo de mandato— con un cliente y un expediente de ejemplo. Los MISMOS
// generadores que la ficha del expediente (lib/encargo, lib/mandato): lo que se ve es lo que
// firmará el cliente. Cada página lleva arriba «VISTA PREVIA» para que nadie la mande a firmar.

export type DocVistaPrevia = "hoja" | "presupuesto" | "mandato";
export const MODELOS_VISTA_PREVIA = ["extranjeria", "nacionalidad", "general", "siempre"] as const;
export type ModeloVistaPrevia = (typeof MODELOS_VISTA_PREVIA)[number];

// Un cliente de ejemplo con TODOS los datos: así se ve dónde cae cada uno en el impreso.
export const CLIENTE_EJEMPLO: Record<string, string> = {
  nombre: "Laura", apellidos: "Ejemplo Martínez", numeroDocumento: "Y1234567X", pasaporte: "AB1234567",
  nacionalidad: "Colombia", via: "Calle Mayor", numeroVia: "12", piso: "3º B", codigoPostal: "28013",
  municipio: "Madrid", provincia: "Madrid", telefono: "+34 600 000 000", email: "cliente@ejemplo.com",
};
const EXP_INEXISTENTE = "00000000-0000-0000-0000-000000000000"; // ninguna fila: presupuesto y empresa por defecto
export const AVISO_VISTA_PREVIA = "VISTA PREVIA · datos de ejemplo · no es un documento para firmar";

async function marcarVistaPrevia(bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const ancho = font.widthOfTextAtSize(AVISO_VISTA_PREVIA, 7.5);
    page.drawText(AVISO_VISTA_PREVIA, { x: (width - ancho) / 2, y: height - 16, size: 7.5, font, color: rgb(0.85, 0.35, 0.1) });
  }
  return pdf.save();
}

export type ResultadoVistaPrevia = { ok: true; bytes: Uint8Array; nombre: string } | { ok: false; status: number; error: string };

// `oficinaId` ya validado contra el despacho por el llamante (anti-IDOR).
export async function vistaPreviaEncargo(admin: SupabaseClient, o: {
  workspaceId: string; oficinaId: string | null; doc: DocVistaPrevia; modelo: ModeloVistaPrevia | null; servicio?: string | null;
}): Promise<ResultadoVistaPrevia> {
  const catalogo = await fetchServiciosDeWorkspace(admin, o.workspaceId, o.oficinaId).catch(() => []);
  const servicio = catalogo.find((s) => s.id === o.servicio) ?? catalogo.find((s) => s.active) ?? catalogo[0];
  if (!servicio) return { ok: false, status: 409, error: "Tu catálogo no tiene servicios: crea uno en Ajustes › Servicios para ver el ejemplo." };

  const exp = {
    id: EXP_INEXISTENTE, referencia: "EJEMPLO-0001", tipo: "OTRO", servicioClave: servicio.id, serviciosExtra: [],
    suplidosOverride: null, descuento: null, serviciosAsignacion: null, familiaId: null,
    workspaceId: o.workspaceId, oficinaId: o.oficinaId, cliente: CLIENTE_EJEMPLO,
  };
  const datos = await datosEncargo(admin, exp);
  if (!datos) return { ok: false, status: 409, error: "Completa primero los datos del despacho (nombre) en Ajustes." };

  let bytes: Uint8Array;
  if (o.doc !== "mandato") bytes = await generarHojaEncargo(datos, o.doc === "presupuesto" ? "presupuesto" : "encargo");
  else if (o.modelo === "siempre") bytes = await generarMandato(datos);
  else if (o.modelo) {
    const m: ModeloConsejo = o.modelo;
    bytes = await rellenarMandatoConsejo(m, camposMandatoConsejo(m, { mandante: datos.cliente, mandatario: datos.mandatario, despachoNombre: datos.despacho.nombre, despachoDomicilio: datos.despacho.domicilio }), { editable: false });
  } else bytes = (await mandatoDelExpediente(admin, exp, datos)).bytes;

  const nombre = o.doc === "mandato" ? `vista-previa-mandato${o.modelo && o.modelo !== "siempre" ? `-${o.modelo}` : ""}.pdf`
    : o.doc === "presupuesto" ? "vista-previa-presupuesto.pdf" : "vista-previa-hoja-de-encargo.pdf";
  return { ok: true, bytes: await marcarVistaPrevia(bytes), nombre };
}
