import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import { ESTADO_META } from "@/lib/types";
import { ordenParentesco } from "@/lib/familia";

// Couche d'accès aux familles (Supabase + RLS). Repli propre: si la table Familia n'existe
// pas encore (migration supabase/familia.sql non appliquée), on renvoie vide sans casser.

export type FamiliaResumen = { id: string; nombre: string; miembros: number };
export type MiembroExpediente = { id: string; referencia: string; tipoLabel: string; estado: string; estadoLabel: string; portalToken: string | null };
export type FamiliaMiembro = { id: string; nombre: string; parentesco: string | null; telefono: string | null; expedientes: MiembroExpediente[] };
export type FamiliaDetalle = { id: string; nombre: string; miembros: FamiliaMiembro[] };

type ExpRow = { id: string; referencia: string; tipo: string; estado: string; portalToken: string | null };
type CliRow = { id: string; nombre: string; apellidos: string | null; parentesco: string | null; telefono: string | null; expedientes: ExpRow[] | null };
type FamRow = { id: string; nombre: string; clientes: CliRow[] | null };

export async function fetchFamilias(): Promise<FamiliaResumen[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Familia").select("id, nombre, clientes:Cliente(id)").order("nombre");
    if (error) return [];
    return ((data ?? []) as unknown as { id: string; nombre: string; clientes: { id: string }[] | null }[])
      .map((f) => ({ id: f.id, nombre: f.nombre, miembros: (f.clientes ?? []).length }));
  } catch { return []; }
}

// Familia del cliente de un expediente (para el badge en la ficha). Defensivo: si la
// migración de familias no está aplicada, devuelve null sin romper la ficha del expediente.
export async function fetchFamiliaDeExpediente(expedienteId: string): Promise<{ id: string; nombre: string } | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Expediente").select("cliente:Cliente(familia:Familia(id, nombre))").eq("id", expedienteId).maybeSingle();
    if (error || !data) return null;
    const cliRaw = (data as { cliente?: { familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null } | { familia?: unknown }[] | null }).cliente;
    const cli = Array.isArray(cliRaw) ? cliRaw[0] : cliRaw;
    const famRaw = (cli as { familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null } | undefined)?.familia;
    const fam = Array.isArray(famRaw) ? famRaw[0] : famRaw;
    return fam ? { id: fam.id, nombre: fam.nombre } : null;
  } catch { return null; }
}

export async function fetchFamiliaDetalle(id: string): Promise<FamiliaDetalle | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("Familia")
      .select("id, nombre, clientes:Cliente(id, nombre, apellidos, parentesco, telefono, expedientes:Expediente(id, referencia, tipo, estado, portalToken))")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const f = data as unknown as FamRow;
    const miembros: FamiliaMiembro[] = (f.clientes ?? []).map((c) => ({
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(),
      parentesco: c.parentesco ?? null,
      telefono: c.telefono ?? null,
      expedientes: (c.expedientes ?? []).map((e) => ({
        id: e.id,
        referencia: e.referencia,
        tipoLabel: TIPO_LABEL[e.tipo] ?? e.tipo,
        estado: e.estado,
        estadoLabel: (ESTADO_META as Record<string, { label: string }>)[e.estado]?.label ?? e.estado,
        portalToken: e.portalToken ?? null,
      })),
    }));
    miembros.sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    return { id: f.id, nombre: f.nombre, miembros };
  } catch { return null; }
}
