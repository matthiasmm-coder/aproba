import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarMandato, type DatosEncargo, type PersonaEncargo } from "@/lib/encargo";
import { rellenarMandatoConsejo } from "@/lib/mandato-consejo";
import { camposMandatoConsejo, mandatoConsejoValido, modeloDeServicio, type ModeloMandato } from "@/lib/mandato-modelos";
import { TIPO_A_SERVICIO } from "@/lib/tramites";

// EL MANDATO de un expediente, decidido en UN solo sitio (26/09/2026). Antes cada salida
// —descarga del gestor, email al cliente, portal, trabajador, encargo manual— repetía su
// propia lógica del «mandato propio». Orden:
//   1. Modelo OFICIAL del Consejo (si el despacho lo activó y el servicio es de extranjería
//      o de nacionalidad): el impreso del Consejo rellenado (lib/mandato-consejo).
//   2. Mandato PROPIO subido en Ajustes: tal cual, sin relleno (petición de Juan, 06/08).
//   3. El mandato que maqueta Aproba con los datos del expediente (generarMandato).
// `editable`: solo la descarga del gestor; lo que va al cliente sale plano.

export type ExpMandato = { workspaceId: string; tipo: string; servicioClave?: string | null };
export type MandatoGenerado = { bytes: Uint8Array; origen: Exclude<ModeloMandato, "general"> | "propio" | "aproba" };

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
  if (modelo !== "general") {
    // El mandante es la PERSONA representada (cliente-empresa: el trabajador, no la empresa).
    const pm = persona ?? datos.persona ?? datos.cliente;
    const campos = camposMandatoConsejo(modelo, { mandante: pm, mandatario: datos.mandatario, despachoDomicilio: datos.despacho.domicilio });
    return { bytes: await rellenarMandatoConsejo(modelo, campos, opts), origen: modelo };
  }

  try {
    const { data } = await admin.from("Workspace").select("mandatoPropioPath").eq("id", exp.workspaceId).maybeSingle();
    const path = (data as { mandatoPropioPath?: string | null } | null)?.mandatoPropioPath;
    if (path) {
      const { data: blob, error } = await admin.storage.from("documentos").download(path);
      if (!error && blob) return { bytes: new Uint8Array(await blob.arrayBuffer()), origen: "propio" };
      console.error("[mandato] mandato propio ilocalizable, repli al generado:", path, error?.message);
    }
  } catch { /* columna sin migrar → el generado */ }

  return { bytes: await generarMandato(datos, persona), origen: "aproba" };
}
