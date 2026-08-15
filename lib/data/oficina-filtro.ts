import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { COOKIE_OFICINA } from "@/lib/oficinas";

// MULTI-OFICINA — quelle sede regarde-t-on ? Résolu CÔTÉ SERVEUR, une fois par page,
// pour que chaque écran filtre sa requête au lieu de tout charger puis masquer.
//
// Priorité :  cookie explicite  >  sede du membre  >  toutes.
// Le cookie n'est JAMAIS cru sur parole : un id qui n'appartient pas au despacho de
// l'appelant est ignoré (sinon, poser un cookie donnerait à voir une autre sede).
//
// `null` = « Todas ». Un despacho de una sola sede tombe toujours ici → aucune requête
// n'est filtrée et rien ne change pour lui.

export type FiltroOficina = {
  activa: string | null;                       // pastille regardée (null = todas / toutes MES sedes)
  oficinas: { id: string; nombre: string }[];  // pastilles proposées (admin: toutes; ancré: SES sedes)
  miOficina: string | null;                    // compat: première sede du membre (null = libre)
  autoId: string | null;                       // la fila de la gestoría (orden -1)
  // Le filtre effectif des écrans. null = tout ; sinon la ou les sedes visées.
  sedes: string[] | null;
  // La pastille de la gestoría montre AUSSI les données SANS sede : sous le modèle
  // « la gestoría est une oficina », l'historique non estampillé est à elle.
  incluirSinSede: boolean;
};

export async function resolverOficina(): Promise<FiltroOficina> {
  const vacio: FiltroOficina = { activa: null, oficinas: [], miOficina: null, autoId: null, sedes: null, incluirSinSede: false };
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return vacio;

  // Sedes du despacho (RLS) — si la migration n'est pas passée, `error` → mono-oficina.
  const { data: ofis, error } = await supabase.from("Oficina").select("id, nombre, orden").order("orden");
  const filas = (error ? [] : (ofis ?? [])) as { id: string; nombre: string; orden: number }[];
  const oficinas = filas.map(({ id, nombre }) => ({ id, nombre }));
  const autoId = filas.find((o) => o.orden === -1)?.id ?? null;
  if (oficinas.length === 0) return vacio;

  // Rôle + sedes du membre. RÈGLE : un admin (OWNER/ADMIN) n'est JAMAIS ancré —
  // voir tout est le sens même d'être admin ; gestor/asistente peuvent l'être à
  // une OU PLUSIEURS sedes (oficinaIds ; oficinaId = compat/primaire).
  let misSedes: string[] = [];
  let mem = await supabase.from("Membership").select("role, oficinaId, oficinaIds").eq("userId", user.id).limit(1).maybeSingle();
  if (mem.error) mem = await supabase.from("Membership").select("role, oficinaId").eq("userId", user.id).limit(1).maybeSingle() as typeof mem;
  const fila = mem.data as { role?: string; oficinaId?: string | null; oficinaIds?: string[] | null } | null;
  const esAdmin = fila?.role === "OWNER" || fila?.role === "ADMIN";
  if (!esAdmin) {
    misSedes = (fila?.oficinaIds?.length ? fila.oficinaIds : fila?.oficinaId ? [fila.oficinaId] : [])
      .filter((id) => oficinas.some((o) => o.id === id)); // sedes borradas: fuera
  }
  const miOficina = misSedes[0] ?? null;

  // Vistas estancas (supabase/oficinas-estanco.sql) : un membre affecté à une sede
  // ne voit QUE la sienne, en base. Lui proposer les autres dans le sélecteur
  // n'ouvrirait que des écrans vides — on ne lui offre donc que la sienne, et le
  // sélecteur s'efface tout seul (il se cache en dessous de 2 options).
  if (misSedes.length > 0) {
    // Membre ancré : ses pastilles = SES sedes ; « Todas » = l'union de ses sedes.
    const mias = oficinas.filter((o) => misSedes.includes(o.id));
    const brutoAncla = (await cookies()).get(COOKIE_OFICINA)?.value ?? null;
    const activaAncla = brutoAncla && misSedes.includes(brutoAncla) ? brutoAncla : null;
    const sedes = activaAncla ? [activaAncla] : misSedes;
    return {
      activa: activaAncla,
      oficinas: mias,
      miOficina,
      autoId,
      sedes,
      incluirSinSede: sedes.includes(autoId ?? "\u0000"),
    };
  }

  const bruto = (await cookies()).get(COOKIE_OFICINA)?.value ?? null;
  let activa: string | null;
  if (bruto === "todas") {
    activa = null;                                            // choix explicite « Todas »
  } else if (bruto && oficinas.some((o) => o.id === bruto)) {
    activa = bruto;                                           // cookie valide DANS ce despacho
  } else {
    activa = miOficina;                                       // par défaut : sa propre sede
  }

  return { activa, oficinas, miOficina, autoId, sedes: activa ? [activa] : null, incluirSinSede: activa !== null && activa === autoId };
}
