import type { SupabaseClient } from "@supabase/supabase-js";

// Contrôle de session LOCAL (29/09/2026, logs Supabase) : auth.getClaims() rafraîchit la
// session comme getUser() mais vérifie la signature du JWT avec la clé publique du projet
// (ES256, JWKS en cache 10 min) au lieu d'appeler le serveur Auth à chaque requête.
// Utilisé là où l'on passe le plus souvent : le middleware et la cloche (/api/alertas).
//
// Piège vérifié en local avec des sessions falsifiées : sur un JWT à l'algorithme inconnu
// (alg « none »…), getClaims() LANCE une erreur ordinaire au lieu de la renvoyer → 500.
// getUser() répondait « pas de session » : on garde ce comportement, toute erreur = null.
export async function reclamosDeSesion(supabase: SupabaseClient): Promise<{ sub: string } | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    return claims && typeof claims.sub === "string" && claims.sub ? { ...claims, sub: claims.sub } : null;
  } catch {
    return null;
  }
}
