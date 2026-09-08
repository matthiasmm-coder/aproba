import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import type { EmpresaFiscal } from "@/lib/empresa";

// Capa de acceso a las EMPRESAS (Supabase + RLS). Repli propio: si la migración
// supabase/empresa.sql no está aplicada, se devuelve vacío/null sin romper nada —
// mismo contrato que lib/data/familias.ts.

export type EmpresaResumen = { id: string; razonSocial: string; nif: string | null; trabajadores: number };
export type TrabajadorEmpresa = { id: string; nombre: string; telefono: string | null; expedientes: { id: string; referencia: string; tipoLabel: string; estado: string }[] };
export type EmpresaDetalle = EmpresaFiscal & { id: string; razonSocial: string; trabajadores: TrabajadorEmpresa[] };

const COLS = "id, razonSocial, nif, domicilio, codigoPostal, municipio, provincia, contactoNombre, contactoEmail, contactoTelefono, oficinaId";

export async function fetchEmpresas(): Promise<EmpresaResumen[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Empresa").select("id, razonSocial, nif, clientes:Cliente(id)").order("razonSocial");
    if (error) return [];
    return ((data ?? []) as unknown as { id: string; razonSocial: string; nif: string | null; clientes: { id: string }[] | null }[])
      .map((e) => ({ id: e.id, razonSocial: e.razonSocial, nif: e.nif ?? null, trabajadores: (e.clientes ?? []).length }));
  } catch { return []; }
}

export async function fetchEmpresaDetalle(empresaId: string): Promise<EmpresaDetalle | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Empresa")
      .select(`${COLS}, clientes:Cliente(id, nombre, apellidos, telefono, expedientes:Expediente(id, referencia, tipo, estado))`)
      .eq("id", empresaId).maybeSingle();
    if (error || !data) return null;
    type Row = EmpresaFiscal & { id: string; razonSocial: string; clientes: { id: string; nombre: string; apellidos: string | null; telefono: string | null; expedientes: { id: string; referencia: string; tipo: string; estado: string }[] | null }[] | null };
    const e = data as unknown as Row;
    return {
      ...e,
      trabajadores: (e.clientes ?? []).map((c) => ({
        id: c.id, nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(), telefono: c.telefono ?? null,
        expedientes: (c.expedientes ?? []).map((x) => ({ id: x.id, referencia: x.referencia, tipoLabel: TIPO_LABEL[x.tipo] ?? x.tipo, estado: x.estado })),
      })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  } catch { return null; }
}
