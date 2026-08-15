import { createSupabaseServer } from "@/lib/supabase/server";

// MULTI-OFICINA (Business) — sedes de un mismo despacho. La oficina es una DIMENSIÓN
// del workspace: suscripción, cuota, servicios y hoja de encargo siguen compartidos.
// Lectura bajo RLS (política oficina_tenant); toda escritura pasa por /api/oficinas.

export type Oficina = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  orden: number;
  clientes: number; // nº de clientes afectados (para avisar antes de borrar)
  miembros: number;
  // fase 6 — identidad fiscal de la sede (null/"" = factura con los datos del despacho)
  razonSocial: string | null;
  nif: string | null;
  domicilio: string | null;
  emailFacturacion: string | null;
  prefijoSerie: string | null;
  logoUrl: string | null; // logo de facturación propio (null → el del despacho)
  // hoja de encargo por sede (hojaEncargoActiva null = heredar) + punteros «mismas que»
  hojaEncargoActiva: boolean | null;
  mandatarioNombre: string | null;
  mandatarioDni: string | null;
  mandatarioColegiado: string | null;
  mandatarioColegio: string | null;
  encargoFormasPago: string | null;
  avisosComoOficinaId: string | null;
  encargoComoOficinaId: string | null;
};

// Oficinas del workspace courant, avec le décompte de ce qui y est rattaché.
// Repli propre : si la migration (supabase/oficinas.sql) n'est pas passée, liste vide
// → la section Ajustes affiche l'état « aucune oficina » et rien d'autre ne change.
export async function fetchOficinas(): Promise<Oficina[]> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myMem } = await supabase
    .from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!myMem) return [];
  const ws = (myMem as { workspaceId: string }).workspaceId;

  const q = (cols: string) => supabase.from("Oficina").select(cols).eq("workspaceId", ws).order("orden", { ascending: true });
  let res = await q("id, nombre, direccion, telefono, orden, razonSocial, nif, domicilio, emailFacturacion, prefijoSerie, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, encargoFormasPago, avisosComoOficinaId, encargoComoOficinaId");
  if (res.error) res = await q("id, nombre, direccion, telefono, orden, razonSocial, nif, domicilio, emailFacturacion, prefijoSerie, logoUrl") as typeof res; // config-por-oficina sin migrar
  if (res.error) res = await q("id, nombre, direccion, telefono, orden, razonSocial, nif, domicilio, emailFacturacion, prefijoSerie") as typeof res; // sin logo aún
  if (res.error) res = await q("id, nombre, direccion, telefono, orden") as typeof res; // fase 6 sin migrar
  if (res.error || !res.data) return [];

  type Fila = { id: string; nombre: string; direccion: string | null; telefono: string | null; orden: number; razonSocial?: string | null; nif?: string | null; domicilio?: string | null; emailFacturacion?: string | null; prefijoSerie?: string | null; logoUrl?: string | null; hojaEncargoActiva?: boolean | null; mandatarioNombre?: string | null; mandatarioDni?: string | null; mandatarioColegiado?: string | null; mandatarioColegio?: string | null; encargoFormasPago?: string | null; avisosComoOficinaId?: string | null; encargoComoOficinaId?: string | null };
  const filas = res.data as unknown as Fila[];
  if (!filas.length) return [];

  // Décomptes en une passe (les listes sont courtes : 2-4 oficinas par despacho).
  const [{ data: cls }, { data: mms }] = await Promise.all([
    supabase.from("Cliente").select("oficinaId").eq("workspaceId", ws).not("oficinaId", "is", null),
    supabase.from("Membership").select("oficinaId, oficinaIds").eq("workspaceId", ws)
      .then((r) => (r.error ? supabase.from("Membership").select("oficinaId").eq("workspaceId", ws) : r)),
  ]);
  const cuenta = (rows: { oficinaId: string | null }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.oficinaId === id).length;
  // membres : l'array (multi-sedes) prime ; repli sur la primaire pour les filas viejas
  const cuentaMiembros = (rows: { oficinaId?: string | null; oficinaIds?: string[] | null }[] | null, id: string) =>
    (rows ?? []).filter((r) => (r.oficinaIds?.length ? r.oficinaIds.includes(id) : r.oficinaId === id)).length;

  return filas.map((o) => ({
    ...o,
    razonSocial: o.razonSocial ?? null,
    nif: o.nif ?? null,
    domicilio: o.domicilio ?? null,
    emailFacturacion: o.emailFacturacion ?? null,
    prefijoSerie: o.prefijoSerie ?? null,
    logoUrl: o.logoUrl ?? null,
    hojaEncargoActiva: o.hojaEncargoActiva ?? null,
    mandatarioNombre: o.mandatarioNombre ?? null,
    mandatarioDni: o.mandatarioDni ?? null,
    mandatarioColegiado: o.mandatarioColegiado ?? null,
    mandatarioColegio: o.mandatarioColegio ?? null,
    encargoFormasPago: o.encargoFormasPago ?? null,
    avisosComoOficinaId: o.avisosComoOficinaId ?? null,
    encargoComoOficinaId: o.encargoComoOficinaId ?? null,
    clientes: cuenta(cls as { oficinaId: string | null }[] | null, o.id),
    miembros: cuentaMiembros(mms as { oficinaId?: string | null; oficinaIds?: string[] | null }[] | null, o.id),
  }));
}
