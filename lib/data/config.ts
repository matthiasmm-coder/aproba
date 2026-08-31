import { createSupabaseServer } from "@/lib/supabase/server";
import { DEFAULT_SERVICIOS, type Pack, type Servicio } from "@/lib/servicios";
import { combinarAvisos, DEFAULT_AVISOS, esCanalAvisos, type Aviso, type CanalAvisos } from "@/lib/avisos";
import type { SupabaseClient } from "@supabase/supabase-js";

// Config du workspace (servicios + avisos) — Supabase, sous RLS.
// `clave` (DB) ↔ `id` (UI) : identifiant stable d'un service/aviso.

type ServicioRow = {
  oficinaId?: string | null;
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
    oficinaId: (r as { oficinaId?: string | null }).oficinaId ?? null,
    docs: r.docs ?? [],
    active: r.active,
    anticipo,
    resto,
    precio: anticipo + resto,
    citaPresencial: Boolean(r.citaPresencial),
    citaQuien: r.citaQuien === "gestor" ? "gestor" : "cliente",
    noIncluye: (r as { noIncluye?: string | null }).noIncluye ?? undefined,
    suplidos: (() => {
      const raw = (r as { suplidos?: unknown }).suplidos;
      if (!Array.isArray(raw)) return undefined;
      const list = raw
        .filter((x): x is { concepto?: unknown; importe?: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ concepto: String(x.concepto ?? "").trim(), importe: Number(x.importe) || 0 }))
        .filter((x) => x.concepto && x.importe > 0);
      return list.length ? list : undefined;
    })(),
    porcentaje: (() => {
      const v = Number((r as { porcentaje?: unknown }).porcentaje);
      return Number.isFinite(v) && v > 0 ? v : undefined;
    })(),
    porcentajeSobre: String((r as { porcentajeSobre?: unknown }).porcentajeSobre ?? "").trim() || undefined,
    precioOculto: Boolean((r as { precioOculto?: unknown }).precioOculto) || undefined,
    categoria: String((r as { categoria?: unknown }).categoria ?? "").trim() || undefined,
  };
}

// Workspace.packs (JSONB) → Pack[] validado. Defensivo: cualquier forma inesperada → [].
export function parsePacks(raw: unknown): Pack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      id: String(x.id ?? "").trim(),
      nombre: String(x.nombre ?? "").trim(),
      desc: String(x.desc ?? "").trim(),
      servicioIds: Array.isArray(x.servicioIds) ? x.servicioIds.map((s) => String(s)).filter(Boolean) : [],
      precioDesde: Math.max(0, Number(x.precioDesde) || 0),
      descuentoPct: Math.min(100, Math.max(0, Number(x.descuentoPct) || 0)) || undefined,
      porcentaje: Math.min(100, Math.max(0, Number(x.porcentaje) || 0)) || undefined,
      porcentajeSobre: String(x.porcentajeSobre ?? "").trim() || undefined,
      precioOculto: Boolean(x.precioOculto) || undefined,
      categoria: String(x.categoria ?? "").trim() || undefined,
    }))
    .filter((p) => p.id && p.nombre);
}

const SELECT_SERVICIOS = "oficinaId, clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien, noIncluye, suplidos, porcentaje, porcentajeSobre, precioOculto, categoria";
// Replis por tramo de migración (categoría → pro → suplidos → noIncluye → base).
const SELECT_SERVICIOS_SIN_CATEGORIA = "oficinaId, clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien, noIncluye, suplidos, porcentaje, porcentajeSobre, precioOculto";
const SELECT_SERVICIOS_SIN_PRO = "oficinaId, clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien, noIncluye, suplidos";
const SELECT_SERVICIOS_SIN_SUPLIDOS = "oficinaId, clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien, noIncluye";
const SELECT_SERVICIOS_SIN_NOINCLUYE = "oficinaId, clave, label, descripcion, docs, active, anticipo, resto, orden, citaPresencial, citaQuien";

// Servicios du workspace de l'utilisateur connecté. Fallback : defaults (workspace pas encore configuré).
export async function fetchServiciosConfig(): Promise<{ servicios: Servicio[]; desdeDb: boolean; fallo?: boolean }> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("ServicioConfig").select(SELECT_SERVICIOS).order("orden");
  if (res.error) res = (await supabase.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_CATEGORIA).order("orden")) as unknown as typeof res;
  if (res.error) res = (await supabase.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_PRO).order("orden")) as unknown as typeof res;
  if (res.error) res = (await supabase.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_SUPLIDOS).order("orden")) as unknown as typeof res;
  if (res.error) res = (await supabase.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_NOINCLUYE).order("orden")) as unknown as typeof res;
  const { data, error } = res;
  if (error) {
    if (esFalloPasajero(error.message)) {
      console.error("[fetchServiciosConfig] fallo pasajero:", error.message);
      return { servicios: DEFAULT_SERVICIOS, desdeDb: false, fallo: true };
    }
    throw new Error(`ServicioConfig: ${error.message}`);
  }
  if (!data || data.length === 0) return { servicios: DEFAULT_SERVICIOS, desdeDb: false };
  return { servicios: (data as ServicioRow[]).map(mapServicioRow), desdeDb: true };
}

// Variante avec un client fourni (admin/service_role) et un workspace explicite —
// pour le portail client (lien token) et l'API de pagos.
//
// MULTI-OFICINA : `oficinaId` = la sede de l'entité concernée (expediente/cliente).
// Si cette sede a un catalogue PROPRE (≥1 fila avec son id), c'est lui ; sinon le
// catalogue de la gestoría (filas oficinaId null — les historiques). Cascade de
// catalogue ENTIER, jamais de fusion service à service : mélanger deux tarifs
// serait indémêlable. La fila automática (gestoría) n'a jamais de filas scopées,
// donc passer son id retombe naturellement sur le catalogue commun.
export async function fetchServiciosDeWorkspace(client: SupabaseClient, workspaceId: string, oficinaId: string | null = null): Promise<Servicio[]> {
  const listar = async (sede: string | null) => {
    const q = (cols: string) => {
      let b = client.from("ServicioConfig").select(cols).eq("workspaceId", workspaceId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (sede !== undefined) b = (sede ? b.eq("oficinaId", sede) : (b as any).is("oficinaId", null));
      return b.order("orden");
    };
    let res = await q(SELECT_SERVICIOS);
    if (res.error) res = (await q(SELECT_SERVICIOS_SIN_CATEGORIA)) as unknown as typeof res;
    if (res.error) res = (await q(SELECT_SERVICIOS_SIN_PRO)) as unknown as typeof res;
    if (res.error) res = (await q(SELECT_SERVICIOS_SIN_SUPLIDOS)) as unknown as typeof res;
    if (res.error) res = (await q(SELECT_SERVICIOS_SIN_NOINCLUYE)) as unknown as typeof res;
    return res;
  };
  let res = oficinaId ? await listar(oficinaId) : { data: null, error: { message: "skip" } };
  if ((res.error || !res.data || (res.data as unknown[]).length === 0)) res = await listar(null);
  if (res.error && /oficinaId|column|schema cache|does not exist/i.test(res.error.message)) {
    // migración config-por-oficina ausente → catálogo plano de siempre
    let plano = await client.from("ServicioConfig").select(SELECT_SERVICIOS).eq("workspaceId", workspaceId).order("orden");
    if (plano.error) plano = (await client.from("ServicioConfig").select(SELECT_SERVICIOS_SIN_NOINCLUYE).eq("workspaceId", workspaceId).order("orden")) as unknown as typeof plano;
    res = plano as unknown as typeof res;
  }
  const { data, error } = res;
  if (error) throw new Error(`ServicioConfig(ws): ${error.message}`);
  if (!data || (data as unknown[]).length === 0) return DEFAULT_SERVICIOS;
  return (data as unknown as ServicioRow[]).map(mapServicioRow);
}

// Listado ESTRICTO de un ámbito para Ajustes (sin cascada): la página necesita
// distinguir «esta sede tiene catálogo propio» de «está heredando el de la gestoría».
export async function fetchServiciosDeScope(oficinaId: string | null): Promise<{ servicios: Servicio[]; propios: boolean }> {
  const supabase = await createSupabaseServer();
  const q = (cols: string) => {
    let b = supabase.from("ServicioConfig").select(cols);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b = oficinaId ? b.eq("oficinaId", oficinaId) : ((b as any).is("oficinaId", null));
    return b.order("orden");
  };
  let res = await q(SELECT_SERVICIOS);
  if (res.error) res = (await q(SELECT_SERVICIOS_SIN_CATEGORIA)) as unknown as typeof res;
  if (res.error) res = (await q(SELECT_SERVICIOS_SIN_NOINCLUYE)) as unknown as typeof res;
  if (res.error) {
    // migración ausente → tout est « gestoría »
    if (oficinaId) return { servicios: [], propios: false };
    const plano = await fetchServiciosConfig();
    return { servicios: plano.servicios, propios: true };
  }
  const filas = (res.data ?? []) as unknown as ServicioRow[];
  if (oficinaId && filas.length === 0) return { servicios: [], propios: false };
  if (filas.length === 0) return { servicios: DEFAULT_SERVICIOS, propios: true };
  return { servicios: filas.map(mapServicioRow), propios: true };
}

// Avisos de un ámbito (misma lógica estricta, para las pestañas de Ajustes).
export async function fetchAvisosDeScope(oficinaId: string | null): Promise<{ avisos: Aviso[]; propios: boolean }> {
  const supabase = await createSupabaseServer();
  const q = (cols: string) => {
    let b = supabase.from("AvisoConfig").select(cols);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b = oficinaId ? b.eq("oficinaId", oficinaId) : ((b as any).is("oficinaId", null));
    return b.order("orden");
  };
  // eventoBase/oculto: migración avisos-personalizados.sql; repli al select antiguo.
  let res = await q("clave, evento, template, canal, activo, orden, eventoBase, oculto");
  if (res.error) res = (await q("clave, evento, template, canal, activo, orden")) as unknown as typeof res;
  const { data, error } = res;
  if (error) {
    if (oficinaId) return { avisos: [], propios: false };
    const base = await fetchAvisosConfig();
    return { avisos: base.avisos, propios: true };
  }
  const filas = (data ?? []) as unknown as AvisoRow[];
  if (oficinaId && filas.length === 0) return { avisos: [], propios: false };
  if (filas.length === 0) return { avisos: DEFAULT_AVISOS, propios: true };
  return { avisos: combinarAvisos(filas), propios: true };
}

// Packs del workspace (Workspace.packs JSONB) — [] pre-migración o sin packs.
export async function fetchPacksDeWorkspace(client: SupabaseClient, workspaceId: string): Promise<Pack[]> {
  const { data, error } = await client.from("Workspace").select("packs").eq("id", workspaceId).maybeSingle();
  if (error || !data) return [];
  return parsePacks((data as { packs?: unknown }).packs);
}

// Packs del workspace del usuario conectado (RLS).
export async function fetchPacksConfig(): Promise<Pack[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("Membership").select("Workspace(packs)").limit(1).maybeSingle();
  if (error || !data) return [];
  const wsRaw = (data as { Workspace?: { packs?: unknown } | { packs?: unknown }[] }).Workspace;
  const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
  return parsePacks(ws?.packs);
}

export type CuentaBancaria = {
  oficinaId?: string | null; // fase 6 — null/ausente = cuenta común del despacho
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
  // Canal de los avisos al cliente (supabase/whatsapp-canal.sql) — EMAIL pre-migración.
  canalAvisos: CanalAvisos;
  // Opciones portal/encargo (supabase/portal-encargo-opciones.sql) — replis pre-migración.
  // (El antiguo global portalOcultarPrecios se retiró: ahora es ServicioConfig.precioOculto.)
  encargoFormasPago: string | null;
  mandatoPropioPath: string | null;
};

export async function fetchDespacho(): Promise<Despacho> {
  const supabase = await createSupabaseServer();
  const q = (cols: string) => supabase.from("Membership").select(`Workspace(${cols})`).limit(1).maybeSingle();
  // Columnas por tramo de migración: cada repli quita SOLO el tramo más reciente.
  let res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, canalAvisos, encargoFormasPago, mandatoPropioPath");
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, canalAvisos");
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio");
  // Migraciones aplicadas en desorden: canalAvisos puede existir SIN las columnas encargo.
  if (res.error) res = await q("nombre, nif, domicilio, emailFacturacion, logoUrl, canalAvisos");
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
    canalAvisos: esCanalAvisos(ws.canalAvisos) ? ws.canalAvisos : "EMAIL",
    encargoFormasPago: (ws.encargoFormasPago as string | null) ?? null,
    mandatoPropioPath: (ws.mandatoPropioPath as string | null) ?? null,
  };
}

// Comptes bancaires du workspace (réception des paiements clients).
export async function fetchCuentasBancarias(): Promise<CuentaBancaria[]> {
  const supabase = await createSupabaseServer();
  let res = await supabase.from("CuentaBancaria").select("id, titular, iban, banco, activa, oficinaId").order("createdAt");
  if (res.error) res = await supabase.from("CuentaBancaria").select("id, titular, iban, banco, activa").order("createdAt") as typeof res; // fase 6 sin migrar
  if (res.error) {
    if (esFalloPasajero(res.error.message)) {
      console.error("[fetchCuentasBancarias] fallo pasajero:", res.error.message);
      return [];
    }
    throw new Error(`CuentaBancaria: ${res.error.message}`);
  }
  return (res.data ?? []) as CuentaBancaria[];
}

// ── Panne passagère vs bug de schéma ───────────────────────────────────────────
// Sentry, 27/08/2026 : « AvisoConfig: JWT issued at future » a fait planter TOUTE la
// page /app/ajustes en production. C'est un décalage d'horloge entre l'émission du
// token et sa vérification — rien à corriger dans le code, ça se résout tout seul.
//
// Mais une colonne manquante (migration pas passée) doit, elle, rester visible : la
// masquer transformerait un bug corrigeable en «configuración vacía» silencieuse.
// D'où la distinction : ce qui est passager dégrade proprement, le reste remonte.
export function esFalloPasajero(msg: string): boolean {
  return /jwt|token|expired|issued at|signature|network|fetch failed|timeout|ETIMEDOUT|ECONNRESET|socket|502|503|504/i.test(msg);
}

type AvisoRow = {
  clave: string;
  evento: string;
  template: string;
  canal: string;
  activo: boolean;
  orden: number;
  eventoBase?: string | null; // avisos personalizados (migración avisos-personalizados.sql)
  oculto?: boolean | null;    // predeterminado «eliminado» por el gestor
};

export async function fetchAvisosConfig(): Promise<{ avisos: Aviso[]; desdeDb: boolean; fallo?: boolean }> {
  const supabase = await createSupabaseServer();
  // eventoBase/oculto: migración avisos-personalizados.sql. Si aún no está, se
  // reintenta con el select antiguo — los predeterminados siguen funcionando.
  let res = await supabase
    .from("AvisoConfig")
    .select("clave, evento, template, canal, activo, orden, eventoBase, oculto")
    .order("orden");
  if (res.error) res = (await supabase
    .from("AvisoConfig")
    .select("clave, evento, template, canal, activo, orden")
    .order("orden")) as unknown as typeof res;
  const { data, error } = res;
  if (error) {
    // Passager → on rend les defaults AVEC `fallo:true` : la page prévient et
    // bloque l'enregistrement, sinon un «Guardar» écraserait les textes du gestor
    // par les nôtres sans qu'il l'ait voulu.
    if (esFalloPasajero(error.message)) {
      console.error("[fetchAvisosConfig] fallo pasajero:", error.message);
      return { avisos: DEFAULT_AVISOS, desdeDb: false, fallo: true };
    }
    throw new Error(`AvisoConfig: ${error.message}`);
  }
  const filas = ((data as AvisoRow[]) ?? []);
  // combinarAvisos parte SIEMPRE de la lista canónica (claves obsoletas fuera, avisos
  // nuevos presentes) + añade los personalizados (custom_) al final. Canal = email.
  return { avisos: combinarAvisos(filas), desdeDb: filas.length > 0 };
}
