// ÁRBOL DE EXPEDIENTES — la lógica pura de la pantalla Expedientes (18/09/2026).
//
// Vive fuera del componente para poder PROBARLA: esta pantalla es la casa del gestor y
// el fallo que no se puede permitir no es visual, es que un expediente no aparezca en
// ninguna carpeta. El test bloquea justo eso (todo entra, y una sola vez).
//
//   tema → servicio (o PACK, si el expediente lleva todos los servicios del pack)
//   en el historial, un nivel más: el AÑO.

import { normTema } from "@/lib/servicios";

export type PackLite = { id: string; nombre: string; servicioIds: string[] };

// Lo mínimo que el árbol necesita de un expediente. El componente pasa sus filas
// completas: cualquier objeto que cumpla esto vale (tests incluidos).
export type ItemArbol = {
  tema?: string | null;
  servicioLabel?: string | null;
  tipoLabel: string;
  claves?: string[];
  anio?: string | null;
};

export const SIN_TEMA = "__sin__";
const ORDEN_SERVICIO_SUELTO = 800;
const ORDEN_SIN_CLASIFICAR = 999;

export const temaDe = (e: ItemArbol) => (e.tema ?? "").trim() || SIN_TEMA;
export const servicioDe = (e: ItemArbol) => (e.servicioLabel ?? "").trim() || e.tipoLabel;

// Segundo nivel: el PACK si el expediente lleva todos sus servicios (así lo vendieron),
// si no el servicio principal. Es como lo archivan ellos: por lo contratado.
export function grupoDe(e: ItemArbol, packs: PackLite[]): string {
  const claves = e.claves ?? [];
  if (claves.length > 1) {
    const pk = packs.find((p) => (p.servicioIds ?? []).length > 0 && p.servicioIds.every((id) => claves.includes(id)));
    if (pk) return pk.nombre;
  }
  return servicioDe(e);
}

// Clave de la carpeta raíz de un expediente. La comparte el círculo verde del historial
// («cuántos siguen vivos en este tema»), por eso es una función y no está inline.
export function raizDe(e: ItemArbol, packs: PackLite[]): string {
  const tm = temaDe(e);
  if (tm !== SIN_TEMA) return `tema:${normTema(tm)}`;
  if (e.claves?.length || (e.servicioLabel ?? "").trim()) return `svc:${grupoDe(e, packs)}`;
  return "sin";
}

export type AnioArbol<T> = { clave: string; nombre: string; lista: T[] };
export type GrupoArbol<T> = { clave: string; nombre: string; lista: T[]; anios?: AnioArbol<T>[] };
export type RaizArbol<T> = { clave: string; titulo: string; n: number; filas: T[]; grupos: GrupoArbol<T>[]; orden: number };

export type OpcionesArbol<T> = {
  temas: string[];
  packs: PackLite[];
  porAnios: boolean;                       // historial: un nivel más
  ordenarFilas: (l: T[]) => T[];
  etiquetaSinClasificar: string;
  etiquetaSinFecha: string;
};

// ÁRBOL, como sus carpetas:
//   · con tema    → carpeta del TEMA, dentro una carpeta por servicio o pack;
//   · sin tema    → el SERVICIO es carpeta raíz (no se mezcla con lo no clasificado);
//   · sin nada    → «Sin clasificar», al final. Es lo que evita el cajón de sastre.
export function construirArbol<T extends ItemArbol>(lista: T[], o: OpcionesArbol<T>): RaizArbol<T>[] {
  const raices = new Map<string, RaizArbol<T>>();
  const raiz = (clave: string, titulo: string, orden: number) => {
    if (!raices.has(clave)) raices.set(clave, { clave, titulo, n: 0, filas: [], grupos: [], orden });
    return raices.get(clave)!;
  };
  for (const e of lista) {
    const tm = temaDe(e);
    const grupo = grupoDe(e, o.packs);
    if (tm !== SIN_TEMA) {
      // La carpeta se identifica por el tema NORMALIZADO («ARRAIGO» y «Arraigo» son una
      // sola), y se titula con la primera grafía vista — la misma regla que el portal.
      const k = normTema(tm);
      const i = o.temas.findIndex((x) => normTema(x) === k);
      const r = raiz(`tema:${k}`, i >= 0 ? o.temas[i] : tm, i >= 0 ? i : 500);
      let g = r.grupos.find((x) => x.nombre === grupo);
      if (!g) { g = { clave: `${r.clave}//${grupo}`, nombre: grupo, lista: [] }; r.grupos.push(g); }
      g.lista.push(e); r.n++;
    } else if (e.claves?.length || (e.servicioLabel ?? "").trim()) {
      const r = raiz(`svc:${grupo}`, grupo, ORDEN_SERVICIO_SUELTO);
      r.filas.push(e); r.n++;
    } else {
      const r = raiz("sin", o.etiquetaSinClasificar, ORDEN_SIN_CLASIFICAR);
      r.filas.push(e); r.n++;
    }
  }
  // HISTORIAL: el AÑO. «La nacionalidad de 2023» es como lo buscan, y convierte 300
  // expedientes de una carpeta en 5 líneas. En curso no se agrupa por año.
  const anios = (l: T[], claveGrupo: string): AnioArbol<T>[] => {
    const m = new Map<string, T[]>();
    for (const e of l) {
      const a = (e.anio ?? "").trim() || "sin";
      if (!m.has(a)) m.set(a, []);
      m.get(a)!.push(e);
    }
    return [...m.entries()]
      .sort((x, y) => (x[0] === "sin" ? 1 : y[0] === "sin" ? -1 : y[0].localeCompare(x[0])))
      .map(([a, sub]) => ({ clave: `${claveGrupo}//${a}`, nombre: a === "sin" ? o.etiquetaSinFecha : a, lista: o.ordenarFilas(sub) }));
  };
  return [...raices.values()]
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"))
    .map((r) => ({
      ...r,
      filas: o.ordenarFilas(r.filas),
      grupos: r.grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((g) => ({
        ...g,
        lista: o.ordenarFilas(g.lista),
        ...(o.porAnios ? { anios: anios(g.lista, g.clave) } : {}),
      })),
    }));
}
