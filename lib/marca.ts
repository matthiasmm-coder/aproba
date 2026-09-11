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

// ── Marca del despacho para un enlace de portal (título de la pestaña, tarjeta al
// compartir por WhatsApp/email, favicon). El token ES el enlace que recibe el cliente:
// /j y /s llevan Expediente.portalToken; /c lleva Cliente.espacioToken.
export type MarcaPortal = { gestoria: string; logoUrl: string | null };

async function marcaDeWorkspace(cli: Cli, workspaceId: string, oficinaId: string | null): Promise<MarcaPortal> {
  const { data } = await cli.from("Workspace").select("nombre").eq("id", workspaceId).maybeSingle();
  const gestoria = String((data as { nombre?: string } | null)?.nombre ?? "").trim() || "Tu gestoría";
  return { gestoria, logoUrl: await logoDelWorkspace(cli, workspaceId, oficinaId) };
}

export async function marcaPorPortalToken(cli: Cli, token: string): Promise<MarcaPortal | null> {
  if (!token) return null;
  try {
    let res = await cli.from("Expediente").select("workspaceId, oficinaId").eq("portalToken", token).maybeSingle();
    if (res.error) res = await cli.from("Expediente").select("workspaceId").eq("portalToken", token).maybeSingle();
    const e = res.data as { workspaceId?: string; oficinaId?: string | null } | null;
    if (!e?.workspaceId) return null;
    return marcaDeWorkspace(cli, e.workspaceId, e.oficinaId ?? null);
  } catch { return null; }
}

export async function marcaPorEspacioToken(cli: Cli, token: string): Promise<MarcaPortal | null> {
  if (!token) return null;
  try {
    let res = await cli.from("Cliente").select("workspaceId, oficinaId").eq("espacioToken", token).maybeSingle();
    if (res.error) res = await cli.from("Cliente").select("workspaceId").eq("espacioToken", token).maybeSingle();
    const c = res.data as { workspaceId?: string; oficinaId?: string | null } | null;
    if (!c?.workspaceId) return null;
    return marcaDeWorkspace(cli, c.workspaceId, c.oficinaId ?? null);
  } catch { return null; }
}


// ── CONTACTO del despacho para el cliente (email + teléfono) ────────────────────
// Para los mensajes en los que el cliente puede tener dudas (propuesta de renovación):
// la sede del expediente si tiene datos, si no el despacho, si no el email del owner.
export type ContactoDespacho = { email: string | null; telefono: string | null };
export async function contactoDelDespacho(cli: Cli, workspaceId: string, oficinaId: string | null = null): Promise<ContactoDespacho> {
  let email: string | null = null, telefono: string | null = null;
  try {
    if (oficinaId) {
      let r = await cli.from("Oficina").select("emailFacturacion, telefono").eq("id", oficinaId).maybeSingle();
      if (r.error) r = await cli.from("Oficina").select("telefono").eq("id", oficinaId).maybeSingle();
      const o = (r.data ?? {}) as { emailFacturacion?: string | null; telefono?: string | null };
      email = (o.emailFacturacion ?? "").trim() || null;
      telefono = (o.telefono ?? "").trim() || null;
    }
    if (!email) {
      const { data } = await cli.from("Workspace").select("emailFacturacion").eq("id", workspaceId).maybeSingle();
      email = ((data as { emailFacturacion?: string | null } | null)?.emailFacturacion ?? "").trim() || null;
    }
    if (!email) {
      const { data } = await cli.from("Membership").select("user:User(email)").eq("workspaceId", workspaceId).eq("role", "OWNER").limit(1).maybeSingle();
      const u = (Array.isArray((data as { user?: unknown } | null)?.user) ? (data as { user: { email?: string }[] }).user[0] : (data as { user?: { email?: string } } | null)?.user) as { email?: string } | undefined;
      email = (u?.email ?? "").trim() || null;
    }
  } catch { /* mejor esfuerzo */ }
  return { email, telefono };
}

export async function contactoDelExpediente(cli: Cli, expedienteId: string): Promise<ContactoDespacho> {
  try {
    const { data } = await cli.from("Expediente").select("workspaceId, oficinaId").eq("id", expedienteId).maybeSingle();
    const e = data as { workspaceId?: string; oficinaId?: string | null } | null;
    if (!e?.workspaceId) return { email: null, telefono: null };
    return contactoDelDespacho(cli, e.workspaceId, e.oficinaId ?? null);
  } catch { return { email: null, telefono: null }; }
}
