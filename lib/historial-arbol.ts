// EL ÁRBOL DEL ARCHIVO, DIBUJADO CON RECUENTOS (19/09/2026).
//
// En «En curso» el árbol se construye con los expedientes en la mano. En el archivo no:
// pueden ser quince años de trabajo. Aquí las carpetas se dibujan con los RECUENTOS que
// devuelve el servidor (servicio × año × salida × responsable) y las filas se piden
// cuando el gestor abre un año.
//
// Misma forma que el otro árbol — tema → servicio → año — para que la pantalla sea una
// sola cosa; lo que cambia es de dónde salen los números.

import { normTema } from "@/lib/servicios";
import type { ResumenHistorial } from "@/lib/data/historial";

export type CatalogoLite = { clave: string; label: string; tema: string | null };

// El AÑO ya no es un nivel del árbol sino un FILTRO (uno solo a la vez, el corriente por
// defecto): repetir «2026» en cada carpeta cuando la pantalla entera es de 2026 era ruido.
export type CarpetaServicio = { clave: string; nombre: string; n: number; servicio: string; tipo: string };
export type CarpetaTema = { clave: string; titulo: string; n: number; grupos: CarpetaServicio[]; orden: number };

export type FiltroResumen = { salida?: string | null; asignado?: string | null; tema?: string | null; anio?: string | null };

// Un expediente sin servicioClave (antiguo o importado) se agrupa por su TIPO, que es lo
// único que lo nombra. Sin esto, quince años importados caerían todos en un solo cajón.
const claveGrupo = (r: ResumenHistorial) => `${r.servicio}|${r.tipo}`;

export function filtrarResumen(filas: ResumenHistorial[], f: FiltroResumen, cat: Map<string, CatalogoLite>): ResumenHistorial[] {
  return filas.filter((r) => {
    if (f.salida != null && f.salida !== "" && (r.salida || "sin") !== f.salida) return false;
    if (f.anio != null && r.anio !== f.anio) return false;
    if (f.asignado) {
      const suyo = r.asignado || "Sin asignar";
      if (suyo !== f.asignado) return false;
    }
    if (f.tema) {
      const tema = cat.get(r.servicio)?.tema ?? null;
      if (normTema(tema ?? "") !== normTema(f.tema)) return false;
    }
    return true;
  });
}

export function totalResumen(filas: ResumenHistorial[]): number {
  return filas.reduce((a, r) => a + r.n, 0);
}

// Recuento por salida (las pastillas Todas · En trámite · Concedido · Denegado…).
export function salidasDelResumen(filas: ResumenHistorial[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of filas) {
    const k = r.salida || "sin";
    m.set(k, (m.get(k) ?? 0) + r.n);
  }
  return m;
}

// Años presentes en el archivo, del más reciente al más antiguo; «sin fecha» al final.
export function aniosDelResumen(filas: ResumenHistorial[]): { anio: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of filas) m.set(r.anio, (m.get(r.anio) ?? 0) + r.n);
  return [...m.entries()]
    .sort((x, y) => (!x[0] ? 1 : !y[0] ? -1 : y[0].localeCompare(x[0])))
    .map(([anio, n]) => ({ anio, n }));
}

// Año que se enseña al entrar: el corriente si tiene expedientes; si no, el más reciente
// que los tenga (un archivo importado puede acabar en 2024 y la pantalla no puede nacer vacía).
export function anioPorDefecto(anios: { anio: string; n: number }[], hoy = new Date()): string | null {
  if (!anios.length) return null;
  const corriente = String(hoy.getFullYear());
  return anios.some((a) => a.anio === corriente) ? corriente : anios[0].anio;
}

export function construirArbolHistorial(
  filas: ResumenHistorial[],
  o: {
    catalogo: Map<string, CatalogoLite>; temas: string[]; etiquetaSinClasificar: string;
    etiquetaTipo: (tipo: string) => string;
    // Carpetas del catálogo sin nada archivado: se pintan igual, para que el historial
    // y «En curso» enseñen las MISMAS carpetas.
    carpetasVacias?: string[];
  },
): CarpetaTema[] {
  const raices = new Map<string, CarpetaTema>();
  for (const r of filas) {
    const info = o.catalogo.get(r.servicio);
    const tema = (info?.tema ?? "").trim();
    let clave: string, titulo: string, orden: number;
    if (tema) {
      const k = normTema(tema);
      const i = o.temas.findIndex((x) => normTema(x) === k);
      clave = `tema:${k}`; titulo = i >= 0 ? o.temas[i] : tema; orden = i >= 0 ? i : 500;
    } else if (info || r.servicio || r.tipo) {
      const nombre = info?.label || o.etiquetaTipo(r.tipo) || r.servicio;
      clave = `svc:${nombre}`; titulo = nombre; orden = 800;
    } else {
      clave = "sin"; titulo = o.etiquetaSinClasificar; orden = 999;
    }
    if (!raices.has(clave)) raices.set(clave, { clave, titulo, n: 0, grupos: [], orden });
    const raiz = raices.get(clave)!;
    raiz.n += r.n;

    // Con tema, el segundo nivel es el servicio; sin tema, la raíz YA es el servicio y
    // los años cuelgan de ella (un solo grupo, que la pantalla funde con la raíz).
    const nombreGrupo = info?.label || o.etiquetaTipo(r.tipo) || r.servicio || o.etiquetaSinClasificar;
    const kg = `${clave}//${claveGrupo(r)}`;
    let g = raiz.grupos.find((x) => x.clave === kg);
    if (!g) { g = { clave: kg, nombre: nombreGrupo, n: 0, servicio: r.servicio, tipo: r.tipo }; raiz.grupos.push(g); }
    g.n += r.n;
  }
  for (const nombre of o.carpetasVacias ?? []) {
    const k = `tema:${normTema(nombre)}`;
    if (!raices.has(k)) raices.set(k, { clave: k, titulo: nombre, n: 0, grupos: [], orden: 950 });
  }
  return [...raices.values()]
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"))
    .map((r) => ({ ...r, grupos: r.grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) }));
}
