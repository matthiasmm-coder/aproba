// CARPETAS DEL CATÁLOGO — Ajustes › Servicios como un explorador de archivos (20/09/2026).
//
//   · una carpeta puede tener SUBCARPETAS (dos niveles: es lo que se recorre de un vistazo);
//   · dentro viven los servicios Y los packs, en la misma lista;
//   · un servicio con servicios dentro ES un pack — su clave no cambia al convertirlo,
//     así que los expedientes que ya lo citan siguen resolviendo su nombre;
//   · una carpeta puede reservarse a ciertas personas (los administradores lo ven todo).
//
// Nada de esto borra nada: `categoria` sigue siendo el NOMBRE de la carpeta, que es lo
// que leen el portal del cliente, el árbol de expedientes y el importador.

import type { Servicio } from "@/lib/servicios";

export type Carpeta = {
  id: string;
  nombre: string;
  parentId: string | null;
  orden: number;
  usuarios?: string[]; // vacío o ausente = todo el equipo
};

export type Item = Servicio; // servicio o pack (según `servicioIds`)

export const esPack = (x: Pick<Servicio, "servicioIds">) => (x.servicioIds ?? []).length > 0;

export const nuevaCarpeta = (nombre: string, parentId: string | null = null, orden = 0): Carpeta =>
  ({ id: "tema_" + Math.random().toString(36).slice(2, 10), nombre: nombre.trim(), parentId, orden, usuarios: [] });

// ── Quién ve qué ─────────────────────────────────────────────────────────────
// Regla igual que en multi-oficina: un ADMIN nunca está limitado (ver todo es el sentido
// mismo de ser admin). Sin lista, la carpeta es de todo el equipo.
// OJO: esto oculta el CATÁLOGO, nunca un expediente ya abierto.
export function puedeVerCarpeta(c: Carpeta | undefined, userId: string | null, esAdmin: boolean): boolean {
  if (!c) return true;
  if (esAdmin) return true;
  const lista = c.usuarios ?? [];
  if (lista.length === 0) return true;
  return Boolean(userId && lista.includes(userId));
}

export type Nodo = { carpeta: Carpeta; hijas: Carpeta[] };

// Árbol de dos niveles, ordenado. Una subcarpeta huérfana (su madre ya no existe) sube a
// la raíz en vez de desaparecer — perder de vista los servicios sería lo peor que podría pasar.
export function arbolCarpetas(carpetas: Carpeta[]): Nodo[] {
  const porId = new Map(carpetas.map((c) => [c.id, c]));
  // Una huérfana va al FINAL: es una anomalía, no tiene por qué empujar hacia abajo las
  // carpetas de verdad.
  const huerfana = (c: Carpeta) => Boolean(c.parentId) && !porId.has(c.parentId as string);
  const raices = carpetas.filter((c) => !c.parentId || huerfana(c));
  const orden = (a: Carpeta, b: Carpeta) =>
    Number(huerfana(a)) - Number(huerfana(b)) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");
  return [...raices].sort(orden).map((carpeta) => ({
    carpeta,
    hijas: carpetas.filter((c) => c.parentId === carpeta.id).sort(orden),
  }));
}

// Nombre que se escribe en `categoria` (lo que verá el portal): el de la carpeta HOJA.
export function nombreDeCarpeta(carpetas: Carpeta[], temaId: string | null | undefined): string {
  return carpetas.find((c) => c.id === temaId)?.nombre ?? "";
}

// «Arraigo › Casos especiales», para enseñar dónde está un servicio.
export function rutaDeCarpeta(carpetas: Carpeta[], temaId: string | null | undefined): string[] {
  const hoja = carpetas.find((c) => c.id === temaId);
  if (!hoja) return [];
  const madre = hoja.parentId ? carpetas.find((c) => c.id === hoja.parentId) : null;
  return madre ? [madre.nombre, hoja.nombre] : [hoja.nombre];
}

// Precio de un ítem: el del servicio, o la suma de los incluidos menos el descuento si es
// un pack. El pack NUNCA guarda un importe propio: así no puede divergir de lo que suma.
export function precioDeItem(item: Item, todos: Item[]): { suma: number; total: number; pct: number } {
  if (!esPack(item)) {
    const total = (item.anticipo ?? 0) + (item.resto ?? 0);
    return { suma: total, total, pct: 0 };
  }
  const suma = Math.round((item.servicioIds ?? []).reduce((a, id) => {
    const s = todos.find((x) => x.id === id);
    return a + (s ? (s.anticipo ?? 0) + (s.resto ?? 0) : 0);
  }, 0) * 100) / 100;
  const pct = Math.min(100, Math.max(0, Number(item.descuentoPct) || 0));
  return { suma, total: Math.round(suma * (1 - pct / 100) * 100) / 100, pct };
}

// Borrar una carpeta NO borra nada dentro: las subcarpetas suben un nivel y los servicios
// se quedan sin carpeta, a la vista, en vez de desaparecer con ella.
export function quitarCarpeta(carpetas: Carpeta[], items: Item[], id: string): { carpetas: Carpeta[]; items: Item[] } {
  const c = carpetas.find((x) => x.id === id);
  if (!c) return { carpetas, items };
  return {
    carpetas: carpetas.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: c.parentId } : x)),
    items: items.map((x) => (x.temaId === id ? { ...x, temaId: c.parentId, categoria: "" } : x)),
  };
}

// Mover un ítem a una carpeta (o fuera de toda carpeta con null), manteniendo `categoria`
// —el nombre de la carpeta— que es lo que siguen leyendo portal, árbol e importador.
export function moverItem(items: Item[], carpetas: Carpeta[], itemId: string, temaId: string | null): Item[] {
  return items.map((x) => (x.id === itemId ? { ...x, temaId, categoria: nombreDeCarpeta(carpetas, temaId) } : x));
}

// Los nombres de carpeta se mantienen únicos entre hermanas: dos «Arraigo» en el mismo
// nivel darían dos carpetas idénticas en el portal.
export function nombreLibre(carpetas: Carpeta[], nombre: string, parentId: string | null, excepto?: string): boolean {
  const n = nombre.trim().toLowerCase();
  if (!n) return false;
  return !carpetas.some((c) => c.id !== excepto && (c.parentId ?? null) === parentId && c.nombre.trim().toLowerCase() === n);
}

// Renombrar arrastra el nombre a los servicios de dentro (su `categoria`).
export function renombrarCarpeta(carpetas: Carpeta[], items: Item[], id: string, nombre: string): { carpetas: Carpeta[]; items: Item[] } {
  const limpio = nombre.trim().slice(0, 60);
  if (!limpio) return { carpetas, items };
  const nuevas = carpetas.map((c) => (c.id === id ? { ...c, nombre: limpio } : c));
  return { carpetas: nuevas, items: items.map((x) => (x.temaId === id ? { ...x, categoria: limpio } : x)) };
}
