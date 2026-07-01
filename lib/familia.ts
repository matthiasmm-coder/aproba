// Dossier familial: constantes partagées (rôle/parenté). La parenté est un texte libre
// contrôlé (comme sexo/estadoCivil dans lib/ficha.ts), pas un enum Postgres → évolutif.

export const PARENTESCOS = [
  ["TITULAR", "Titular"],
  ["CONYUGE", "Cónyuge"],
  ["PAREJA", "Pareja"],
  ["HIJO", "Hijo/a"],
  ["ASCENDIENTE", "Ascendiente"],
  ["OTRO", "Otro"],
] as const;

export type Parentesco = (typeof PARENTESCOS)[number][0];

export const PARENTESCO_LABEL: Record<string, string> = Object.fromEntries(PARENTESCOS);

export const parentescoLabel = (p: string | null | undefined) => (p ? PARENTESCO_LABEL[p] ?? p : "");

// Orden de presentación de los miembros (titular primero).
export const ordenParentesco = (p: string | null | undefined) => {
  const i = PARENTESCOS.findIndex(([k]) => k === p);
  return i === -1 ? PARENTESCOS.length : i;
};

// Documentos COMPARTIDOS típicos de una familia (etiqueta libre; el gestor puede añadir otro).
export const FAMILIA_DOC_TIPOS = [
  "Libro de familia",
  "Certificado de matrimonio",
  "Certificado de nacimiento",
  "Justificante de vivienda",
  "Empadronamiento familiar",
  "Medios económicos (reagrupante)",
  "Otro",
] as const;
