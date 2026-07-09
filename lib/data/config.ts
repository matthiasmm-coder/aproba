import { createSupabaseServer } from "@/lib/supabase/server";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";
import { DEFAULT_AVISOS, type Aviso } from "@/lib/avisos";
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
  citaPresencial?: boolean | null;
  citaQuien?: string | null;
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
    citaPresencial: Boolean(r.citaPresencial),
    citaQuien: r.citaQuien === "gestor" ? "gestor" : "cliente",
    noIncluye: (r as { noIncluye?: string | null }).noIncluye ?? undefined,
  };
}

const SELECT_SERVICIOS = "clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien, noIncluye";
// Repli si la columna noIncluye no está migrada aún (supabase/hoja-encargo.sql).
const SELECT_SERVICIOS_SIN_NOINCLUYE = "clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien";

// Servicios du workspace de l'utilisateur connecté. Fallback : defaults (workspace pas encore configuré).
export async function fetchServiciosConfig(): Promise<{ servicios: Servicio[]; desdeDb: boolean }> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("ServicioConfig").select(SELECT_SERVICIOS).order("orden");
  if (res.error) res = (await supabase.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_NOINCLUYE).order("orden")) as unknown as typeof res;
  const { data, error } = res;
  if (error) throw new Error(`ServicioConfig: ${error.message}`);
  if (!data || data.length === 0) return { servicios: DEFAULT_SERVICIOS, desdeDb: false };
  return { servicios: (data as ServicioRow[]).map(mapServicioRow), desdeDb: true };
}

// Variante avec un client fourni (admin/service_role) et un workspace explicite —
// pour le portail client (lien token) et l'API de pagos.
export async function fetchServiciosDeWorkspace(client: SupabaseClient, workspaceId: string): Promise<Servicio[]> {
  let res = await client.from("ServicioConfig").select(SELECT_SERVICIOS).eq("workspaceId", workspaceId).order("orden");
  if (res.error) res = (await client.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_NOINCLUYE).eq("workspaceId", workspaceId).order("orden")) as unknown as typeof res;
  const { data, error } = res;
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

// Datos de facturación du despacho (émetteur des factures). Défensif : retombe sur
// nombre+nif si les colonnes domicilio/emailFacturacion ne sont pas encore migrées.
export type Despacho = {
  nombre: string; nif: string | null; domicilio: string | null; emailFacturacion: string | null; logoUrl: string | null;
  // Hoja de encargo + mandato (supabase/hoja-encargo.sql) — false/null pre-migración.
  hojaEncargoActiva: boolean;
  mandatarioNombre: string | null; mandatarioDni: string | null;
  mandatarioColegiado: string | null; mandatarioColegio: string | null;
};

export async function fetchDespacho(): Promise<Despacho> {
  const supabase = await createSupabaseServer();
  const q = (cols: string) => supabase.from("Membership").select(`Workspace(${cols})`).limit(1).maybeSingle();
  // logoUrl es columna nueva (feature 4b): si la migración no se aplicó aún, repli.
  let res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio");
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl");
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion");
  if (res.error) res = await q("nombre, nif");
  const wsRaw = (res.data as { Workspace?: Record<string, unknown> | Record<string, unknown>[] } | null)?.Workspace;
  const ws = (Array.isArray(wsRaw) ? wsRaw[0] : wsRaw) ?? {};
  return {
    nombre: (ws.nombre as string) ?? "Mi despacho",
    nif: (ws.nif as string | null) ?? null,
    domicilio: (ws.domicilio as string | null) ?? null,
    emailFacturacion: (ws.emailFacturacion as string | null) ?? null,
    logoUrl: (ws.logoUrl as string | null) ?? null,
    hojaEncargoActiva: Boolean(ws.hojaEncargoActiva),
    mandatarioNombre: (ws.mandatarioNombre as string | null) ?? null,
    mandatarioDni: (ws.mandatarioDni as string | null) ?? null,
    mandatarioColegiado: (ws.mandatarioColegiado as string | null) ?? null,
    mandatarioColegio: (ws.mandatarioColegio as string | null) ?? null,
  };
}

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
  const byClave = new Map(((data as AvisoRow[]) ?? []).map((r) => [r.clave, r]));
  // On part TOUJOURS de la liste canonique (DEFAULT_AVISOS) : les claves obsolètes en
  // base (ex. cita_asignada/resolucion héritées) ne s'affichent plus, et les avisos
  // récents (ex. form_generado) apparaissent même absents de la base. On conserve les
  // personnalisations du gestor (texte + activo) là où une ligne existe. Canal = email.
  const avisos: Aviso[] = DEFAULT_AVISOS.map((def) => {
    const row = byClave.get(def.id);
    return row
      ? { id: def.id, evento: def.evento, template: row.template || def.template, canal: "email", activo: row.activo }
      : def;
  });
  return { avisos, desdeDb: byClave.size > 0 };
}
