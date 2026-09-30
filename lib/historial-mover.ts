/* eslint-disable @typescript-eslint/no-explicit-any */
import { SERVICIO_A_TIPO } from "@/lib/tramites";

// HISTORIAL MIGRADO — cambiar de servicio lo que llegó de un sistema anterior (Luis, 30/09/2026).
// La migración dejó en un servicio genérico («Otros trámites de extranjería») servicios que
// tienen el suyo (sus notas lo dicen: «Desistimiento de asilo», «Desplazamientos rumanos»…).
// El despacho crea el servicio en Ajustes y mueve ahí cada fila desde Expedientes › Historial:
// el árbol y las estadísticas por servicio quedan bien clasificados.
//
// Una fila del historial es la factura CABECERA más sus pagos (`pagoDeId`, 25/09): se mueven
// juntas, o el mismo servicio contaría en dos carpetas. Las notas («Factura: …») no se tocan.
// Con la sesión del gestor: la RLS de ServicioHistorico y de ServicioConfig acota al despacho.
type Cli = any;

export type ResultadoMover =
  | { ok: true; movidas: number; label: string }
  | { ok: false; status: number; error: string };

// Las filas migradas llegan al navegador como «sh_<id>» (supabase/historial-pagos.sql).
export const idDeFilaMigrada = (id: string): string => (id.startsWith("sh_") ? id.slice(3) : id);

export async function moverHistorialAServicio(cli: Cli, filaId: string, clave: string, ahora = new Date()): Promise<ResultadoMover> {
  const id = idDeFilaMigrada(String(filaId ?? "").trim());
  const k = String(clave ?? "").trim();
  if (!id || !k) return { ok: false, status: 400, error: "Falta la fila o el servicio." };

  const { data: fila } = await cli.from("ServicioHistorico").select("id, workspaceId, pagoDeId").eq("id", id).maybeSingle();
  if (!fila) return { ok: false, status: 404, error: "No se encuentra esa fila del historial." };
  const cabecera: string = fila.pagoDeId ?? fila.id; // un pago suelto mueve a toda su fila

  const { data: svc } = await cli.from("ServicioConfig").select("clave, label").eq("workspaceId", fila.workspaceId).eq("clave", k).limit(1);
  const servicio = (svc ?? [])[0] as { clave: string; label: string | null } | undefined;
  if (!servicio) return { ok: false, status: 400, error: "Ese servicio no está en tu catálogo." };
  const label = (servicio.label ?? "").trim() || k;

  const cambios = { servicioClave: k, tipo: SERVICIO_A_TIPO[k] ?? "OTRO", etiqueta: label, updatedAt: ahora.toISOString() };
  let movidas = 0;
  for (const [col, valor] of [["id", cabecera], ["pagoDeId", cabecera]] as const) {
    const { data, error } = await cli.from("ServicioHistorico").update(cambios).eq("workspaceId", fila.workspaceId).eq(col, valor).select("id");
    if (error) return { ok: false, status: 500, error: "No se pudo cambiar el servicio." };
    movidas += (data ?? []).length;
  }
  if (!movidas) return { ok: false, status: 404, error: "No se encuentra esa fila del historial." };
  return { ok: true, movidas, label };
}
