// SERVICIOS MIGRADOS: el concepto de cada factura y los pagos de un mismo servicio — módulo
// PURO (cliente y servidor).
//
// Lo migrado de un sistema anterior (ServicioHistorico) es UNA FILA POR FACTURA, y el
// Historial parecía tener duplicados (Luis, 25/09/2026):
//  · el concepto no se veía: «CUENTA AJENA – BAKARY MANNEH» y «– LAMINE MANNEH», pagados por
//    el mismo cliente, salían como dos líneas idénticas;
//  · un servicio cobrado en varias facturas («Primer pago (1-2)», «Segundo pago (2-2)»)
//    salía una vez por factura.
// Aquí vive lo que no depende de la base: leer el concepto de `notas`, decidir si dice algo
// más que el nombre del servicio, y reconocer las facturas de un mismo servicio. El enlace
// se guarda en ServicioHistorico.pagoDeId (supabase/historial-pagos.sql).

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// El concepto de la factura original: la 1ª línea de `notas`, sin el «Factura: » de la migración.
export function conceptoDeNotas(notas: string | null | undefined): string | null {
  const linea = (notas ?? "").split("\n")[0].replace(/^\s*Factura:\s*/i, "").replace(/\s+/g, " ").trim();
  return linea || null;
}

const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "por", "para", "a", "al", "en", "con", "tramite", "tramites", "tramitacion"]);
const palabras = (s: string) => sinAcentos(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !VACIAS.has(w));

// ¿Dice el concepto algo que no diga ya el nombre del servicio? «REGULARIZACION 2026» en la
// carpeta «… (Regularización 2026)» no aporta nada; «CUENTA AJENA – BAKARY MANNEH» sí.
export function conceptoUtil(concepto: string | null | undefined, servicio: string | null | undefined): string | null {
  const c = (concepto ?? "").trim();
  const propias = palabras(c);
  if (!propias.length) return null;
  const delServicio = new Set(palabras(servicio ?? ""));
  return propias.every((w) => delServicio.has(w)) ? null : c;
}

// ── Pagos de un mismo servicio ───────────────────────────────────────────────
export type MarcaPago = { orden: number; de: number | null };
const ORDINAL: Record<string, number> = {
  primer: 1, primero: 1, "1er": 1, "1º": 1, "1ª": 1, "1o": 1,
  segundo: 2, "2º": 2, "2ª": 2, "2o": 2,
  tercer: 3, tercero: 3, "3er": 3, "3º": 3, "3ª": 3, "3o": 3,
};
const RE_FRACCION = /\(\s*(\d)\s*[-/]\s*(\d)\s*\)/;                          // (1-2), (2/2)
const RE_FACTURA = /\(?\s*factura\s+(\d)\s+de\s+(\d)\s*\)?/i;                // (Factura 1 de 2)
const RE_PAGO = /(?:^|[^a-z0-9])(primer|primero|segundo|tercer|tercero|1er|3er|[123][ºªo])\s+pago(?![a-z])/i; // Primer pago, 2º pago

export function marcaDePago(concepto: string | null | undefined): MarcaPago | null {
  const c = sinAcentos(concepto ?? "");
  const m = c.match(RE_FRACCION) ?? c.match(RE_FACTURA);
  if (m) return { orden: Number(m[1]), de: Number(m[2]) };
  const p = c.match(RE_PAGO);
  const orden = p ? ORDINAL[p[1].toLowerCase()] : undefined;
  return orden ? { orden, de: null } : null;
}

// El concepto sin la marca de pago: «RESIDENCIA CUENTA AJENA INICIAL – Primer pago (1-2)» →
// «RESIDENCIA CUENTA AJENA INICIAL».
export function sinMarcaDePago(concepto: string): string {
  return concepto
    .replace(/\(\s*\d\s*[-/]\s*\d\s*\)/g, " ")
    .replace(/\(?\s*factura\s+\d\s+de\s+\d\s*\)?/gi, " ")
    .replace(/(primer|primero|segundo|tercer|tercero|1er|3er|[123][ºªo])\s+pago(?![a-z])/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s–—\-,.;:]+|[\s–—\-,.;:]+$/g, "")
    .trim();
}

export type FilaPago = { id: string; titular: string; servicio: string; concepto: string | null; fecha: string | null };

// Facturas de un MISMO servicio: mismo titular, mismo servicio, el mismo concepto una vez
// quitada la marca de pago, y pagos que se suceden (1, 2, 3…). Sin marca no se junta nada:
// dos facturas iguales pueden ser dos servicios (dos hijos, dos años). Si la numeración
// vuelve a empezar, empieza otro servicio. Devuelve factura → primera factura de su servicio.
export function detectarPagos(filas: FilaPago[]): Map<string, string> {
  const grupos = new Map<string, { f: FilaPago; m: MarcaPago }[]>();
  for (const f of filas) {
    const m = marcaDePago(f.concepto);
    const base = m && f.concepto ? sinAcentos(sinMarcaDePago(f.concepto)).toLowerCase() : "";
    if (!m || !base) continue;
    const k = `${f.titular}|${f.servicio}|${base}`;
    grupos.set(k, [...(grupos.get(k) ?? []), { f, m }]);
  }
  const out = new Map<string, string>();
  for (const g of grupos.values()) {
    g.sort((a, b) => (a.f.fecha ?? "").localeCompare(b.f.fecha ?? "") || a.m.orden - b.m.orden);
    let cadena: typeof g = [];
    const cerrar = () => { for (const x of cadena.slice(1)) out.set(x.f.id, cadena[0].f.id); };
    for (const x of g) {
      if (cadena.length && x.m.orden <= cadena[cadena.length - 1].m.orden) { cerrar(); cadena = []; }
      cadena.push(x);
    }
    cerrar();
  }
  return out;
}

// Junta cada factura con las demás de su servicio (pagoDeId → la primera). Una factura cuya
// primera no está en la lista se queda sola.
export function agruparPagos<T extends { id: string; pagoDeId?: string | null; fecha?: string | null }>(filas: T[]): { principal: T; pagos: T[] }[] {
  const ids = new Set(filas.map((f) => f.id));
  const esPago = (f: T) => Boolean(f.pagoDeId && f.pagoDeId !== f.id && ids.has(f.pagoDeId));
  const hijos = new Map<string, T[]>();
  for (const f of filas) if (esPago(f)) hijos.set(f.pagoDeId as string, [...(hijos.get(f.pagoDeId as string) ?? []), f]);
  return filas.filter((f) => !esPago(f)).map((f) => ({
    principal: f,
    pagos: [f, ...(hijos.get(f.id) ?? []).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))],
  }));
}

// Cobro de un servicio con varias facturas: pendiente si queda alguna, cobrado si lo están todas.
export function cobroDePagos(cobros: (string | null | undefined)[]): string | null {
  if (cobros.some((c) => c === "PENDIENTE")) return "PENDIENTE";
  return cobros.length && cobros.every((c) => c === "COBRADA") ? "COBRADA" : null;
}
