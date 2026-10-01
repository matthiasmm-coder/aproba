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

// EXCEPCIONES COMERCIALES por despacho (decisión de Matthias, una a una y con su porqué).
// Sin tabla: son pocas, como WS_PRECIO_HEREDADO en lib/billing.ts.
// · Asenjo Global Consulting (28/09/2026): Marta Asenjo, abogada, factura con su propio NIF
//   desde el mismo despacho → UNA oficina emisora más incluida en su Pro, sin pasar a Business.
//   01/10/2026: DOS — Luis pasa a autónomo en octubre de 2027 y facturará con su NIF; Matthias:
//   « je me débarrasse du problème une bonne fois pour toutes ».
export const OFICINAS_EXTRA_SIN_BUSINESS: Record<string, number> = {
  "367a2240-8c86-40ed-82a0-52e8d9c96011": 2,
};
export const oficinasExtraDe = (workspaceId: string): number => OFICINAS_EXTRA_SIN_BUSINESS[workspaceId] ?? 0;
export const tieneExcepcionOficinas = (workspaceId: string): boolean => oficinasExtraDe(workspaceId) > 0;
// ¿Puede este despacho crear otra oficina? Business, siempre; otro plan, solo dentro de su
// excepción (la oficina propia de la gestoría + las extra acordadas).
export function puedeCrearOficina(plan: string | null | undefined, workspaceId: string, existentes: number): boolean {
  if (plan === "BUSINESS") return true;
  const extra = OFICINAS_EXTRA_SIN_BUSINESS[workspaceId] ?? 0;
  return extra > 0 && existentes < 1 + extra;
}

// Ce que coûte le fait d'avoir `total` oficinas (0 si on est dans le forfait).
export function precioOficinaExtra(total: number): { extras: number; euros: number } | null {
  const extras = Math.max(0, total - OFICINAS_INCLUIDAS);
  return extras > 0 ? { extras, euros: extras * PRECIO_OFICINA_EXTRA } : null;
}
