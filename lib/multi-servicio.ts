import { TIPO_A_SERVICIO } from "@/lib/tramites";
import type { Servicio } from "@/lib/servicios";

// Multi-servicio: un expediente tiene UN servicio principal (servicioClave, repli
// TIPO_A_SERVICIO[tipo]) y 0..N extras (Expediente.serviciosExtra text[]). Este módulo
// es EL resolutor único — antes había ~14 resoluciones `servicios.find(...)` duplicadas.
// Reglas: docs = unión (orden principal→extras), tarifa = suma, cita = OR (gestor gana),
// label = compuesto. Las claves BORRADAS del catálogo se filtran sin romper; DESACTIVAR
// un servicio NO detiene un extra ya asignado (sigue facturando y pidiendo sus docs —
// el portal /j cuenta con ello para enseñar el mismo precio que /api/pagos).

export type ExpConServicios = {
  servicioClave?: string | null;
  serviciosExtra?: string[] | null;
  tipo: string; // tipoEnum
};

// Claves del expediente, principal primero, dedupe, sin nulos.
export function clavesDeExpediente(exp: ExpConServicios): string[] {
  const principal = exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo] ?? null;
  const extras = Array.isArray(exp.serviciosExtra) ? exp.serviciosExtra : [];
  const out: string[] = [];
  for (const c of [principal, ...extras]) if (c && !out.includes(c)) out.push(c);
  return out;
}

// Servicios resueltos contra el catálogo del workspace (los no encontrados se filtran).
export function serviciosDeExpediente(exp: ExpConServicios, catalogo: Servicio[]): Servicio[] {
  const byId = new Map(catalogo.map((s) => [s.id, s]));
  return clavesDeExpediente(exp)
    .map((c) => byId.get(c))
    .filter((s): s is Servicio => Boolean(s));
}

// Unión deduplicada de los documentos requeridos (por label exacto, orden estable
// principal→extras — el portal indexa los slots por posición).
export function docsDeServicios(servicios: Servicio[]): string[] {
  const out: string[] = [];
  for (const s of servicios) for (const d of s.docs ?? []) if (!out.includes(d)) out.push(d);
  return out;
}

// Suma de tarifas: la factura automática (ANTICIPO/FINAL) cobra la suma de todos los
// servicios (después ×N miembros en familia, como hoy).
export function tarifaDeServicios(servicios: Servicio[]): { anticipo: number; resto: number } {
  return {
    anticipo: servicios.reduce((a, s) => a + (Number(s.anticipo) || 0), 0),
    resto: servicios.reduce((a, s) => a + (Number(s.resto) || 0), 0),
  };
}

// ── Descuento por expediente (pedido por Juan) ───────────────────────────────
// Se aplica a los HONORARIOS (tras el ×N de familia); las tasas/suplidos nunca se
// descuentan. Reparto proporcional anticipo/resto con coherencia AL CÉNTIMO:
// anticipo se redondea y el resto absorbe la diferencia (anticipo+resto == total
// rebajado exacto) — el realineado de facturas compara totales.
export type Descuento = { tipo: "PORCENTAJE" | "IMPORTE"; valor: number; motivo?: string };

export function descuentoValido(d: unknown): Descuento | null {
  if (!d || typeof d !== "object") return null;
  const x = d as { tipo?: unknown; valor?: unknown; motivo?: unknown };
  const valor = Number(x.valor);
  if (!Number.isFinite(valor)) return null;
  if (x.tipo === "PORCENTAJE" && valor > 0 && valor <= 100) {
    return { tipo: "PORCENTAJE", valor, ...(typeof x.motivo === "string" && x.motivo.trim() ? { motivo: x.motivo.trim() } : {}) };
  }
  const redondeado = Math.round(valor * 100) / 100;
  if (x.tipo === "IMPORTE" && redondeado > 0) {
    return { tipo: "IMPORTE", valor: redondeado, ...(typeof x.motivo === "string" && x.motivo.trim() ? { motivo: x.motivo.trim() } : {}) };
  }
  return null;
}

export function aplicarDescuento(
  tarifa: { anticipo: number; resto: number },
  nMiembros: number,
  descuento: Descuento | null | undefined,
): { anticipo: number; resto: number; bruto: number; rebaja: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const N = Math.max(1, nMiembros);
  const antBruto = r2(tarifa.anticipo * N);
  const resBruto = r2(tarifa.resto * N);
  const bruto = r2(antBruto + resBruto);
  const d = descuentoValido(descuento);
  if (!d || bruto <= 0) return { anticipo: antBruto, resto: resBruto, bruto, rebaja: 0 };
  const rebaja = d.tipo === "PORCENTAJE" ? r2(bruto * d.valor / 100) : Math.min(r2(d.valor), bruto);
  const total = r2(bruto - rebaja);
  const anticipo = antBruto > 0 ? Math.min(total, r2(antBruto * (total / bruto))) : 0;
  const resto = r2(total - anticipo);
  return { anticipo, resto, bruto, rebaja };
}

// Etiqueta corta del descuento («−10 %» / «−1.500,00 €») para tarjetas y filas.
// Mismo formato de miles que eur() (lib/facturas) para no divergir del resto de importes.
export function etiquetaDescuento(d: Descuento | null | undefined): string {
  const v = descuentoValido(d);
  if (!v) return "";
  if (v.tipo === "PORCENTAJE") return `−${v.valor} %`;
  const [int, dec] = v.valor.toFixed(2).split(".");
  return `−${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

// Fusión de la cita presencial: si UN servicio la exige, el expediente la exige;
// si uno de esos la asume el gestor, acude el gestor. MISMA regla en las 4 superficies
// (avanzar, ficha, /s, agenda) — si divergen, la UI promete una cita que la API no da.
export function citaDeServicios(servicios: Servicio[]): { citaPresencial: boolean; citaQuien: "gestor" | "cliente" } {
  const conCita = servicios.filter((s) => s.citaPresencial);
  return {
    citaPresencial: conCita.length > 0,
    citaQuien: conCita.some((s) => s.citaQuien === "gestor") ? "gestor" : "cliente",
  };
}

// Tasas y suplidos de todos los servicios (principal + extras), en orden. SIN IVA —
// van al presupuesto y a la PRIMERA factura automática del expediente (×N en familia).
export function suplidosDeServicios(servicios: Servicio[]): { concepto: string; importe: number }[] {
  return servicios.flatMap((s) => (s.suplidos ?? []).filter((x) => x.concepto && x.importe > 0));
}

// Suplidos EFECTIVOS de un expediente: si tiene override manual (Expediente.suplidosOverride)
// se usa TAL CUAL (el gestor lo ajustó para este caso); si no, los del servicio. Un array
// vacío explícito significa «sin tasas» (distinto de null = usar los del servicio).
export function suplidosDeExpediente(
  override: { concepto: string; importe: number }[] | null | undefined,
  servicios: Servicio[],
): { concepto: string; importe: number }[] {
  if (Array.isArray(override)) return override.filter((x) => x.concepto && Number(x.importe) > 0).map((x) => ({ concepto: x.concepto, importe: Number(x.importe) }));
  return suplidosDeServicios(servicios);
}

// Label compuesto para conceptos de factura y cabeceras («Arraigo social + Canje»).
export function labelServicios(servicios: Servicio[], fallback = ""): string {
  return servicios.map((s) => s.label?.trim()).filter(Boolean).join(" + ") || fallback;
}
