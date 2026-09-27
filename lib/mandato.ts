import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarMandato, type DatosEncargo, type PersonaEncargo } from "@/lib/encargo";
import { rellenarMandatoConsejo } from "@/lib/mandato-consejo";
import { camposMandatoConsejo, mandatoConsejoValido, modelosDeServicios, type ModeloMandato } from "@/lib/mandato-modelos";
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

export async function mandatoDelExpediente(
  admin: SupabaseClient,
  exp: ExpMandato,
  datos: DatosEncargo,
  persona?: PersonaEncargo,
  opts: { editable: boolean } = { editable: false },
): Promise<MandatoGenerado> {
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
  const modelos = modelosDeServicios(servicios, cfg);

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
