// AGENDA POR MIEMBRO (Jennifer, Gesnet, 03/10/2026: «como administradora, ver mi calendario
// y el de los demás»). Cada cita tiene quien la atiende: la cita previa, el miembro elegido
// al crearla (por defecto, quien la crea); la cita con la Administración, el responsable del
// expediente. La agenda del Inicio pinta a cada uno con su color y filtra por persona.
// Reglas puras, compartidas por la agenda y sus pruebas.

export type MiembroAgenda = { id: string; nombre: string };

// Colores legibles sobre blanco, en el orden del equipo (alfabético): estables entre visitas.
export const PALETA_AGENDA = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#db2777", "#0891b2", "#65a30d", "#dc2626"] as const;
export const GRIS_SIN_ASIGNAR = "#94a3b8";

export const SIN_ASIGNAR = "__sin_asignar__";

export function colorDeMiembro(miembros: MiembroAgenda[], id: string | null | undefined): string {
  const i = id ? miembros.findIndex((m) => m.id === id) : -1;
  return i < 0 ? GRIS_SIN_ASIGNAR : PALETA_AGENDA[i % PALETA_AGENDA.length];
}

// «" (todos), SIN_ASIGNAR o el id de un miembro.
export function filtrarPorMiembro<T extends { asignadoAId?: string | null }>(citas: T[], filtro: string): T[] {
  if (!filtro) return citas;
  if (filtro === SIN_ASIGNAR) return citas.filter((c) => !c.asignadoAId);
  return citas.filter((c) => c.asignadoAId === filtro);
}

// «Alexandra Ventura» → «Alexandra V.» (los chips del filtro son estrechos).
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}
