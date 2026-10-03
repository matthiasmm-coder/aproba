import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logoDelExpediente } from "@/lib/marca";
import { enmascararEmail, estadoVisibleSobre, type DocFirmable, type EstadoVisibleSobre } from "@/lib/firma/sobre";
import type { SobreFila } from "@/lib/firma/servicio";

// Lo que la PÁGINA DE FIRMA (pública, por enlace secreto) puede saber de un sobre: nunca el
// email completo, la huella del código ni las rutas internas.
export type SobrePublico = {
  estado: EstadoVisibleSobre;
  despacho: { nombre: string; logoUrl: string | null };
  firmante: { nombre: string; email: string; esEmpresa: boolean };
  documentos: { doc: DocFirmable; paginas: number; firmado: boolean }[];
  idioma: string;
  expiraAt: string | null;
  firmadoAt: string | null;
  portalToken: string | null;
};

export async function sobrePublico(admin: SupabaseClient, s: SobreFila): Promise<SobrePublico> {
  const { data } = await admin.from("Expediente").select("portalToken, Workspace(nombre)").eq("id", s.expedienteId).maybeSingle();
  const e = data as { portalToken: string | null; Workspace: { nombre: string } | { nombre: string }[] | null } | null;
  return {
    estado: estadoVisibleSobre(s),
    despacho: { nombre: (Array.isArray(e?.Workspace) ? e?.Workspace[0] : e?.Workspace)?.nombre ?? "", logoUrl: await logoDelExpediente(admin, s.expedienteId) },
    firmante: { nombre: s.firmanteNombre ?? "", email: enmascararEmail(s.firmanteEmail), esEmpresa: !s.clienteId },
    documentos: s.documentos.map((d) => ({ doc: d.doc, paginas: d.paginas, firmado: Boolean(d.firmadoPath) })),
    idioma: s.idioma ?? "es",
    expiraAt: s.expiraAt,
    firmadoAt: s.firmadoAt,
    portalToken: e?.portalToken ?? null,
  };
}

// La clave del servidor con la que se firma la huella del código (nunca en la base).
export function secretoFirma(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!s) throw new Error("Falta la clave del servidor para la firma.");
  return s;
}
