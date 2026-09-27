import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarMandato, type DatosEncargo, type PersonaEncargo } from "@/lib/encargo";
import { rellenarMandatoConsejo } from "@/lib/mandato-consejo";
import { camposMandatoConsejo, mandatoConsejoValido, modeloDeServicio, type ModeloConsejo } from "@/lib/mandato-modelos";
import { TIPO_A_SERVICIO } from "@/lib/tramites";

// EL MANDATO de un expediente, decidido en UN solo sitio (26/09/2026) para todas las salidas
// —descarga del gestor, email al cliente, portal, trabajador, encargo manual—:
//   1. Modelo OFICIAL del Consejo (si el despacho lo activó): el impreso que toque al servicio
//      —extranjería, nacionalidad o general— rellenado (lib/mandato-consejo).
//   2. Si no, el mandato que maqueta Aproba con los datos del expediente (generarMandato).
// El «mandato propio» subido en PDF (06/08) se retiró el 27/09/2026: ningún despacho lo usaba
// y salía sin rellenar; la columna Workspace.mandatoPropioPath queda en la base, sin leerse.
// `editable`: solo la descarga del gestor; lo que va al cliente sale plano.

export type ExpMandato = { workspaceId: string; tipo: string; servicioClave?: string | null };
export type MandatoGenerado = { bytes: Uint8Array; origen: ModeloConsejo | "aproba" };

export async function mandatoDelExpediente(
  admin: SupabaseClient,
  exp: ExpMandato,
  datos: DatosEncargo,
  persona?: PersonaEncargo,
  opts: { editable: boolean } = { editable: false },
): Promise<MandatoGenerado> {
  // Columnas leídas por separado y con tolerancia: sin su migración, cada una vale null.
  let cfg: ReturnType<typeof mandatoConsejoValido> = null;
  try {
    const { data, error } = await admin.from("Workspace").select("mandatoConsejo").eq("id", exp.workspaceId).maybeSingle();
    if (!error) cfg = mandatoConsejoValido((data as { mandatoConsejo?: unknown } | null)?.mandatoConsejo);
  } catch { /* supabase/mandato-consejo.sql sin aplicar */ }

  // El servicio PRINCIPAL decide (datosEncargo lo resolvió el primero, con su etiqueta).
  const clave = exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo] ?? "";
  const modelo = modeloDeServicio({ id: clave, label: datos.servicios[0]?.label ?? "" }, cfg);
  if (modelo !== "siempre") {
    // El mandante es la PERSONA representada (cliente-empresa: el trabajador, no la empresa).
    const pm = persona ?? datos.persona ?? datos.cliente;
    const campos = camposMandatoConsejo(modelo, { mandante: pm, mandatario: datos.mandatario, despachoNombre: datos.despacho.nombre, despachoDomicilio: datos.despacho.domicilio });
    return { bytes: await rellenarMandatoConsejo(modelo, campos, opts), origen: modelo };
  }

  return { bytes: await generarMandato(datos, persona), origen: "aproba" };
}
