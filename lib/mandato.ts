import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { generarMandato, type CajaFirma, type DatosEncargo, type PersonaEncargo } from "@/lib/encargo";
import { rellenarMandatoConsejo } from "@/lib/mandato-consejo";
import { camposMandatoConsejo, mandatoConsejoValido, modelosDeServicios, type ModeloConsejo, type ModeloMandato } from "@/lib/mandato-modelos";
import { unirPdfs } from "@/lib/pdf-unir";
import { TIPO_A_SERVICIO } from "@/lib/tramites";

// EL MANDATO de un expediente, decidido en UN solo sitio (26/09/2026) para todas las salidas
// —descarga del gestor, email al cliente, portal, trabajador, encargo manual—.
//   · Cada servicio lleva su modelo: el OFICIAL del Consejo que toque (extranjería,
//     nacionalidad o general) si el despacho lo eligió, o el que maqueta Aproba.
//   · Expediente MULTI-SERVICIO (27/09/2026): un mandato por cada modelo DISTINTO, todos en UN
//     solo PDF (el cliente firma cada página y sube un archivo). Un NIE con un alta de autónomo
//     lleva el de extranjería Y el general; si todos coinciden, uno solo, como siempre.
// El «mandato propio» subido en PDF (06/08) se retiró el 27/09/2026: ningún despacho lo usaba
// y salía sin rellenar; la columna Workspace.mandatoPropioPath queda en la base, sin leerse.
// `editable`: solo la descarga del gestor; lo que va al cliente sale plano.

export type ExpMandato = { workspaceId: string; tipo: string; servicioClave?: string | null };
export type MandatoGenerado = { bytes: Uint8Array; modelos: ModeloMandato[] };

// Prefijo de los campos de cada impreso cuando van varios en el mismo PDF (lib/pdf-unir).
const PREFIJO: Record<ModeloMandato, string> = { extranjeria: "ext_", nacionalidad: "nac_", general: "gen_", siempre: "apr_" };

// Qué modelos lleva el mandato de este expediente (uno por modelo DISTINTO entre sus
// servicios, el principal primero) y la persona que firma como mandante.
async function modelosDelExpediente(admin: SupabaseClient, exp: ExpMandato, datos: DatosEncargo) {
  // Columna leída aparte y con tolerancia: sin su migración, vale null (el de Aproba).
  let cfg: ReturnType<typeof mandatoConsejoValido> = null;
  try {
    const { data, error } = await admin.from("Workspace").select("mandatoConsejo").eq("id", exp.workspaceId).maybeSingle();
    if (!error) cfg = mandatoConsejoValido((data as { mandatoConsejo?: unknown } | null)?.mandatoConsejo);
  } catch { /* supabase/mandato-consejo.sql sin aplicar */ }

  // Los servicios del expediente tal como los resolvió datosEncargo (principal primero).
  const principal = exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo] ?? "";
  const servicios = datos.servicios.length
    ? datos.servicios.map((sv, i) => ({ id: sv.clave ?? (i === 0 ? principal : ""), label: sv.labelBase ?? sv.label }))
    : [{ id: principal, label: "" }];
  return modelosDeServicios(servicios, cfg);
}

export async function mandatoDelExpediente(
  admin: SupabaseClient,
  exp: ExpMandato,
  datos: DatosEncargo,
  persona?: PersonaEncargo,
  opts: { editable: boolean } = { editable: false },
): Promise<MandatoGenerado> {
  const modelos = await modelosDelExpediente(admin, exp, datos);
  // El mandante es la PERSONA representada (cliente-empresa: el trabajador, no la empresa).
  const pm = persona ?? datos.persona ?? datos.cliente;
  const uno = async (m: ModeloMandato) => m === "siempre"
    ? generarMandato(datos, persona)
    : rellenarMandatoConsejo(m, camposMandatoConsejo(m, { mandante: pm, mandatario: datos.mandatario, despachoNombre: datos.despacho.nombre, despachoDomicilio: datos.despacho.domicilio }), opts);

  if (modelos.length === 1) return { bytes: await uno(modelos[0]), modelos };
  const partes = [];
  for (const m of modelos) partes.push({ bytes: await uno(m), prefijo: PREFIJO[m] });
  return { bytes: await unirPdfs(partes, opts), modelos };
}

// Casilla del MANDANTE en los impresos oficiales del Consejo (una página cada uno): el hueco en
// blanco bajo «EL MANDANTE», antes del párrafo del mandatario (medido sobre las plantillas).
const CAJA_CONSEJO: Record<ModeloConsejo, { x: number; y: number; w: number; h: number }> = {
  extranjeria: { x: 205, y: 134, w: 185, h: 34 },
  nacionalidad: { x: 205, y: 146, w: 185, h: 34 },
  general: { x: 190, y: 148, w: 180, h: 34 },
};

// El MISMO mandato para FIRMARLO EN LÍNEA (lib/firma): mismos modelos, siempre plano (lo que
// el cliente revisa es exactamente lo que firma) y con la casilla del mandante de CADA página.
export async function mandatoParaFirma(
  admin: SupabaseClient, exp: ExpMandato, datos: DatosEncargo, persona?: PersonaEncargo,
): Promise<MandatoGenerado & { cajas: CajaFirma[] }> {
  const modelos = await modelosDelExpediente(admin, exp, datos);
  const pm = persona ?? datos.persona ?? datos.cliente;
  const partes: { bytes: Uint8Array; prefijo: string }[] = [];
  const cajas: CajaFirma[] = [];
  let paginas = 0;
  for (const m of modelos) {
    let bytes: Uint8Array;
    let propias: CajaFirma[];
    if (m === "siempre") {
      const salida = { cajas: [] as CajaFirma[] };
      bytes = await generarMandato(datos, persona, { salida });
      propias = salida.cajas.filter((c) => c.etiqueta === "EL MANDANTE");
    } else {
      bytes = await rellenarMandatoConsejo(m, camposMandatoConsejo(m, { mandante: pm, mandatario: datos.mandatario, despachoNombre: datos.despacho.nombre, despachoDomicilio: datos.despacho.domicilio }), { editable: false });
      propias = [{ etiqueta: "EL MANDANTE", pagina: 0, ...CAJA_CONSEJO[m] }];
    }
    cajas.push(...propias.map((c) => ({ ...c, pagina: c.pagina + paginas })));
    paginas += (await PDFDocument.load(bytes)).getPageCount();
    partes.push({ bytes, prefijo: PREFIJO[m] });
  }
  return { bytes: await unirPdfs(partes, { editable: false }), modelos, cajas };
}
