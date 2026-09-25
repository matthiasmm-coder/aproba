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
};

export const MESES_CORTOS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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

  return {
    periodo,
    resumen: resumir(emP, reP),
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
