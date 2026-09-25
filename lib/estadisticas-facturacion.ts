// ESTADÍSTICAS DE FACTURACIÓN — módulo PURO (cliente y servidor).
//
// Petición de Luis (Asenjo, 25/09/2026): ver su facturación con métricas y curvas, las
// emitidas frente a las recibidas, y descargar un informe. Su referencia es la hoja
// «Resumen Trimestres» de su Excel: IVA de las emitidas frente al de las recibidas y la
// estimación del trimestre, lo facturado, lo cobrado y lo pendiente.
//
// Qué entra:
//  · EMITIDAS: las facturas de Aproba (ni borradores ni anuladas; una rectificativa lleva
//    sus importes en negativo y neutraliza a la original) + lo facturado ANTES de Aproba
//    (historial importado con importe). Una importada sin desglose de IVA cuenta en el
//    TOTAL y nunca en la base ni en el IVA: el desglose no se inventa.
//  · RECIBIDAS: las facturas de proveedores (Facturas › Recibidas).
// Qué NO es: contabilidad. El IVA «a ingresar / a compensar» es una estimación hecha con
// las facturas que hay en Aproba; no sustituye a los modelos 303, 111 o 115.

export type FuenteEmitida = "APROBA" | "ANTERIOR";

export type MovEmitida = {
  fecha: string;          // AAAA-MM-DD (emisión)
  base: number | null;    // honorarios sin IVA ni suplidos; null = importada sin desglose
  iva: number | null;
  total: number;          // lo facturado: base + IVA + suplidos
  cobrado: number | null; // parte ya cobrada; null = estado del cobro desconocido
  cliente: string;
  fuente: FuenteEmitida;
  ref?: string;           // nº de factura (o referencia importada): solo para el detalle exportado
  concepto?: string;
  servicio?: string;      // servicio del catálogo (rentabilidad por servicio); vacío = «Sin servicio»
};

export type MovRecibida = {
  fecha: string;          // AAAA-MM-DD
  base: number | null;    // null = la lectura no dio la base
  iva: number | null;
  retencion: number;      // IRPF retenido al proveedor, en positivo (0 si no hay)
  total: number;          // importe a pagar: base + IVA − retención
  pagada: boolean;
  proveedor: string;
  ref?: string;
  concepto?: string;
};

export type Trimestre = 1 | 2 | 3 | 4;
export type Periodo = { anio: number; trimestre: 0 | Trimestre }; // 0 = año completo

export type ResumenIngresos = {
  base: number; iva: number; total: number; n: number;
  cobrado: number; pendiente: number;
  sinDesglose: number; sinDesgloseTotal: number; // importadas sin base/IVA: cuántas y cuánto
  cobroDesconocido: number;                      // importe cuyo cobro no consta
};
export type ResumenGastos = {
  base: number; iva: number; retenciones: number; total: number; n: number;
  pagado: number; pendiente: number;
  sinDesglose: number; sinDesgloseTotal: number;
};
export type Resumen = {
  ingresos: ResumenIngresos;
  gastos: ResumenGastos;
  resultado: number;      // base de ingresos − base de gastos
  margen: number | null;  // resultado / base de ingresos (null sin ingresos)
  ivaNeto: number;        // IVA repercutido − soportado: > 0 a ingresar, < 0 a compensar
};
export type Mes = {
  mes: number;            // 1-12
  ingresos: number;       // base
  ingresosSinDesglose: number; // total de las importadas sin desglose (se pinta aparte)
  gastos: number;         // base
  gastosSinDesglose: number;
  resultado: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  nEmitidas: number;
  nRecibidas: number;
};
export type TrimestreResumen = Resumen & { trimestre: Trimestre };
export type ServicioRentable = { servicio: string; n: number; base: number; total: number; ticket: number | null; cuota: number };
export type Rentabilidad = {
  margen: number | null;             // resultado / ingresos (null sin ingresos)
  cobertura: number | null;          // ingresos / gastos: cuántas veces cubren los ingresos los gastos
  meses: number;                     // meses del periodo ya empezados (≥ 1)
  ingresoMedioMensual: number;
  gastoMedioMensual: number;         // = punto de equilibrio: lo que hay que facturar al mes
  ticketMedio: number | null;        // ingreso medio por factura (con desglose)
  clientes: number;                  // clientes distintos del periodo
  ingresoMedioCliente: number | null;
  porServicio: ServicioRentable[];   // de más a menos ingresos
  margenMensual: (number | null)[];  // 12 meses del año; null = sin ingresos ese mes
  sinGastos: boolean;                // sin gastos registrados: el margen del 100 % no dice nada
};
export type Ranking = { nombre: string; base: number; total: number; n: number; cuota: number };
export type Estadisticas = {
  periodo: Periodo;
  resumen: Resumen;
  anterior: Resumen | null; // mismo periodo del año anterior; null si no hubo nada
  meses: Mes[];             // los 12 meses del año elegido (la curva da el contexto)
  trimestres: TrimestreResumen[];
  topClientes: Ranking[];
  topProveedores: Ranking[];
  fuentes: { aproba: number; anteriores: number; recibidas: number };
  anios: number[];          // años con datos (más el elegido), del más reciente al más antiguo
  rentabilidad: Rentabilidad;
};

export const MESES_CORTOS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Céntimos: sumar cientos de importes en coma flotante deja restos de 0,01 € a la vista.
const c = (n: number | null | undefined) => Math.round((Number(n) || 0) * 100);
const eu = (cents: number) => cents / 100;

const FECHA = /^\d{4}-\d{2}-\d{2}/;
export const fechaValida = (f: string | null | undefined): f is string => Boolean(f && FECHA.test(f));
const anioDe = (f: string) => Number(f.slice(0, 4));
const mesDe = (f: string) => Number(f.slice(5, 7));
export const trimestreDe = (mes: number): Trimestre => (Math.floor((mes - 1) / 3) + 1) as Trimestre;

export function enPeriodo(fecha: string, p: Periodo): boolean {
  if (!fechaValida(fecha) || anioDe(fecha) !== p.anio) return false;
  return p.trimestre === 0 || trimestreDe(mesDe(fecha)) === p.trimestre;
}

export function resumir(emitidas: MovEmitida[], recibidas: MovRecibida[]): Resumen {
  let iBase = 0, iIva = 0, iTotal = 0, iCobrado = 0, iPend = 0, iSinTot = 0, iDesc = 0, iSin = 0;
  for (const m of emitidas) {
    const total = c(m.total);
    iTotal += total;
    if (m.base == null) { iSin++; iSinTot += total; } else { iBase += c(m.base); iIva += c(m.iva); }
    if (m.cobrado == null) iDesc += total;
    else { const cob = c(m.cobrado); iCobrado += cob; iPend += total - cob; }
  }
  let gBase = 0, gIva = 0, gRet = 0, gTotal = 0, gPag = 0, gPend = 0, gSinTot = 0, gSin = 0;
  for (const m of recibidas) {
    const total = c(m.total);
    gTotal += total; gRet += c(m.retencion);
    if (m.base == null) { gSin++; gSinTot += total; } else { gBase += c(m.base); gIva += c(m.iva); }
    if (m.pagada) gPag += total; else gPend += total;
  }
  const resultado = iBase - gBase;
  return {
    ingresos: { base: eu(iBase), iva: eu(iIva), total: eu(iTotal), n: emitidas.length, cobrado: eu(iCobrado), pendiente: eu(iPend), sinDesglose: iSin, sinDesgloseTotal: eu(iSinTot), cobroDesconocido: eu(iDesc) },
    gastos: { base: eu(gBase), iva: eu(gIva), retenciones: eu(gRet), total: eu(gTotal), n: recibidas.length, pagado: eu(gPag), pendiente: eu(gPend), sinDesglose: gSin, sinDesgloseTotal: eu(gSinTot) },
    resultado: eu(resultado),
    margen: iBase > 0 ? Math.round((resultado / iBase) * 1000) / 1000 : null,
    ivaNeto: eu(iIva - gIva),
  };
}

// Clave de agrupación: mayúsculas, sin acentos ni espacios dobles («Hervás Abogados» y
// «HERVAS ABOGADOS» son el mismo cliente). Se enseña el primer nombre visto.
const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

function ranking<T>(items: T[], nombre: (x: T) => string, base: (x: T) => number | null, total: (x: T) => number, top: number): Ranking[] {
  const g = new Map<string, { nombre: string; base: number; total: number; n: number }>();
  let suma = 0;
  for (const x of items) {
    const nom = nombre(x).trim() || "Sin nombre";
    const k = clave(nom);
    const r = g.get(k) ?? { nombre: nom, base: 0, total: 0, n: 0 };
    r.base += c(base(x)); r.total += c(total(x)); r.n++;
    suma += c(total(x));
    g.set(k, r);
  }
  return [...g.values()]
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, top)
    .map((r) => ({ nombre: r.nombre, base: eu(r.base), total: eu(r.total), n: r.n, cuota: suma > 0 ? Math.round((r.total / suma) * 1000) / 1000 : 0 }));
}

// `hoy` (AAAA-MM-DD): si el periodo elegido está en curso, la comparación con el año
// anterior se corta en la misma fecha — nueve meses de este año contra doce del anterior
// daban un «−33 %» que no era verdad.
export function calcularEstadisticas(emitidas: MovEmitida[], recibidas: MovRecibida[], periodo: Periodo, opts: { top?: number; hoy?: string } = {}): Estadisticas {
  const top = opts.top ?? 8;
  const em = emitidas.filter((m) => fechaValida(m.fecha));
  const re = recibidas.filter((m) => fechaValida(m.fecha));
  const emP = em.filter((m) => enPeriodo(m.fecha, periodo));
  const reP = re.filter((m) => enPeriodo(m.fecha, periodo));

  const previo: Periodo = { anio: periodo.anio - 1, trimestre: periodo.trimestre };
  const hoy = opts.hoy && fechaValida(opts.hoy) ? opts.hoy : null;
  const enCurso = hoy != null && anioDe(hoy) === periodo.anio;
  const hastaHoy = (m: { fecha: string }) => !enCurso || m.fecha.slice(5, 10) <= (hoy as string).slice(5, 10);
  const emA = em.filter((m) => enPeriodo(m.fecha, previo) && hastaHoy(m));
  const reA = re.filter((m) => enPeriodo(m.fecha, previo) && hastaHoy(m));

  const delAnio = (m: { fecha: string }) => anioDe(m.fecha) === periodo.anio;
  const emY = em.filter(delAnio);
  const reY = re.filter(delAnio);
  const meses: Mes[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const r = resumir(emY.filter((m) => mesDe(m.fecha) === mes), reY.filter((m) => mesDe(m.fecha) === mes));
    return {
      mes,
      ingresos: r.ingresos.base, ingresosSinDesglose: r.ingresos.sinDesgloseTotal,
      gastos: r.gastos.base, gastosSinDesglose: r.gastos.sinDesgloseTotal,
      resultado: r.resultado, ivaRepercutido: r.ingresos.iva, ivaSoportado: r.gastos.iva,
      nEmitidas: r.ingresos.n, nRecibidas: r.gastos.n,
    };
  });
  const trimestres: TrimestreResumen[] = ([1, 2, 3, 4] as Trimestre[]).map((t) => ({
    trimestre: t,
    ...resumir(emY.filter((m) => trimestreDe(mesDe(m.fecha)) === t), reY.filter((m) => trimestreDe(mesDe(m.fecha)) === t)),
  }));

  const anios = [...new Set([...em.map((m) => anioDe(m.fecha)), ...re.map((m) => anioDe(m.fecha)), periodo.anio])].sort((a, b) => b - a);
  const resumen = resumir(emP, reP);

  return {
    periodo,
    resumen,
    anterior: emA.length || reA.length ? resumir(emA, reA) : null,
    meses,
    trimestres,
    topClientes: ranking(emP, (m) => m.cliente, (m) => m.base, (m) => m.total, top),
    topProveedores: ranking(reP, (m) => m.proveedor, (m) => m.base, (m) => m.total, top),
    fuentes: {
      aproba: emP.filter((m) => m.fuente === "APROBA").length,
      anteriores: emP.filter((m) => m.fuente === "ANTERIOR").length,
      recibidas: reP.length,
    },
    anios,
    rentabilidad: calcularRentabilidad(emP, resumen, meses, mesesTranscurridos(periodo, hoy)),
  };
}

// Meses del periodo ya empezados: un año en curso a 25/09 lleva 9 meses, no 12 (si no, el
// gasto medio mensual — el punto de equilibrio — saldría un 25 % más bajo de la cuenta).
export function mesesTranscurridos(p: Periodo, hoy: string | null): number {
  const total = p.trimestre === 0 ? 12 : 3;
  if (!hoy || !fechaValida(hoy) || anioDe(hoy) > p.anio) return total; // periodo pasado: entero
  if (anioDe(hoy) < p.anio) return 1;                                  // periodo futuro
  const primero = p.trimestre === 0 ? 1 : (p.trimestre - 1) * 3 + 1;
  return Math.max(1, Math.min(total, mesDe(hoy) - primero + 1));
}

function calcularRentabilidad(emP: MovEmitida[], r: Resumen, meses: Mes[], nMeses: number): Rentabilidad {
  const conDesglose = emP.filter((m) => m.base != null);
  const clientes = new Set(emP.map((m) => clave(m.cliente || "Sin nombre"))).size;
  const g = new Map<string, { servicio: string; n: number; nBase: number; base: number; total: number }>();
  for (const m of emP) {
    const nom = (m.servicio ?? "").trim() || "Sin servicio";
    const k = clave(nom);
    const x = g.get(k) ?? { servicio: nom, n: 0, nBase: 0, base: 0, total: 0 };
    x.n++; x.total += c(m.total);
    if (m.base != null) { x.nBase++; x.base += c(m.base); }
    g.set(k, x);
  }
  const baseTotal = c(r.ingresos.base);
  const porServicio = [...g.values()]
    .sort((a, b) => b.base - a.base || b.total - a.total || a.servicio.localeCompare(b.servicio, "es"))
    .map((x) => ({
      servicio: x.servicio, n: x.n, base: eu(x.base), total: eu(x.total),
      ticket: x.nBase ? Math.round(x.base / x.nBase) / 100 : null,
      cuota: baseTotal > 0 ? Math.round((x.base / baseTotal) * 1000) / 1000 : 0,
    }));
  const sinGastos = r.gastos.n === 0;
  return {
    margen: sinGastos ? null : r.margen,
    cobertura: r.gastos.base > 0 ? Math.round((r.ingresos.base / r.gastos.base) * 100) / 100 : null,
    meses: nMeses,
    ingresoMedioMensual: Math.round((r.ingresos.base / nMeses) * 100) / 100,
    gastoMedioMensual: Math.round((r.gastos.base / nMeses) * 100) / 100,
    ticketMedio: conDesglose.length ? Math.round(c(r.ingresos.base) / conDesglose.length) / 100 : null,
    clientes,
    ingresoMedioCliente: clientes ? Math.round(c(r.ingresos.base) / clientes) / 100 : null,
    porServicio,
    margenMensual: meses.map((m) => (m.ingresos > 0 ? Math.round((m.resultado / m.ingresos) * 1000) / 1000 : null)),
    sinGastos,
  };
}

// Variación frente al año anterior, en tanto por uno (null si no hay base de comparación).
export function variacion(actual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 1000;
}

// Periodo desde la URL: año de 4 cifras razonable y trimestre 1-4 (0 o ausente = año).
export function periodoDeParams(anio: string | null | undefined, trimestre: string | null | undefined, anioActual: number): Periodo {
  const a = Number(anio);
  const t = Number(trimestre);
  return {
    anio: Number.isInteger(a) && a >= 2000 && a <= anioActual + 1 ? a : anioActual,
    trimestre: t === 1 || t === 2 || t === 3 || t === 4 ? t : 0,
  };
}

// «Año 2026» · «2.º trimestre 2026 (abr-jun)» — para el informe y el nombre de los ficheros.
export function nombrePeriodo(p: Periodo): string {
  if (p.trimestre === 0) return `Año ${p.anio}`;
  const m0 = (p.trimestre - 1) * 3;
  return `${p.trimestre}.º trimestre ${p.anio} (${MESES_CORTOS_ES[m0]}-${MESES_CORTOS_ES[m0 + 2]})`;
}
export const slugPeriodo = (p: Periodo) => (p.trimestre === 0 ? `${p.anio}` : `${p.anio}-T${p.trimestre}`);

// Formatos cortos para ejes y tarjetas: «12,5 k€», «800 €», «34,2 %».
export function eurCorto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(".", ",")} k€`;
  return `${Math.round(n)} €`;
}
export const pct = (x: number, decimales = 1) => `${(x * 100).toFixed(decimales).replace(".", ",")} %`;

// Último mes del año con algún movimiento (la curva no cae a cero en los meses por venir).
export const ultimoMesConDatos = (meses: Mes[]) =>
  meses.reduce((u, m) => (m.nEmitidas + m.nRecibidas > 0 ? m.mes : u), 0);

// Escala «bonita» para un eje: pasos de 1, 2, 2,5 o 5 × 10^k.
export function escalaEje(min: number, max: number, n = 4): { desde: number; hasta: number; ticks: number[] } {
  if (!(max > min)) max = min + 1;
  const bruto = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= bruto - 1e-9) ?? 10 * mag;
  const desde = Math.floor(min / paso + 1e-9) * paso;
  const hasta = Math.ceil(max / paso - 1e-9) * paso;
  const ticks: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) ticks.push(Math.round(v * 100) / 100);
  return { desde, hasta, ticks };
}

// ── Geometría de los gráficos (pantalla y PDF) ──────────────────────────────────────────
// Curva monótona (Fritsch-Carlson): suave, pero sin sobrepasar los puntos.
export type Punto = [number, number];
type P = Punto;
type Tramo = { x0: number; y0: number; c1x: number; c1y: number; c2x: number; c2y: number; x1: number; y1: number };
export function tramos(pts: P[]): Tramo[] {
  const n = pts.length;
  if (n < 2) return [];
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1)); }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return pts.slice(0, -1).map(([x0, y0], i) => {
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    return { x0, y0, c1x: x0 + h, c1y: y0 + t[i] * h, c2x: x1 - h, c2y: y1 - t[i + 1] * h, x1, y1 };
  });
}
export const curva = (pts: P[]) => (pts.length ? `M${pts[0][0]},${pts[0][1]}` + tramos(pts).map((s) => ` C${s.c1x},${s.c1y} ${s.c2x},${s.c2y} ${s.x1},${s.y1}`).join("") : "");
export const curvaInversa = (pts: P[]) => tramos(pts).reverse().map((s) => ` C${s.c2x},${s.c2y} ${s.c1x},${s.c1y} ${s.x0},${s.y0}`).join("");
