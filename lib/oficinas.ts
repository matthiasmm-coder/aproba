// MULTI-OFICINA — règles commerciales, partagées par l'API, l'UI et la landing.
//
// Le multi-oficina est inclus dans le plan Business : 2 oficinas comprises dans les
// 299 €/mois (Business), puis 50 €/mois par oficina supplémentaire. Cette facturation
// supplémentaire est AJOUTÉE À LA MAIN dans Stripe (volume nul aujourd'hui) —
// automatiser une ligne de facturation récurrente pour zéro client serait du code
// de paiement risqué sans contrepartie. L'app se contente de prévenir.

// Cookie du sélecteur de sede. Elle vit ICI, et pas dans lib/data/oficina-filtro.ts :
// ce module-là importe `next/headers` (serveur uniquement), et le sélecteur est un
// composant client — l'importer de là casse le build.
export const COOKIE_OFICINA = "aproba_oficina";

export const OFICINAS_INCLUIDAS = 2;
export const PRECIO_OFICINA_EXTRA = 50; // €/mois, hors IVA

// Ce que coûte le fait d'avoir `total` oficinas (0 si on est dans le forfait).
export function precioOficinaExtra(total: number): { extras: number; euros: number } | null {
  const extras = Math.max(0, total - OFICINAS_INCLUIDAS);
  return extras > 0 ? { extras, euros: extras * PRECIO_OFICINA_EXTRA } : null;
}
