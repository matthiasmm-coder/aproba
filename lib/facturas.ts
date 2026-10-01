// ANULADA: factura emitida que se deja sin efecto SIN borrarla (la numeración correlativa
// no se rompe). Existía de facto en la BD y en algún filtro, pero no en el tipo — la
// auditoría del 06/08 lo formalizó junto con la acción «anular».
export type FacturaEstado = "BORRADOR" | "EMITIDA" | "PAGADA" | "VENCIDA" | "ANULADA";

// Línea de honorarios (sujeta a IVA) y suplido (gasto a cuenta del cliente, SIN IVA y
// fuera de la base imponible — p.ej. la tasa 790). Facturas personalizables (Pro/Business).
export type LineaFactura = { concepto: string; base: number };
export type Suplido = { concepto: string; importe: number };

// Datos fiscales del cliente CONGELADOS al emitir (pedido de Juan): documento de
// identidad y dirección. Snapshot, no join vivo — una factura emitida no debe cambiar
// cuando el cliente se muda, y VeriFactu exigirá inmutabilidad.
export type ClienteDatosFactura = { documento?: string; direccion?: string };

export function datosFiscalesDeCliente(c: {
  numeroDocumento?: string | null; pasaporte?: string | null;
  via?: string | null; numeroVia?: string | null; piso?: string | null;
  codigoPostal?: string | null; municipio?: string | null; provincia?: string | null;
} | null | undefined): ClienteDatosFactura | null {
  if (!c) return null;
  const t = (v: unknown) => String(v ?? "").trim();
  // El NIE/DNI es el identificador fiscal en España; el pasaporte solo si no hay otro.
  const documento = t(c.numeroDocumento) ? `NIE/DNI ${t(c.numeroDocumento)}` : t(c.pasaporte) ? `Pasaporte ${t(c.pasaporte)}` : "";
  const calle = [t(c.via), t(c.numeroVia), t(c.piso)].filter(Boolean).join(", ");
  const prov = t(c.provincia) && t(c.provincia).toLowerCase() !== t(c.municipio).toLowerCase() ? ` (${t(c.provincia)})` : "";
  const localidad = [t(c.codigoPostal), t(c.municipio)].filter(Boolean).join(" ") + prov;
  const direccion = [calle, localidad.trim()].filter(Boolean).join(" · ");
  if (!documento && !direccion) return null;
  return { ...(documento ? { documento } : {}), ...(direccion ? { direccion } : {}) };
}

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
  // Rectificativas: `rectificaId`/`rectificaNumero` = la factura que ESTA corrige;
  // `rectificadaPor` = la rectificativa que corrige a ESTA (null en una factura normal).
  metodoPago?: string | null; // con qué se cobró (avisa si fue tarjeta al deshacer)
  rectificaId?: string | null;
  rectificaNumero?: string | null;
  rectificadaPor?: { id: string; numero: string } | null;
  momento?: "ANTICIPO" | "FINAL" | null;
  lineas?: LineaFactura[]; // desglose de honorarios (si vacío → una sola línea: concepto/base)
  suplidos?: Suplido[]; // gastos sin IVA
  notas?: string | null;
  archivado?: boolean; // fuera de la lista de trabajo y de los cobros pendientes (sin borrar)
  clienteDatos?: ClienteDatosFactura | null; // snapshot al emitir (documento + dirección)
  expedienteId?: string | null; // para resolver la sede de facturas antiguas sin estampar
  oficinaId?: string | null;    // sede emisora (fase 6 multi-oficina)
  // Entregas a cuenta ya cobradas (pagos parciales). El SALDO no se guarda: se
  // calcula total - entregado allí donde se pinta. undefined = migración ausente.
  entregado?: number;
  // Importes GUARDADOS al emitir (columnas iva/total). Mandan sobre el cálculo: el total
  // incluye los suplidos, que totalDe(base) no ve.
  iva?: number;
  total?: number;
  // Retención de IRPF (profesional persona física → empresa o profesional). `total` NO la
  // resta: lo que el cliente paga es aCobrar(). null/undefined = sin retención.
  retencionPct?: number | null;
  retencion?: number | null;
  emisorDatos?: EmisorFijado | null; // emisor congelado al emitir (null = anterior: en vivo)
  // Factura SIMPLIFICADA (supabase/factura-simplificada.sql): sin datos fiscales del cliente,
  // hasta 400 € IVA incluido. undefined = completa (o migración ausente).
  simplificada?: boolean;
};

// Emisor CONGELADO al emitir (supabase/factura-retencion-emisor.sql): una factura emitida no
// cambia si después se editan los datos fiscales del despacho o de la oficina.
export type EmisorFijado = { nombre: string; nif: string | null; domicilio: string | null; email: string | null };

export const IVA = 0.21;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const ivaDe = (b: number) => r2(b * IVA);
export const totalDe = (b: number) => r2(b * (1 + IVA));

// ── Retención de IRPF en facturas EMITIDAS ─────────────────────────────────────
// La practica el cliente (empresa o profesional) cuando factura un profesional persona
// física: 15 % en general, 7 % los tres primeros años de actividad. Solo sobre la base de
// honorarios (los suplidos no llevan IVA ni retención) y NO se resta del `total`, que es el
// importe total de la factura (el que va a VeriFactu); lo que se cobra es aCobrar().
// Con signo de la base: en una rectificativa (base negativa) la retención también se niega.
export const TIPOS_RETENCION = [15, 7] as const;
export function retencionDe(base: number, pct: number | null | undefined): number {
  const p = Number(pct) || 0;
  if (p <= 0) return 0;
  return r2(Number(base || 0) * p / 100);
}
// Lo que el cliente paga de verdad: total − retención (igual al total si no hay retención).
export const aCobrar = (f: { total?: number | string | null; retencion?: number | string | null }): number =>
  r2(Number(f.total || 0) - Number(f.retencion || 0));
// Tipo de retención admitido: 0 < pct ≤ 50, con 2 decimales. null = sin retención.
export function pctRetencion(v: unknown): number | null {
  const n = r2(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
}

// Importes REALES de una factura: honorarios + IVA + suplidos (tasas, sin IVA). La lista,
// sus totales, la ficha del cliente y el CSV usaban totalDe(base) y se dejaban los
// suplidos (encontrado el 23/09/2026 al añadir el NIF al CSV que pidió Luis: 307,55 € de
// menos en la lista de Juan). Manda lo guardado al emitir; si falta, se calcula igual que
// totalesFactura.
export function importesFactura(f: Pick<Factura, "base" | "suplidos" | "iva" | "total"> & { retencion?: number | null }) {
  const base = r2(f.base);
  const iva = typeof f.iva === "number" && Number.isFinite(f.iva) ? r2(f.iva) : ivaDe(base);
  const deLista = r2((f.suplidos ?? []).reduce((a, s) => a + (Number(s.importe) || 0), 0));
  const retencion = r2(Number(f.retencion) || 0);
  if (typeof f.total === "number" && Number.isFinite(f.total)) {
    // Sin la lista de suplidos (fila antigua), lo que falta hasta el total guardado lo son.
    const suplidos = f.suplidos ? deLista : r2(f.total - base - iva);
    return { base, iva, suplidos, total: r2(f.total), retencion, aCobrar: r2(f.total - retencion) };
  }
  const total = r2(base + iva + deLista);
  return { base, iva, suplidos: deLista, total, retencion, aCobrar: r2(total - retencion) };
}

// Snapshot fiscal de una factura MANUAL («+ Nueva factura», 24/09/2026 — la 2026-0006 de
// Luis salió sin NIF: el formulario no lo pedía). El gestor escribe el documento tal cual;
// la etiqueta sale del formato, la misma que ponen los demás caminos: NIE/DNI y CIF
// españoles; cualquier otra cosa, pasaporte (el caso de un cliente extranjero sin NIE).
export function datosFiscalesManuales(documento: string | null | undefined, direccion: string | null | undefined): ClienteDatosFactura | null {
  const doc = nifDeDocumento(String(documento ?? "").replace(/^Pasaporte\s+/i, "")).toUpperCase().replace(/[\s.\-]/g, "").slice(0, 30);
  const dir = String(direccion ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  let etiquetado = "";
  if (doc) {
    if (/^[XYZ]\d{7}[A-Z]$/.test(doc) || /^\d{8}[A-Z]$/.test(doc)) etiquetado = `NIE/DNI ${doc}`;
    else if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(doc)) etiquetado = `CIF/NIF ${doc}`;
    else etiquetado = `Pasaporte ${doc}`;
  }
  if (!etiquetado && !dir) return null;
  return { ...(etiquetado ? { documento: etiquetado } : {}), ...(dir ? { direccion: dir } : {}) };
}

// El número sin etiqueta, para rellenar el campo del formulario al editar.
export const documentoSinEtiqueta = (documento: string | null | undefined) =>
  nifDeDocumento(String(documento ?? "")).replace(/^Pasaporte\s+/i, "");

// NIF/CIF tal como va impreso en la factura, sin la etiqueta del snapshot («NIE/DNI …»,
// «CIF/NIF …»). Un pasaporte conserva su etiqueta: no es un NIF y quien lleve la
// contabilidad debe verlo.
export function nifDeDocumento(documento: string | null | undefined): string {
  const d = String(documento ?? "").trim();
  return d.replace(/^(NIE\/DNI|CIF\/NIF|NIF\/CIF|NIE|DNI|NIF|CIF)\s+/i, "");
}

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

// ── FACTURA RECTIFICATIVA (RD 1619/2012, art. 15 — Luis, 21/09/2026) ─────────────────
// Una factura emitida no se borra (numeración correlativa, y con VERI*FACTU además
// registrada en la AEAT): se corrige con una rectificativa, que es un documento propio
// con su número en una SERIE ESPECÍFICA y que identifica a la factura rectificada.

// Serie de las rectificativas: «R-2026-0001», y «R-DG-2026-0001» si la oficina tiene su
// propio prefijo. El patrón `like` ancla el principio, así que «2026-%» nunca atrapa una
// rectificativa y las dos series corren independientes sin columna nueva.
export const PREFIJO_RECTIFICATIVA = "R";
export function prefijoRectificativa(prefijoOficina = ""): string {
  const p = String(prefijoOficina ?? "").trim();
  return p ? `${PREFIJO_RECTIFICATIVA}-${p}` : PREFIJO_RECTIFICATIVA;
}
export const esNumeroRectificativa = (numero: string): boolean =>
  new RegExp(`^${PREFIJO_RECTIFICATIVA}-`).test(String(numero ?? "").trim());

// Rectificación POR DIFERENCIA (la de uso corriente): la rectificativa lleva el negativo
// de lo que se rectifica, de modo que original + rectificativa suman cero. Los suplidos
// se niegan igual (van sin IVA y fuera de la base, aquí solo cambian de signo).
export function importesRectificativa(f: {
  baseImponible: number; iva: number; total: number; retencion?: number | null;
  lineas?: LineaFactura[] | null; suplidos?: Suplido[] | null;
}): { baseImponible: number; iva: number; total: number; retencion: number | null; lineas: LineaFactura[] | null; suplidos: Suplido[] | null } {
  const neg = (n: unknown) => r2(-Math.abs(Number(n) || 0));
  const ls = Array.isArray(f.lineas) ? f.lineas.filter((l) => l && l.concepto) : [];
  const ss = Array.isArray(f.suplidos) ? f.suplidos.filter((s) => s && s.concepto) : [];
  return {
    baseImponible: neg(f.baseImponible), iva: neg(f.iva), total: neg(f.total),
    retencion: Number(f.retencion) ? neg(f.retencion) : null,
    lineas: ls.length ? ls.map((l) => ({ concepto: l.concepto, base: neg(l.base) })) : null,
    suplidos: ss.length ? ss.map((s) => ({ concepto: s.concepto, importe: neg(s.importe) })) : null,
  };
}

// Concepto de la rectificativa: dice SIEMPRE a qué factura rectifica (exigido), y el
// motivo del gestor cuando lo escribe.
export function conceptoRectificativa(numeroOriginal: string, motivo?: string | null): string {
  const m = String(motivo ?? "").trim();
  return `Rectificativa de la factura ${numeroOriginal}${m ? ` — ${m}` : ""}`.slice(0, 300);
}

// ── FACTURA SIMPLIFICADA (RD 1619/2012, arts. 4 y 7 — Juan, 29/09/2026) ──────────────
// El antiguo «ticket»: hasta 400 € IVA incluido (art. 4.1.a), sin los datos del cliente.
// Basta número, fecha, el emisor, el servicio, el tipo de IVA («IVA incluido») y el total.
// Su serie es la «S» (S-2026-0001, S-DG-2026-0001 con oficina), como la «R» de las
// rectificativas; la columna Factura.simplificada dice además lo que es (el modo avanzado
// deja escribir cualquier número).
export const LIMITE_SIMPLIFICADA = 400; // € IVA incluido
export const PREFIJO_SIMPLIFICADA = "S";
export function prefijoSimplificada(prefijoOficina = ""): string {
  const p = String(prefijoOficina ?? "").trim();
  return p ? `${PREFIJO_SIMPLIFICADA}-${p}` : PREFIJO_SIMPLIFICADA;
}

// Por qué una factura NO puede ser simplificada (null = puede). La retención exige
// identificar al pagador (empresa o profesional): eso es una factura completa.
export function motivoNoSimplificada(total: number, retencionPct?: number | null): string | null {
  if (total > LIMITE_SIMPLIFICADA) return `Una factura simplificada no puede superar ${LIMITE_SIMPLIFICADA} € IVA incluido: para más, emite una factura completa.`;
  if (retencionPct) return "Una factura simplificada no lleva retención de IRPF: para retener, el pagador tiene que estar identificado (factura completa).";
  return null;
}

// Título del documento. Una rectificativa DEBE decirlo (art. 15); una simplificada también.
export function tituloFactura(f: { simplificada?: boolean | null; rectificaId?: string | null; rectificaNumero?: string | null }): string {
  const rect = Boolean(f.rectificaId ?? f.rectificaNumero);
  if (f.simplificada) return rect ? "Factura rectificativa simplificada" : "Factura simplificada";
  return rect ? "Factura rectificativa" : "Factura";
}

export const FACTURA_ESTADO_META: Record<FacturaEstado, { label: string; pill: string }> = {
  BORRADOR: { label: "Borrador", pill: "bg-slate-100 text-slate-500" },
  EMITIDA: { label: "Emitida", pill: "bg-amber-100 text-amber-700" },
  PAGADA: { label: "Pagada", pill: "bg-aproba-100 text-aproba-700" },
  VENCIDA: { label: "Vencida", pill: "bg-red-100 text-red-700" },
  ANULADA: { label: "Anulada", pill: "bg-slate-100 text-slate-400 line-through" },
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
