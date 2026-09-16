// FACTURAS RECIBIDAS (proveedores) — módulo PURO, compartido cliente/servidor.
//
// Qué es: el archivo de las facturas que el despacho RECIBE (alquiler, software, colegio,
// tasas…), leídas por la IA y exportables junto a las emitidas. Qué NO es: contabilidad —
// aquí no hay libro de IVA, ni 303, ni asientos. Petición de Luis (Asenjo, 16/09/2026).
import { parseImporte } from "@/lib/importar";
import { normalizarFechaCsv } from "@/lib/csv-clientes";
import { MESES } from "@/lib/facturas";
import { ibanValido, limpiarIban } from "@/lib/sepa";

export type OrigenRecibida = "MANUAL" | "EMAIL";
export type EstadoRecibida = "PENDIENTE" | "PAGADA";

export type FacturaRecibida = {
  id: string;
  proveedorNombre: string;
  proveedorNif: string;
  proveedorIban: string;         // leído de la factura si es válido (mod 97); si no, ""
  numero: string;
  fecha: string;                 // AAAA-MM-DD o "" si no se leyó
  baseImponible: number | null;
  tipoIva: number | null;        // porcentaje
  cuotaIva: number | null;
  total: number | null;
  concepto: string;
  notas: string;
  expedienteId: string | null;
  oficinaId: string | null;
  archivoNombre: string;
  archivoMime: string;
  archivoSize: number | null;
  origen: OrigenRecibida;
  estado: EstadoRecibida;        // pago al proveedor: pendiente o pagada
  fechaPago: string;             // AAAA-MM-DD o ""
  ordenPago: string;             // MsgId del fichero SEPA que la incluyó, o ""
  revisar: boolean;
  confianza: number | null;
  createdAt: string;
};

export type CamposFacturaRecibida = Pick<FacturaRecibida,
  "proveedorNombre" | "proveedorNif" | "proveedorIban" | "numero" | "fecha" | "baseImponible" | "tipoIva" | "cuotaIva" | "total" | "concepto" | "notas" | "expedienteId" | "estado" | "fechaPago">;

export const MAX_ARCHIVO_RECIBIDA = 8 * 1024 * 1024;
export const MIMES_RECIBIDA = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export const MAX_SUBIDA_RECIBIDAS = 10; // archivos por subida (una lectura IA cada uno)

// Lo que devuelve el modelo (claves en snake_case, tal cual el prompt).
export type ExtraccionFacturaCruda = {
  es_factura?: boolean | null;
  proveedor_nombre?: string | null;
  proveedor_nif?: string | null;
  proveedor_iban?: string | null;
  numero?: string | null;
  fecha?: string | null;
  base_imponible?: number | string | null;
  tipo_iva?: number | string | null;
  cuota_iva?: number | string | null;
  total?: number | string | null;
  concepto?: string | null;
  moneda?: string | null;
  confianza?: number | null;
  legible?: boolean | null;
};

export type FacturaLeida = { esFactura: boolean; confianza: number; campos: CamposFacturaRecibida; revisar: boolean; avisos: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? r2(v) : null;
  if (typeof v === "string" && v.trim()) return parseImporte(v);
  return null;
};
const txt = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const TIPOS_IVA = [21, 10, 4, 0];

export const limpiarNif = (v: string): string => v.toUpperCase().replace(/[\s.\-]/g, "").slice(0, 20);

export const CAMPOS_VACIOS: CamposFacturaRecibida = {
  proveedorNombre: "", proveedorNif: "", proveedorIban: "", numero: "", fecha: "", baseImponible: null, tipoIva: null, cuotaIva: null, total: null, concepto: "", notas: "", expedienteId: null, estado: "PENDIENTE", fechaPago: "",
};

// Del JSON del modelo a campos coherentes: importes en número, fecha ISO, NIF limpio, y
// los tres importes se completan entre sí (base + cuota = total) cuando falta uno. Lo que
// no cuadra o no se leyó marca «revisar»: la factura se archiva igual, el gestor la confirma.
export function normalizarFacturaLeida(cruda: ExtraccionFacturaCruda | null | undefined): FacturaLeida {
  const c = cruda ?? {};
  const esFactura = c.es_factura === true;
  const confianza = Math.max(0, Math.min(1, typeof c.confianza === "number" ? c.confianza : 0));
  const avisos: string[] = [];
  let base = num(c.base_imponible), tipo = num(c.tipo_iva), cuota = num(c.cuota_iva), total = num(c.total);
  if (tipo !== null && tipo > 100) tipo = null;
  if (base !== null && cuota === null && tipo !== null) cuota = r2(base * tipo / 100);
  if (total === null && base !== null) total = r2(base + (cuota ?? 0));
  if (base === null && total !== null && tipo !== null) { base = r2(total / (1 + tipo / 100)); cuota = r2(total - base); }
  if (cuota === null && base !== null && total !== null) cuota = r2(total - base);
  if (tipo === null && base && cuota !== null && base > 0) { const p = Math.round(cuota / base * 100); if (TIPOS_IVA.includes(p)) tipo = p; }
  if (base !== null && cuota !== null && total !== null && Math.abs(base + cuota - total) > 0.05) avisos.push("Los importes no cuadran (base + IVA ≠ total)");
  const fecha = normalizarFechaCsv(txt(c.fecha, 20));
  if (c.fecha && !fecha) avisos.push("Fecha no reconocida");
  const moneda = txt(c.moneda, 5).toUpperCase();
  if (moneda && moneda !== "EUR" && moneda !== "€") avisos.push(`Moneda ${moneda}: importe sin convertir`);
  // IBAN: solo se guarda si pasa el mod 97 (una cifra mal leída haría una transferencia a
  // otra cuenta); si no, aviso y el gestor lo teclea.
  const ibanLeido = limpiarIban(txt(c.proveedor_iban, 40));
  const proveedorIban = ibanLeido && ibanValido(ibanLeido) ? ibanLeido : "";
  if (ibanLeido && !proveedorIban) avisos.push(`IBAN leído no válido: ${ibanLeido}`);
  const campos: CamposFacturaRecibida = {
    proveedorNombre: txt(c.proveedor_nombre, 160),
    proveedorNif: limpiarNif(txt(c.proveedor_nif, 30)),
    proveedorIban,
    numero: txt(c.numero, 60),
    fecha,
    baseImponible: base, tipoIva: tipo, cuotaIva: cuota, total,
    concepto: txt(c.concepto, 240),
    notas: "",
    expedienteId: null,
    estado: "PENDIENTE",
    fechaPago: "",
  };
  if (!esFactura) avisos.unshift("No parece una factura");
  if (!campos.proveedorNombre) avisos.push("Proveedor no leído");
  if (total === null) avisos.push("Total no leído");
  if (!fecha) avisos.push("Fecha no leída");
  const revisar = !esFactura || confianza < 0.7 || total === null || !fecha || !campos.proveedorNombre || avisos.length > 0;
  return { esFactura, confianza, campos, revisar, avisos };
}

// Campos que llegan de un formulario (PATCH): mismas normalizaciones que la lectura IA.
export function normalizarCamposEditados(b: Partial<Record<keyof CamposFacturaRecibida, unknown>>): Partial<CamposFacturaRecibida> {
  const out: Partial<CamposFacturaRecibida> = {};
  if ("proveedorNombre" in b) out.proveedorNombre = txt(b.proveedorNombre, 160);
  if ("proveedorNif" in b) out.proveedorNif = limpiarNif(txt(b.proveedorNif, 30));
  if ("numero" in b) out.numero = txt(b.numero, 60);
  if ("concepto" in b) out.concepto = txt(b.concepto, 240);
  if ("notas" in b) out.notas = txt(b.notas, 2000);
  if ("fecha" in b) out.fecha = normalizarFechaCsv(txt(b.fecha, 20));
  for (const k of ["baseImponible", "tipoIva", "cuotaIva", "total"] as const) {
    if (k in b) { const v = b[k]; out[k] = v === "" || v === null || v === undefined ? null : num(v as number | string); }
  }
  if ("expedienteId" in b) out.expedienteId = typeof b.expedienteId === "string" && b.expedienteId.trim() ? b.expedienteId.trim() : null;
  if ("proveedorIban" in b) { const v = limpiarIban(txt(b.proveedorIban, 40)); out.proveedorIban = v && ibanValido(v) ? v : ""; }
  if ("estado" in b) out.estado = b.estado === "PAGADA" ? "PAGADA" : "PENDIENTE";
  if ("fechaPago" in b) out.fechaPago = normalizarFechaCsv(txt(b.fechaPago, 20));
  // Coherencia: pagada sin fecha → hoy; pendiente → sin fecha de pago.
  if (out.estado === "PAGADA" && !out.fechaPago) out.fechaPago = isoDeFecha(new Date());
  if (out.estado === "PENDIENTE") out.fechaPago = "";
  return out;
}

export const fechaCortaISO = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
export const isoDeFecha = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Periodo: por fecha de factura. Las que no tienen fecha se enseñan SIEMPRE (hay que
// revisarlas), en su propio grupo.
export function filtrarPeriodo<T extends { fecha: string }>(items: T[], desdeISO: string, hastaISO: string): T[] {
  return items.filter((f) => !f.fecha || (f.fecha >= desdeISO && f.fecha <= hastaISO));
}

export type GrupoMes = { clave: string; etiqueta: string; items: FacturaRecibida[]; base: number; iva: number; total: number };

export function agruparPorMes(items: FacturaRecibida[]): GrupoMes[] {
  const ordenadas = [...items].sort((a, b) => (b.fecha || "9999").localeCompare(a.fecha || "9999") || b.createdAt.localeCompare(a.createdAt));
  const grupos = new Map<string, GrupoMes>();
  for (const f of ordenadas) {
    const clave = f.fecha ? f.fecha.slice(0, 7) : "sin-fecha";
    let g = grupos.get(clave);
    if (!g) {
      const m = /^(\d{4})-(\d{2})$/.exec(clave);
      g = { clave, etiqueta: m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : "Sin fecha", items: [], base: 0, iva: 0, total: 0 };
      grupos.set(clave, g);
    }
    g.items.push(f); g.base = r2(g.base + (f.baseImponible ?? 0)); g.iva = r2(g.iva + (f.cuotaIva ?? 0)); g.total = r2(g.total + (f.total ?? 0));
  }
  // «Sin fecha» primero (pendiente de revisar), luego los meses del más reciente al más antiguo.
  return [...grupos.values()].sort((a, b) => (a.clave === "sin-fecha" ? -1 : b.clave === "sin-fecha" ? 1 : b.clave.localeCompare(a.clave)));
}

export function totalesDe(items: FacturaRecibida[]): { n: number; base: number; iva: number; total: number } {
  return items.reduce((s, f) => ({ n: s.n + 1, base: r2(s.base + (f.baseImponible ?? 0)), iva: r2(s.iva + (f.cuotaIva ?? 0)), total: r2(s.total + (f.total ?? 0)) }), { n: 0, base: 0, iva: 0, total: 0 });
}

// CSV para quien lleve la contabilidad: «;» como separador, decimales con coma, BOM para Excel.
export function csvFacturasRecibidas(items: FacturaRecibida[], referenciaDe?: (expedienteId: string) => string): string {
  const n = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["Fecha", "Proveedor", "NIF", "IBAN", "Número", "Concepto", "Base imponible", "IVA %", "Cuota IVA", "Total", "Estado", "Fecha de pago", "Expediente", "Origen", "Archivo", "Revisar"];
  const rows = items.map((f) => [
    f.fecha ? fechaCortaISO(f.fecha) : "", f.proveedorNombre, f.proveedorNif, f.proveedorIban, f.numero, f.concepto,
    n(f.baseImponible), f.tipoIva === null ? "" : String(f.tipoIva), n(f.cuotaIva), n(f.total),
    f.estado === "PAGADA" ? "Pagada" : "Pendiente", f.fechaPago ? fechaCortaISO(f.fechaPago) : "",
    f.expedienteId ? (referenciaDe?.(f.expedienteId) ?? f.expedienteId) : "", f.origen === "EMAIL" ? "Email" : "Subida", f.archivoNombre, f.revisar ? "sí" : "",
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
}

// Nombre de archivo dentro del ZIP: fecha_proveedor_numero.ext, seguro y único por id.
export function nombreEnZip(f: FacturaRecibida): string {
  const ext = /\.[a-z0-9]{2,5}$/i.exec(f.archivoNombre)?.[0]?.toLowerCase() ?? (f.archivoMime === "application/pdf" ? ".pdf" : ".jpg");
  const seguro = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  const partes = [f.fecha || "sin-fecha", seguro(f.proveedorNombre) || "proveedor", seguro(f.numero), f.id.slice(0, 6)].filter(Boolean);
  return `${partes.join("_")}${ext}`;
}

// Una factura entra en una orden de transferencia si está pendiente, tiene importe y un
// IBAN válido. Lo demás se explica fila a fila (sin IBAN, ya pagada…).
export function motivoNoPagable(f: FacturaRecibida): string | null {
  if (f.estado === "PAGADA") return "ya pagada";
  if (!(f.total !== null && f.total > 0)) return "sin importe";
  if (!f.proveedorIban || !ibanValido(f.proveedorIban)) return "sin IBAN del proveedor";
  return null;
}

// Las columnas `fecha` y `fechaPago` son DATE: la cadena vacía del formulario/lectura debe
// llegar como null (Postgres rechaza "" con «invalid input syntax for type date»).
export function camposParaDb<T extends Partial<CamposFacturaRecibida>>(campos: T): Omit<T, "fecha" | "fechaPago"> & { fecha?: string | null; fechaPago?: string | null } {
  const out: Record<string, unknown> = { ...campos };
  if ("fecha" in out) out.fecha = out.fecha ? out.fecha : null;
  if ("fechaPago" in out) out.fechaPago = out.fechaPago ? out.fechaPago : null;
  return out as Omit<T, "fecha" | "fechaPago"> & { fecha?: string | null; fechaPago?: string | null };
}
