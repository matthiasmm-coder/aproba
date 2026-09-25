// PERSONAS DE UNA MIGRACIÓN — módulo PURO (cliente y servidor): qué filas del archivo son la
// MISMA persona y a qué cliente del despacho corresponde cada una.
//
// Un listado de FACTURAS (Luis, 24/09/2026) trae al mismo cliente una vez por factura. Antes,
// la 2ª fila de una persona se descartaba ENTERA —y con ella su servicio—: hubo que importar
// en dos pasadas. Ahora cada fila sigue siendo un servicio y la persona se crea (o se
// completa) una sola vez, con todo lo que traen sus filas.
//
// Reglas, de la más fuerte a la más débil:
//  1. mismo NIE/DNI → misma persona;
//  2. mismo pasaporte → misma persona;
//  3. mismo nombre y apellidos sin nada que se contradiga (dos NIE, dos pasaportes o dos
//     fechas de nacimiento distintos) y SIN homónimos: un solo candidato posible. Con varios,
//     decide el email si coincide; si no, no se adivina. El email SOLO no basta: una familia
//     comparte a menudo el del titular.
// En la duda, dos personas y un aviso para revisarlo: fundir a dos personas en una ficha es
// peor que un duplicado, que se junta a mano.

import type { ClienteFicha } from "@/lib/ficha";
import type { FilaImportada } from "@/lib/importar";

export type Identidad = {
  numeroDocumento?: string | null; pasaporte?: string | null; email?: string | null;
  nombre?: string | null; apellidos?: string | null; fechaNacimiento?: string | null;
};

const txt = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const nieDe = (p: Identidad) => (p.numeroDocumento ?? "").replace(/[\s.-]/g, "").toUpperCase();
const pasDe = (p: Identidad) => (p.pasaporte ?? "").replace(/[\s.-]/g, "").toUpperCase();
const nacDe = (p: Identidad) => (p.fechaNacimiento ?? "").slice(0, 10);
export const claveNombre = (p: Identidad) => { const n = txt(p.nombre); return n ? `${n}|${txt(p.apellidos)}` : ""; };

// ¿Se contradicen? Dos NIE/DNI, dos pasaportes o dos fechas de nacimiento distintos.
export function chocan(a: Identidad, b: Identidad): boolean {
  const distintos = (x: string, y: string) => Boolean(x && y && x !== y);
  return distintos(nieDe(a), nieDe(b)) || distintos(pasDe(a), pasDe(b)) || distintos(nacDe(a), nacDe(b));
}

const CAMPOS_ID = ["numeroDocumento", "pasaporte", "email", "nombre", "apellidos", "fechaNacimiento"] as const;

// Índice de personas ya vistas (filas anteriores o clientes del despacho). Cada persona
// acumula lo que se sabe de ella: una fila con NIE y otra con pasaporte se reconocen después.
export function crearIndicePersonas<R>() {
  const identidades = new Map<R, Identidad>();
  const porNie = new Map<string, R>();
  const porPasaporte = new Map<string, R>();
  const porNombre = new Map<string, R[]>();
  function añadir(ref: R, p: Identidad) {
    const acum: Identidad = { ...(identidades.get(ref) ?? {}) };
    for (const k of CAMPOS_ID) if (!acum[k] && p[k]) acum[k] = p[k];
    identidades.set(ref, acum);
    const nie = nieDe(p); if (nie && !porNie.has(nie)) porNie.set(nie, ref);
    const pas = pasDe(p); if (pas && !porPasaporte.has(pas)) porPasaporte.set(pas, ref);
    const k = claveNombre(p);
    if (k) { const l = porNombre.get(k) ?? []; if (!l.includes(ref)) l.push(ref); porNombre.set(k, l); }
  }
  // `coincide`: la persona encontrada; `choca`: alguien con el mismo nombre que no se puede
  // afirmar que sea ella (otro documento, otra fecha de nacimiento u homónimos) — para avisar.
  function buscar(p: Identidad): { coincide?: R; choca?: R } {
    const nie = nieDe(p);
    if (nie && porNie.has(nie)) return { coincide: porNie.get(nie) };
    const pas = pasDe(p);
    if (pas && porPasaporte.has(pas)) return { coincide: porPasaporte.get(pas) };
    const candidatos = porNombre.get(claveNombre(p)) ?? [];
    const compatibles = candidatos.filter((r) => !chocan(p, identidades.get(r) ?? {}));
    const email = txt(p.email);
    const mismoEmail = email ? compatibles.find((r) => txt(identidades.get(r)?.email) === email) : undefined;
    if (mismoEmail !== undefined) return { coincide: mismoEmail };
    if (compatibles.length === 1 && candidatos.length === 1) return { coincide: compatibles[0] };
    return candidatos.length ? { choca: candidatos.find((r) => !compatibles.includes(r)) ?? candidatos[0] } : {};
  }
  return { añadir, buscar };
}

// Filas de la misma persona dentro del archivo: `mismaQue` = la primera fila de esa persona
// (null si es la primera o no entra). Cada fila conserva su servicio.
export function marcarMismaPersona(filas: FilaImportada[]): void {
  const indice = crearIndicePersonas<number>();
  filas.forEach((f, i) => {
    f.mismaQue = null;
    if (f.excluir || !f.ficha.nombre?.trim()) return;
    const { coincide, choca } = indice.buscar(f.ficha);
    if (coincide !== undefined) { f.mismaQue = coincide; indice.añadir(coincide, f.ficha); return; }
    if (choca !== undefined) f.avisos.push(`Mismo nombre que la fila ${choca + 1} con otros datos (documento, fecha de nacimiento u homónimos): se importa como otra persona — revísalo`);
    indice.añadir(i, f.ficha);
  });
}

// La ficha de un grupo de filas: el primer valor no vacío de cada campo, por orden de fila.
export function fusionarFichas(fichas: ClienteFicha[]): ClienteFicha {
  const out: ClienteFicha = {};
  for (const f of fichas) {
    for (const [k, v] of Object.entries(f) as [keyof ClienteFicha, string | undefined][]) {
      if (v && !out[k]) out[k] = v;
    }
  }
  return out;
}

// Caducidad de una persona con varias filas: la más reciente; una REAL (columna del archivo o
// corregida por el gestor) manda sobre las estimadas.
export function caducidadDeGrupo(filas: { fechaCaducidad: string; caducidadDerivada: string }[]): { fecha: string; fuente: "REAL" | "ESTIMADA" } | null {
  const ultima = (xs: string[]) => xs.filter(Boolean).sort().pop();
  const real = ultima(filas.map((f) => f.fechaCaducidad));
  if (real) return { fecha: real, fuente: "REAL" };
  const estimada = ultima(filas.map((f) => f.caducidadDerivada));
  return estimada ? { fecha: estimada, fuente: "ESTIMADA" } : null;
}
