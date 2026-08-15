import type { SupabaseClient } from "@supabase/supabase-js";

// FACTURACIÓN POR OFICINA (fase 6 del multi-oficina).
//
// Regla ÚNICA de resolución, usada por la factura, la hoja de encargo, los emails
// y el portal: si la oficina del expediente tiene identidad fiscal propia
// (razonSocial o nif), TODO el bloque emisor sale de la oficina; si no, del
// despacho. Nunca se mezclan campos de las dos («razón social de Diagonal con
// domicilio de Gran Via» sería un documento fiscal falso).
//
// La cuenta bancaria y la clave Stripe siguen la misma cascada: la de la oficina
// si existe, la común del despacho si no. Un despacho mono-oficina cae siempre
// en el segundo peldaño y no nota nada.
//
// Todo es tolerante a la migración ausente (supabase/oficinas-facturacion.sql):
// cualquier error de columna degrada al comportamiento actual.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cli = SupabaseClient<any, any, any>;

export type EmisorResuelto = {
  nombre: string; nif: string | null; domicilio: string | null; email: string | null;
  logo: string | null;          // el logo es SIEMPRE el del despacho (branding por sede: fuera de alcance)
  prefijoSerie: string;         // "" = serie común
  deOficina: boolean;           // true si el bloque salió de la oficina
};

export type FiscalOficina = { razonSocial?: string | null; nif?: string | null; domicilio?: string | null; emailFacturacion?: string | null; prefijoSerie?: string | null };

// ¿Tiene la oficina identidad fiscal PROPIA? (razón social o NIF → bloque completo suyo)
export const oficinaConIdentidad = (f: FiscalOficina | null): boolean =>
  Boolean(f && ((f.razonSocial ?? "").trim() || (f.nif ?? "").trim()));

// Mezcla PURA: el bloque emisor de la oficina sobre una base ya cargada del despacho.
// Para las superficies que ya tienen los datos del despacho en mano (vista factura,
// exports) y solo necesitan sustituir la identidad si la sede tiene la suya.
export function emisorDesdeFiscal<B extends { nombre: string; nif: string | null; domicilio: string | null; email: string | null }>(base: B, fiscal: FiscalOficina | null): B & { deOficina: boolean } {
  if (!oficinaConIdentidad(fiscal)) return { ...base, deOficina: false };
  const f = fiscal as FiscalOficina;
  return {
    ...base,
    nombre: (f.razonSocial ?? "").trim() || base.nombre,
    nif: (f.nif ?? "").trim() || null,
    domicilio: (f.domicilio ?? "").trim() || null,
    email: (f.emailFacturacion ?? "").trim() || null,
    deOficina: true,
  };
}

export async function fiscalDeOficina(cli: Cli, oficinaId: string): Promise<FiscalOficina | null> {
  try {
    const { data, error } = await cli.from("Oficina")
      .select("razonSocial, nif, domicilio, emailFacturacion, prefijoSerie")
      .eq("id", oficinaId).maybeSingle();
    if (error || !data) return null;
    return data as FiscalOficina;
  } catch { return null; }
}

async function emisorDelDespacho(cli: Cli, workspaceId: string) {
  const q = (cols: string) => cli.from("Workspace").select(cols).eq("id", workspaceId).maybeSingle();
  let res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl");
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion");
  if (res.error) res = await q("nombre, nif");
  const w = (res.data ?? {}) as { nombre?: string; nif?: string | null; domicilio?: string | null; emailFacturacion?: string | null; logoUrl?: string | null };
  return { nombre: w.nombre ?? "", nif: w.nif ?? null, domicilio: w.domicilio ?? null, email: w.emailFacturacion ?? null, logo: w.logoUrl ?? null };
}

// Emisor para una oficina dada (null → despacho a secas).
export async function emisorParaOficina(cli: Cli, workspaceId: string, oficinaId: string | null): Promise<EmisorResuelto> {
  const base = await emisorDelDespacho(cli, workspaceId);
  const fiscal = oficinaId ? await fiscalDeOficina(cli, oficinaId) : null;
  const m = emisorDesdeFiscal({ nombre: base.nombre, nif: base.nif, domicilio: base.domicilio, email: base.email }, fiscal);
  return { ...m, logo: base.logo, prefijoSerie: (fiscal?.prefijoSerie ?? "").trim() };
}

// Oficina efectiva de una factura: la estampada, y si no la de su expediente
// (cubre las facturas anteriores a la migración y cualquier vía no estampada).
export async function oficinaDeFacturaFila(cli: Cli, f: { oficinaId?: string | null; expedienteId?: string | null }): Promise<string | null> {
  if (f.oficinaId) return f.oficinaId;
  if (!f.expedienteId) return null;
  try {
    const { data } = await cli.from("Expediente").select("oficinaId").eq("id", f.expedienteId).maybeSingle();
    return ((data as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
  } catch { return null; }
}

// Cuenta bancaria efectiva: la ACTIVA de la oficina; si la sede no tiene, la común.
// «Común» incluye las filas anteriores a la migración (sin columna → sin filtro).
export type CuentaResuelta = { titular: string; iban: string; banco: string | null };
export async function cuentaParaOficina(cli: Cli, workspaceId: string, oficinaId: string | null): Promise<CuentaResuelta | null> {
  const buscar = async (sede: string | null): Promise<CuentaResuelta | null> => {
    try {
      let q = cli.from("CuentaBancaria").select("titular, iban, banco, oficinaId")
        .eq("workspaceId", workspaceId).eq("activa", true);
      q = sede ? q.eq("oficinaId", sede) : q.is("oficinaId", null);
      const { data, error } = await q.limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as CuentaResuelta | undefined) ?? null;
    } catch {
      // columna sin migrar → única consulta posible: la activa del despacho
      if (sede) return null;
      const { data } = await cli.from("CuentaBancaria").select("titular, iban, banco")
        .eq("workspaceId", workspaceId).eq("activa", true).limit(1);
      return ((data ?? [])[0] as CuentaResuelta | undefined) ?? null;
    }
  };
  return (oficinaId ? await buscar(oficinaId) : null) ?? await buscar(null);
}

// Prefijo de serie del expediente (por su oficina). "" si no hay.
export async function prefijoDeExpediente(cli: Cli, expedienteId: string): Promise<string> {
  try {
    const { data } = await cli.from("Expediente").select("oficinaId").eq("id", expedienteId).maybeSingle();
    const ofi = ((data as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
    if (!ofi) return "";
    const fiscal = await fiscalDeOficina(cli, ofi);
    return (fiscal?.prefijoSerie ?? "").trim();
  } catch { return ""; }
}
