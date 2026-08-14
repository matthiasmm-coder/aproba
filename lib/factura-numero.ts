/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// NUMÉROTATION DES FACTURAS — point de vérité UNIQUE.
//
// Avant, six endroits recalculaient la série chacun de leur côté (pagos, pagos/fraccionar,
// citas-previas, familias/[id]/factura, et deux fois la page « nueva factura », côté
// NAVIGATEUR). Sur la seule donnée du produit qu'on ne peut pas corriger après coup —
// un numéro de facture émis est définitif —, six implémentations, c'était six occasions
// de diverger. Trois utilisaient le maximum NUMÉRIQUE, trois un tri lexicographique.
//
// ⚠️ Le tri lexicographique est faux au-delà de 9 999 factures dans l'année :
// "2026-9999" > "2026-10000" en ordre alphabétique. Identique en dessous, d'où
// l'absence de dégât jusqu'ici. Cette fonction prend TOUJOURS le maximum numérique.
//
// La dernière partie après le tiret est lue avec `.pop()`, pas `[1]` : un préfixe par
// oficina (« DG-2026-0001 ») passera sans rien changer ici.

export const PADDING = 4;

// `cuantos` numéros consécutifs à partir des numéros déjà émis. Pure, donc testable.
// Fraccionar en a besoin de N d'un coup : le compteur ne se relit pas entre deux cuotas.
export function calcularSerie(numeros: string[], year: number, cuantos = 1, prefijo = ""): string[] {
  const base = prefijo ? `${prefijo}-${year}` : `${year}`;
  const max = numeros.reduce((m, raw) => {
    const n = Number(String(raw).split("-").pop());
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return Array.from({ length: cuantos }, (_, i) => `${base}-${String(max + 1 + i).padStart(PADDING, "0")}`);
}

export const calcularSiguiente = (numeros: string[], year: number, prefijo = ""): string =>
  calcularSerie(numeros, year, 1, prefijo)[0];

async function emitidos(admin: Admin, workspaceId: string, year: number): Promise<string[]> {
  const { data } = await admin.from("Factura").select("numero").eq("workspaceId", workspaceId).like("numero", `${year}-%`);
  return ((data ?? []) as { numero: string }[]).map((r) => r.numero);
}

// Prochain numéro libre du workspace pour l'année en cours.
export async function siguienteNumero(admin: Admin, workspaceId: string, year = new Date().getFullYear()): Promise<string> {
  return calcularSerie(await emitidos(admin, workspaceId, year), year, 1)[0];
}

// N numéros consécutifs (facturation fractionnée).
export async function siguienteSerie(admin: Admin, workspaceId: string, cuantos: number, year = new Date().getFullYear()): Promise<string[]> {
  return calcularSerie(await emitidos(admin, workspaceId, year), year, cuantos);
}
