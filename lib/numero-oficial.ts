// Nº de expediente OFICIAL (el que asigna Extranjería) — petición de Jennifer, 23-24/09/2026.
// Texto libre porque el formato cambia por provincia y procedimiento. Se limpia lo
// mínimo para que buscar y comparar funcionen: sin espacios sobrantes y en mayúsculas.
// "" = borrarlo. Máximo 60 caracteres (lo más largo visto ronda los 25).
export const MAX_NUMERO_OFICIAL = 60;
export function normalizarNumeroOficial(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, MAX_NUMERO_OFICIAL);
}

// Lo que la consulta oficial (infoext2) necesita: el NIE O el nº de expediente, más la
// fecha de presentación y el año de nacimiento. Devuelve lo que FALTA (vacío = se puede).
export function faltaParaConsultar(f: { nie: string; numeroOficial: string; fechaPresentacion: string; fechaNacimiento: string }): string[] {
  const faltan: string[] = [];
  if (!f.nie && !f.numeroOficial) faltan.push("NIE o nº de expediente");
  if (!f.fechaPresentacion) faltan.push("fecha de presentación");
  if (!f.fechaNacimiento.slice(0, 4)) faltan.push("año de nacimiento");
  return faltan;
}
