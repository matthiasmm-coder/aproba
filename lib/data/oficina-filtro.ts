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
  activa: string | null;                       // sede regardée (null = todas)
  oficinas: { id: string; nombre: string }[];  // sedes du despacho (vide = mono-oficina)
  miOficina: string | null;                    // sede du membre connecté
  autoId: string | null;                       // la fila de la gestoría (orden -1)
  // La pastille de la gestoría doit montrer AUSSI les données SANS sede : sous le
  // modèle « la gestoría est une oficina », l'historique non estampillé est à elle.
  incluirSinSede: boolean;                     // true quand activa === autoId
};

export async function resolverOficina(): Promise<FiltroOficina> {
  const vacio: FiltroOficina = { activa: null, oficinas: [], miOficina: null, autoId: null, incluirSinSede: false };
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return vacio;

  // Sedes du despacho (RLS) — si la migration n'est pas passée, `error` → mono-oficina.
  const { data: ofis, error } = await supabase.from("Oficina").select("id, nombre, orden").order("orden");
  const filas = (error ? [] : (ofis ?? [])) as { id: string; nombre: string; orden: number }[];
  const oficinas = filas.map(({ id, nombre }) => ({ id, nombre }));
  const autoId = filas.find((o) => o.orden === -1)?.id ?? null;
  if (oficinas.length === 0) return vacio;

  let miOficina: string | null = null;
  const mem = await supabase.from("Membership").select("oficinaId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem.error) miOficina = (mem.data as { oficinaId?: string | null } | null)?.oficinaId ?? null;

  // Vistas estancas (supabase/oficinas-estanco.sql) : un membre affecté à une sede
  // ne voit QUE la sienne, en base. Lui proposer les autres dans le sélecteur
  // n'ouvrirait que des écrans vides — on ne lui offre donc que la sienne, et le
  // sélecteur s'efface tout seul (il se cache en dessous de 2 options).
  if (miOficina) {
    const mia = oficinas.filter((o) => o.id === miOficina);
    return { activa: miOficina, oficinas: mia, miOficina, autoId, incluirSinSede: miOficina === autoId };
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

  return { activa, oficinas, miOficina, autoId, incluirSinSede: activa !== null && activa === autoId };
}
