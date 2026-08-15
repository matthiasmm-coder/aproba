// CONTEXTE DE TRAVAIL — côté navigateur. Source unique de la règle « pastille
// active » pour les composants client ; le pendant serveur (canonique) vit dans
// lib/oficinas-server.ts (oficinaDelUsuario / contextoDeCreacion). Toute
// évolution de la règle se fait ICI et LÀ-BAS, nulle part ailleurs.
//
// Règle : le cookie `aproba_oficina` désigne la pastille active. Il n'est JAMAIS
// cru sur parole : admin → l'oficina doit être du despacho (RLS la montre) ;
// gestor/asistente → elle doit être une de SES sedes. « todas » ou invalide →
// pas de sede active. « Todas » est une vue de LECTURE : les créations exigent
// une sede concrète quand le despacho a ≥2 oficinas (le serveur refuse en 400
// de toute façon — ceci n'est que le confort UI).
import { createSupabaseBrowser } from "@/lib/supabase/client";

export type ContextoTrabajo = {
  esAdmin: boolean;
  misSedes: string[];                            // sedes del miembro (vacío para admins)
  oficinas: { id: string; nombre: string }[];    // las del despacho, orden estable
  elegibles: { id: string; nombre: string }[];   // las que ESTE usuario puede estampar
  multi: boolean;                                // ≥2 oficinas en el despacho
  activa: string | null;                         // pastilla activa VALIDADA (null = «Todas»)
  nombreActiva: string | null;
};

export function leerCookieSede(): string | null {
  if (typeof document === "undefined") return null;
  const bruto = document.cookie.split("; ").find((c) => c.startsWith("aproba_oficina="))?.split("=")[1] ?? null;
  return bruto && bruto !== "todas" ? bruto : null;
}

// Lit membresía + oficinas (2 requêtes RLS) et valide la pastille. Tolérant aux
// migrations manquantes : sans colonne oficinaIds ou sans table Oficina, on
// retombe sur « pas de multi-oficina » (comportement historique).
export async function contextoDeTrabajoBrowser(): Promise<ContextoTrabajo> {
  const vacio: ContextoTrabajo = { esAdmin: false, misSedes: [], oficinas: [], elegibles: [], multi: false, activa: null, nombreActiva: null };
  try {
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return vacio;
    // ⚠️ `.eq("userId")` OBLIGATOIRE : RLS montre TOUTES les membresías du
    // despacho — un .limit(1) nu renvoie la ligne d'un collègue.
    let mem = await supabase.from("Membership").select("role, oficinaId, oficinaIds").eq("userId", user.id).limit(1).maybeSingle();
    if (mem.error) mem = await supabase.from("Membership").select("role, oficinaId").eq("userId", user.id).limit(1).maybeSingle() as typeof mem;
    const m = mem.data as { role?: string; oficinaId?: string | null; oficinaIds?: string[] | null } | null;
    const esAdmin = m?.role === "OWNER" || m?.role === "ADMIN";
    const misSedes = m?.oficinaIds?.length ? m.oficinaIds : m?.oficinaId ? [m.oficinaId] : [];

    const { data: ofis } = await supabase.from("Oficina").select("id, nombre, orden").order("orden");
    const oficinas = ((ofis ?? []) as { id: string; nombre: string }[]).map(({ id, nombre }) => ({ id, nombre }));
    const elegibles = esAdmin ? oficinas : oficinas.filter((o) => misSedes.includes(o.id));

    const cookie = leerCookieSede();
    const activa = cookie && elegibles.some((o) => o.id === cookie) ? cookie : null;
    return {
      esAdmin, misSedes, oficinas, elegibles,
      multi: oficinas.length >= 2,
      activa,
      nombreActiva: oficinas.find((o) => o.id === activa)?.nombre ?? null,
    };
  } catch { return vacio; }
}
