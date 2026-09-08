import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { esDocumentoDeIdentidad, fichaDesdeCampos, huecosDeFicha } from "@/lib/ficha-extraccion";
import { FICHA_CAMPOS, FICHA_KEYS } from "@/lib/ficha";

type Admin = ReturnType<typeof createSupabaseAdmin>;

// Lo que la IA lee en un documento de identidad entra en la ficha del cliente — en los
// campos VACÍOS solamente: lo que escribió una persona no se toca nunca. Un único punto
// para todas las entradas (portal, subida del gestor, email reenviado a la bandeja):
// la queja de Asenjo Global (08/09/2026) fue justamente que los documentos llegados por
// email se clasificaban pero su contenido no llegaba a «Información».
// Devuelve las etiquetas de los campos rellenados (vacío = nada que rellenar).
export async function completarFichaDesdeExtraccion(
  admin: Admin,
  clienteId: string | null | undefined,
  r: { estado: string; tipoDetectado: string; campos: { label: string; value: string }[] },
): Promise<string[]> {
  if (!clienteId || r.estado !== "VALIDADO" || !esDocumentoDeIdentidad(r.tipoDetectado)) return [];
  try {
    const { data: fila } = await admin.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", clienteId).maybeSingle();
    const huecos = huecosDeFicha((fila as Record<string, unknown> | null) ?? null, fichaDesdeCampos(r.campos));
    const claves = Object.keys(huecos);
    if (!claves.length) return [];
    const { error } = await admin.from("Cliente").update(huecos).eq("id", clienteId);
    if (error) { console.warn("[ficha desde extracción]", error.message); return []; }
    return claves.map((k) => FICHA_CAMPOS.find((c) => c.k === k)?.label ?? k);
  } catch (err) {
    console.warn("[ficha desde extracción]", err instanceof Error ? err.message : err);
    return [];
  }
}
