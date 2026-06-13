import { createSupabaseServer } from "@/lib/supabase/server";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";
import { DEFAULT_AVISOS, type Aviso, type Canal } from "@/lib/avisos";
import type { SupabaseClient } from "@supabase/supabase-js";

// Config du workspace (servicios + avisos) — Supabase, sous RLS.
// `clave` (DB) ↔ `id` (UI) : identifiant stable d'un service/aviso.

type ServicioRow = {
  clave: string;
  label: string;
  descripcion: string | null;
  docs: string[] | null;
  active: boolean;
  anticipo: number | string;
  resto: number | string;
  orden: number;
};

export function mapServicioRow(r: ServicioRow): Servicio {
  const anticipo = Number(r.anticipo) || 0;
  const resto = Number(r.resto) || 0;
  return {
    id: r.clave,
    label: r.label,
    desc: r.descripcion ?? "",
    docs: r.docs ?? [],
    active: r.active,
    anticipo,
    resto,
    precio: anticipo + resto,
  };
}

const SELECT_SERVICIOS = "clave, label, descripcion, docs, active, anticipo, resto, orden";

// Servicios du workspace de l'utilisateur connecté. Fallback : defaults (workspace pas encore configuré).
export async function fetchServiciosConfig(): Promise<{ servicios: Servicio[]; desdeDb: boolean }> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("ServicioConfig").select(SELECT_SERVICIOS).order("orden");
  if (error) throw new Error(`ServicioConfig: ${error.message}`);
  if (!data || data.length === 0) return { servicios: DEFAULT_SERVICIOS, desdeDb: false };
  return { servicios: (data as ServicioRow[]).map(mapServicioRow), desdeDb: true };
}

// Variante avec un client fourni (admin/service_role) et un workspace explicite —
// pour le portail client (lien token) et l'API de pagos.
export async function fetchServiciosDeWorkspace(client: SupabaseClient, workspaceId: string): Promise<Servicio[]> {
  const { data, error } = await client
    .from("ServicioConfig")
    .select(SELECT_SERVICIOS)
    .eq("workspaceId", workspaceId)
    .order("orden");
  if (error) throw new Error(`ServicioConfig(ws): ${error.message}`);
  if (!data || data.length === 0) return DEFAULT_SERVICIOS;
  return (data as ServicioRow[]).map(mapServicioRow);
}

export type CuentaBancaria = {
  id: string;
  titular: string;
  iban: string;
  banco: string | null;
  activa: boolean;
};

// Comptes bancaires du workspace (réception des paiements clients).
export async function fetchCuentasBancarias(): Promise<CuentaBancaria[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("CuentaBancaria")
    .select("id, titular, iban, banco, activa")
    .order("createdAt");
  if (error) throw new Error(`CuentaBancaria: ${error.message}`);
  return (data ?? []) as CuentaBancaria[];
}

type AvisoRow = {
  clave: string;
  evento: string;
  template: string;
  canal: string;
  activo: boolean;
  orden: number;
};

export async function fetchAvisosConfig(): Promise<{ avisos: Aviso[]; desdeDb: boolean }> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("AvisoConfig")
    .select("clave, evento, template, canal, activo, orden")
    .order("orden");
  if (error) throw new Error(`AvisoConfig: ${error.message}`);
  if (!data || data.length === 0) return { avisos: DEFAULT_AVISOS, desdeDb: false };
  return {
    avisos: (data as AvisoRow[]).map((r) => ({
      id: r.clave,
      evento: r.evento,
      template: r.template,
      canal: (r.canal === "email" ? "email" : "whatsapp") as Canal,
      activo: r.activo,
    })),
    desdeDb: true,
  };
}
