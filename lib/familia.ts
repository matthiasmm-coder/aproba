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

// ¿Un documento requerido es COMÚN a la familia (se sube una vez) o PERSONAL (uno por miembro)?
// Heurística por palabras clave del dominio (extranjería ES). Común: libro de familia, matrimonio,
// vivienda, empadronamiento, medios del reagrupante. El resto (pasaporte, antecedentes, TIE,
// nacimiento de cada hijo…) es personal → se pide a cada miembro.
const DOCS_COMUNES_KW = ["libro de familia", "matrimonio", "vivienda", "empadronamiento", "reagrupante", "medios economicos", "medios económicos"];
const normDoc = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const esDocComunFamilia = (label: string) => DOCS_COMUNES_KW.some((k) => normDoc(label).includes(k));
export const partirDocsFamilia = (labels: string[]) => ({
  comunes: labels.filter(esDocComunFamilia),
  porMiembro: labels.filter((l) => !esDocComunFamilia(l)),
});

// Familia HETEROGÉNEA: docs COMUNES (se suben UNA vez, clienteId null) + los de CADA
// miembro según SUS servicios asignados. Sin entrada en la asignación → el servicio
// aplica a todos (mismo criterio que miembrosDeServicio/tarifaAsignada). La hoja de
// encargo / el mandato NUNCA salen de aquí: son del bloque firma (común, con descarga) —
// misma exclusión que hacía el portal /j sobre la lista plana.
export function docsFamiliaPorServicios(
  servicios: { id: string; docs?: string[] }[],
  asignacion: Record<string, string[]> | null | undefined,
  solicitantes: { id: string }[],
): { comunes: string[]; porMiembro: Record<string, string[]> } {
  const norm = (l: string) => l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esFirma = (l: string) => { const n = norm(l); return n.includes("encargo") || n.includes("mandato"); };
  const comunes: string[] = [];
  const porMiembro: Record<string, string[]> = Object.fromEntries(solicitantes.map((m) => [m.id, [] as string[]]));
  for (const sv of servicios) {
    const lista = asignacion?.[sv.id];
    const destinatarios = lista?.length ? solicitantes.filter((m) => lista.includes(m.id)) : solicitantes;
    for (const d of sv.docs ?? []) {
      if (esFirma(d)) continue;
      if (esDocComunFamilia(d)) { if (!comunes.includes(d)) comunes.push(d); }
      else for (const m of destinatarios) if (!porMiembro[m.id].includes(d)) porMiembro[m.id].push(d);
    }
  }
  return { comunes, porMiembro };
}
