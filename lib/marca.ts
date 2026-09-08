import type { SupabaseClient } from "@supabase/supabase-js";
import { emisorParaOficina } from "@/lib/facturacion-oficina";

// LOGO del despacho para todo lo que ve el CLIENTE (portal /j, /s, /c y emails de aviso).
// Misma cascada que la factura y la hoja de encargo (emisorParaOficina): el logo de la
// sede del expediente si lo tiene, si no el del despacho (Ajustes › Facturación). Sin
// logo → null y cada superficie enseña las iniciales del despacho, como hasta ahora.
// Pedido de Asenjo Global (08/09/2026): «que se vea nuestro logo en el portal y en los
// emails al cliente», no solo en la factura.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cli = SupabaseClient<any, any, any>;

export async function logoDelWorkspace(cli: Cli, workspaceId: string, oficinaId: string | null = null): Promise<string | null> {
  try {
    const e = await emisorParaOficina(cli, workspaceId, oficinaId);
    return (e.logo ?? "").trim() || null;
  } catch { return null; }
}

export async function logoDelExpediente(cli: Cli, expedienteId: string | null | undefined): Promise<string | null> {
  if (!expedienteId) return null;
  try {
    const { data } = await cli.from("Expediente").select("workspaceId, oficinaId").eq("id", expedienteId).maybeSingle();
    const e = data as { workspaceId?: string; oficinaId?: string | null } | null;
    if (!e?.workspaceId) return null;
    return logoDelWorkspace(cli, e.workspaceId, e.oficinaId ?? null);
  } catch { return null; }
}
