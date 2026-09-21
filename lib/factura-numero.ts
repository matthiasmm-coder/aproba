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

// Numéros déjà émis DE CETTE SÉRIE. Le préfixe sépare les séries par construction :
// « DG-2026-% » ne matche que Diagonal, « 2026-% » ne matche pas « DG-2026-0001 »
// (le like ancre le début). Deux sociétés d'un même despacho ne se marchent donc
// jamais dessus, et la série commune continue exactement comme avant.
//
// ⚠️ Les numéros BRÛLÉS comptent aussi (24/08/2026, cas Gesnet) : supprimer la facture
// au sommet de la série libérait son numéro, et la suivante le REPRENAIT — deux PDF
// différents ont porté « 2026-0006 ». La route DELETE consigne désormais le numéro dans
// FacturaNumeroQuemado ; ici on l'unit aux vivants pour que max+1 ne redescende jamais.
// Repli GATED si la migration n'est pas passée : on retombe sur le comportement d'avant
// (les vivants seuls), jamais sur une série cassée.
async function emitidos(admin: Admin, workspaceId: string, year: number, prefijo = ""): Promise<string[]> {
  const patron = prefijo ? `${prefijo}-${year}-%` : `${year}-%`;
  const { data } = await admin.from("Factura").select("numero").eq("workspaceId", workspaceId).like("numero", patron);
  const vivos = ((data ?? []) as { numero: string }[]).map((r) => r.numero);
  const q = await admin.from("FacturaNumeroQuemado").select("numero").eq("workspaceId", workspaceId).like("numero", patron);
  if (q.error) {
    if (!/FacturaNumeroQuemado|relation|does not exist|schema cache|PGRST205/i.test(q.error.message)) {
      console.error("[factura-numero] quemados ilegibles:", q.error.message);
    }
    return vivos;
  }
  return [...vivos, ...((q.data ?? []) as { numero: string }[]).map((r) => r.numero)];
}

// Prochain numéro libre de la série (préfixe d'oficina, ou série commune).
export async function siguienteNumero(admin: Admin, workspaceId: string, year = new Date().getFullYear(), prefijo = ""): Promise<string> {
  return calcularSerie(await emitidos(admin, workspaceId, year, prefijo), year, 1, prefijo)[0];
}

// N numéros consécutifs (facturation fractionnée), même série.
export async function siguienteSerie(admin: Admin, workspaceId: string, cuantos: number, year = new Date().getFullYear(), prefijo = ""): Promise<string[]> {
  return calcularSerie(await emitidos(admin, workspaceId, year, prefijo), year, cuantos, prefijo);
}

// Ordinal de un número de factura («DG-2026-0312» → 312). Misma lectura que calcularSerie.
export const ordinalDeNumero = (numero: string): number => {
  const n = Number(String(numero).split("-").pop());
  return Number.isFinite(n) ? n : 0;
};

// ── ARRANQUE DE SERIE (Luis, Asenjo 21/09/2026: «vengo de Excel, mi última factura es la 0312») ──
// El despacho escribe el ÚLTIMO número emitido fuera de Aproba y la serie sigue desde el
// siguiente (la route lo consigna en FacturaNumeroQuemado: max+1 sube y ya no baja).
// Puro: entrada del gestor → número canónico de ESTA serie (año + prefijo) o motivo del rechazo.
// Acepta «312», «0312», «2026-0312» y «DG-2026-0312»; el año y el prefijo, si vienen, deben
// ser los de la serie (una serie solo se fija para el año en curso).
export function interpretarUltimoNumero(entrada: string, year: number, prefijo = ""): { numero: string; n: number } | { error: string } {
  const base = prefijo ? `${prefijo}-${year}` : `${year}`;
  const v = String(entrada ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!v) return { error: "Escribe el último número emitido." };
  const partes = v.split("-");
  let pref = "", anio = "", num = "";
  if (partes.length === 1) [num] = partes;
  else if (partes.length === 2) { if (/^\d{4}$/.test(partes[0])) [anio, num] = partes; else [pref, num] = partes; }
  else if (partes.length === 3) [pref, anio, num] = partes;
  else return { error: `Formato no reconocido. Escribe solo el número (p. ej. 0312) o el número completo (${base}-0312).` };
  if (!/^\d{1,6}$/.test(num)) return { error: `Formato no reconocido. Escribe solo el número (p. ej. 0312) o el número completo (${base}-0312).` };
  if (pref && pref !== prefijo) return { error: prefijo ? `El prefijo de esta serie es «${prefijo}», no «${pref}».` : `Esta serie no lleva prefijo (la siguiente sería ${base}-…).` };
  if (anio && Number(anio) !== year) return { error: `Solo se puede fijar la serie del año en curso (${year}).` };
  const n = Number(num);
  if (!Number.isInteger(n) || n < 1) return { error: "El número debe ser mayor que 0." };
  return { numero: `${base}-${String(n).padStart(PADDING, "0")}`, n };
}
