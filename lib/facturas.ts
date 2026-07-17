export type FacturaEstado = "BORRADOR" | "EMITIDA" | "PAGADA" | "VENCIDA";

// Línea de honorarios (sujeta a IVA) y suplido (gasto a cuenta del cliente, SIN IVA y
// fuera de la base imponible — p.ej. la tasa 790). Facturas personalizables (Pro/Business).
export type LineaFactura = { concepto: string; base: number };
export type Suplido = { concepto: string; importe: number };

export type Factura = {
  id: string;
  numero: string;
  cliente: string;
  concepto: string;
  base: number; // base imponible (= suma de las líneas)
  estado: FacturaEstado;
  fecha: string; // dd/mm/aaaa
  vence?: string;
  origen?: "MANUAL" | "AUTOMATICA"; // AUTOMATICA = pago del cliente en plataforma
  momento?: "ANTICIPO" | "FINAL" | null;
  lineas?: LineaFactura[]; // desglose de honorarios (si vacío → una sola línea: concepto/base)
  suplidos?: Suplido[]; // gastos sin IVA
  notas?: string | null;
  archivado?: boolean; // fuera de la lista de trabajo y de los cobros pendientes (sin borrar)
};

export const IVA = 0.21;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const ivaDe = (b: number) => r2(b * IVA);
export const totalDe = (b: number) => r2(b * (1 + IVA));

// Totales de una factura con líneas + suplidos. base e iva solo sobre honorarios; los
// suplidos se suman al total pero NO llevan IVA ni entran en la base imponible.
export function totalesFactura(lineas: LineaFactura[], suplidos: Suplido[] = []) {
  const base = r2(lineas.reduce((a, l) => a + (Number(l.base) || 0), 0));
  const iva = ivaDe(base);
  const suplidosTotal = r2(suplidos.reduce((a, s) => a + (Number(s.importe) || 0), 0));
  return { base, iva, suplidosTotal, total: r2(base + iva + suplidosTotal) };
}

// Honorarios del ANTICIPO ya COBRADOS (base imponible: sin IVA y sin suplidos), o null
// si todavía no hay ninguno pagado. Decide el pago final cuando hay descuento: una
// factura PAGADA no se reescribe nunca, así que el descuento que le tocaba al anticipo
// solo puede caer en el final (ver restoPendiente en lib/multi-servicio).
// Definición ÚNICA para la ficha, /api/pagos y la factura familiar — si divergen, el
// gestor cobra un importe distinto del que promete el portal.
export function anticipoPagado(
  facturas: { momento: string | null; estado: string; baseImponible: number | string | null }[],
): number | null {
  const pagadas = facturas.filter((f) => f.momento === "ANTICIPO" && f.estado === "PAGADA");
  if (!pagadas.length) return null;
  const base = r2(pagadas.reduce((a, f) => a + (Number(f.baseImponible) || 0), 0));
  // Un anticipo cobrado a 0 € no existe (base > 0 en las 3 vías de emisión): si apareciera,
  // devolver 0 haría que restoPendiente tratara «pagado 0» como pago real y cobrara de más.
  return base > 0 ? base : null;
}

// Honorarios YA cobrados del expediente, en cualquier plazo: anticipo, pago final y las
// CUOTAS del fraccionamiento. Sirve para detectar la única situación que ninguna factura
// puede arreglar: que el cliente ya haya pagado MÁS que el total rebajado (→ devolución).
// Las facturas manuales (momento null) quedan fuera a propósito: pueden ser de cualquier
// concepto y contarlas inventaría devoluciones que no existen.
const MOMENTO_HONORARIOS = /^(ANTICIPO|FINAL|CUOTA_\d+)$/;
export function honorariosCobrados(
  facturas: { momento: string | null; estado: string; baseImponible: number | string | null }[],
): number {
  return r2(facturas
    .filter((f) => f.estado === "PAGADA" && MOMENTO_HONORARIOS.test(f.momento ?? ""))
    .reduce((a, f) => a + (Number(f.baseImponible) || 0), 0));
}

// ¿El resto se está cobrando fraccionado? Las cuotas se emiten en el momento de fraccionar
// y NADIE las realinea después: un descuento posterior no las toca (aviso explícito).
export function tieneCuotas(facturas: { momento: string | null; estado: string }[]): boolean {
  return facturas.some((f) => /^CUOTA_\d+$/.test(f.momento ?? "") && f.estado !== "ANULADA");
}

// Format monétaire espagnol : 4356.5 → "4.356,50 €"
export function eur(n: number): string {
  const [int, dec] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

export const FACTURA_ESTADO_META: Record<FacturaEstado, { label: string; pill: string }> = {
  BORRADOR: { label: "Borrador", pill: "bg-slate-100 text-slate-500" },
  EMITIDA: { label: "Emitida", pill: "bg-amber-100 text-amber-700" },
  PAGADA: { label: "Pagada", pill: "bg-aproba-100 text-aproba-700" },
  VENCIDA: { label: "Vencida", pill: "bg-red-100 text-red-700" },
};

export const FACTURAS: Factura[] = [
  { id: "fa-48", numero: "2026-0048", cliente: "Julia Mendoza", concepto: "Tramitación arraigo social", base: 350, estado: "EMITIDA", fecha: "09/06/2026", vence: "09/07/2026" },
  { id: "fa-47", numero: "2026-0047", cliente: "Liu Wei", concepto: "Reagrupación familiar", base: 420, estado: "EMITIDA", fecha: "06/06/2026", vence: "06/07/2026" },
  { id: "fa-46", numero: "2026-0046", cliente: "Aïcha Diallo", concepto: "Tramitación arraigo laboral", base: 350, estado: "PAGADA", fecha: "03/06/2026" },
  { id: "fa-45", numero: "2026-0045", cliente: "Karim Benali", concepto: "Renovación TIE", base: 180, estado: "EMITIDA", fecha: "01/06/2026", vence: "01/07/2026" },
  { id: "fa-44", numero: "2026-0044", cliente: "Oksana Koval", concepto: "Solicitud de nacionalidad", base: 600, estado: "PAGADA", fecha: "28/05/2026" },
  { id: "fa-43", numero: "2026-0043", cliente: "Fatima El Amrani", concepto: "Renovación TIE", base: 180, estado: "VENCIDA", fecha: "02/05/2026", vence: "01/06/2026" },
  { id: "fa-42", numero: "2026-0042", cliente: "Andrés Patiño", concepto: "Tramitación arraigo social", base: 350, estado: "PAGADA", fecha: "27/05/2026" },
  { id: "fa-41", numero: "2026-0041", cliente: "Mohammed Khan", concepto: "Reagrupación familiar", base: 420, estado: "EMITIDA", fecha: "26/05/2026", vence: "25/06/2026" },
  { id: "fa-40", numero: "2026-0040", cliente: "Ioana Popescu", concepto: "Asesoramiento extranjería", base: 90, estado: "PAGADA", fecha: "24/05/2026" },
  { id: "fa-39", numero: "2026-0039", cliente: "Carlos Mendoza", concepto: "Tramitación arraigo social", base: 350, estado: "PAGADA", fecha: "22/05/2026" },
  { id: "fa-38", numero: "2026-0038", cliente: "Rosa Chávez", concepto: "Renovación TIE", base: 180, estado: "VENCIDA", fecha: "28/04/2026", vence: "28/05/2026" },
  { id: "fa-37", numero: "2026-0037", cliente: "María Fernández", concepto: "Solicitud de nacionalidad", base: 600, estado: "PAGADA", fecha: "20/05/2026" },
  { id: "fa-36", numero: "2026-0036", cliente: "Pedro Sousa", concepto: "Asesoramiento extranjería", base: 120, estado: "BORRADOR", fecha: "18/05/2026" },
  { id: "fa-35", numero: "2026-0035", cliente: "Camila Restrepo", concepto: "Tramitación arraigo social", base: 350, estado: "PAGADA", fecha: "15/05/2026" },
];

export function getFactura(id: string): Factura | undefined {
  return FACTURAS.find((f) => f.id === id);
}

export function parseFecha(f: string): Date {
  const [d, m, y] = f.split("/").map(Number);
  return new Date(y, m - 1, d);
}

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fmtFecha(d: Date): string {
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

export const CONCEPTOS = [
  "Tramitación arraigo social",
  "Tramitación arraigo laboral",
  "Renovación TIE",
  "Reagrupación familiar",
  "Solicitud de nacionalidad",
  "Asesoramiento extranjería",
];
