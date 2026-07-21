import { TIPO_A_SERVICIO } from "@/lib/tramites";
import { dedupDocs } from "@/lib/tramites";
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
  // Mismo documento con etiquetas distintas entre servicios («Pasaporte» / «Pasaporte
  // completo») → una sola casilla (caso real de Juan: el pasaporte salía dos veces).
  return dedupDocs(out);
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
): { anticipo: number; resto: number; bruto: number; rebaja: number; anticipoBruto: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const N = Math.max(1, nMiembros);
  const antBruto = r2(tarifa.anticipo * N);
  const resBruto = r2(tarifa.resto * N);
  const bruto = r2(antBruto + resBruto);
  const d = descuentoValido(descuento);
  if (!d || bruto <= 0) return { anticipo: antBruto, resto: resBruto, bruto, rebaja: 0, anticipoBruto: antBruto };
  const rebaja = d.tipo === "PORCENTAJE" ? r2(bruto * d.valor / 100) : Math.min(r2(d.valor), bruto);
  const total = r2(bruto - rebaja);
  const anticipo = antBruto > 0 ? Math.min(total, r2(antBruto * (total / bruto))) : 0;
  const resto = r2(total - anticipo);
  return { anticipo, resto, bruto, rebaja, anticipoBruto: antBruto };
}

// Lo que queda por cobrar en el PAGO FINAL.
// Una factura PAGADA no se reescribe NUNCA. Si el descuento llegó DESPUÉS de cobrar el
// anticipo, la parte de la rebaja que le tocaba a ese anticipo no se aplicó en ningún
// sitio: se TRASLADA al pago final para que el cliente acabe pagando el total rebajado.
//
// Solo se traslada la rebaja del ANTICIPO, y solo lo que el cliente no llegó a recibir:
//   traslado = min( pagado de más respecto al anticipo rebajado , rebaja del anticipo )
// El tope es lo que impide que el final absorba desvíos AJENOS al descuento — si el
// gestor editó la factura del anticipo para cobrar trabajo extra, o si la tarifa subió
// después de cobrarla, el pago final NO debe devolver ni recobrar esa diferencia (de eso
// avisa la ruta de cambio de servicio). Sin descuento el traslado es 0: reb.resto tal cual.
// Nunca negativo: si el cliente ya pagó más que el total rebajado hay que DEVOLVERLE la
// diferencia, y eso ninguna factura de cobro puede expresarlo (avisa la ruta del descuento).
export function restoPendiente(
  reb: { anticipo: number; resto: number; anticipoBruto: number },
  anticipoPagado: number | null,
): number {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (anticipoPagado === null) return reb.resto;
  const rebajaDelAnticipo = r2(reb.anticipoBruto - reb.anticipo);
  if (rebajaDelAnticipo <= 0) return reb.resto; // sin descuento en el anticipo: nada que trasladar
  const noRecibido = Math.max(0, r2(anticipoPagado - reb.anticipo));
  const traslado = Math.min(noRecibido, rebajaDelAnticipo);
  return Math.max(0, r2(reb.resto - traslado));
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

// ── Asignación de servicios a miembros concretos (familia heterogénea) ───────
// Pedido de Juan: «que un servicio corresponda únicamente al padre, otro a la madre».
// { "<servicioClave>": [clienteId, ...] } en Expediente.serviciosAsignacion.
// Un servicio SIN entrada (o con lista vacía) se aplica a TODOS los miembros — el
// comportamiento ×N de siempre; con asignación null todo queda exactamente como hoy.
export type ServiciosAsignacion = Record<string, string[]>;

export function asignacionValida(a: unknown): ServiciosAsignacion | null {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const out: ServiciosAsignacion = {};
  for (const [clave, ids] of Object.entries(a as Record<string, unknown>)) {
    if (!clave.trim() || !Array.isArray(ids)) continue;
    const limpios = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
    if (limpios.length) out[clave] = limpios;
  }
  return Object.keys(out).length ? out : null;
}

// Nº de miembros que llevan UN servicio: su lista si existe, si no TODOS (×N clásico).
// Cap a nMiembros: una asignación obsoleta (miembro borrado) no puede cobrar de más.
export function miembrosDeServicio(asignacion: ServiciosAsignacion | null | undefined, clave: string, nMiembros: number): number {
  const N = Math.max(1, nMiembros);
  const lista = asignacion?.[clave];
  if (!lista?.length) return N;
  return Math.min(lista.length, N);
}

// Tarifa del expediente YA multiplicada: Σ servicio × sus miembros asignados.
// Sustituye al patrón «tarifaDeServicios(svs) y después ×N» en las superficies de
// dinero. Se pasa a aplicarDescuento con nMiembros=1 (ya viene multiplicada): el
// reparto del descuento y restoPendiente quedan intactos al céntimo. Sin asignación
// devuelve exactamente tarifaDeServicios ×N — retrocompatible por construcción.
export function tarifaAsignada(
  servicios: Servicio[],
  asignacion: ServiciosAsignacion | null | undefined,
  nMiembros: number,
): { anticipo: number; resto: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let anticipo = 0, resto = 0;
  for (const s of servicios) {
    const n = miembrosDeServicio(asignacion, s.id, nMiembros);
    anticipo = r2(anticipo + r2((Number(s.anticipo) || 0) * n));
    resto = r2(resto + r2((Number(s.resto) || 0) * n));
  }
  return { anticipo, resto };
}

// Suplidos FINALES del expediente, ya multiplicados («cada solicitante paga su tasa»):
// los de cada servicio ×(miembros de ESE servicio), con el ×n en el concepto. El
// override manual del expediente sigue siendo GLOBAL ×N — es una lista plana ajustada
// a mano, sin atribución por servicio (documentado; el gestor ve lo que factura).
export function suplidosAsignados(
  override: { concepto: string; importe: number }[] | null | undefined,
  servicios: Servicio[],
  asignacion: ServiciosAsignacion | null | undefined,
  nMiembros: number,
): { concepto: string; importe: number }[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const N = Math.max(1, nMiembros);
  if (Array.isArray(override)) {
    return override
      .filter((x) => x.concepto && Number(x.importe) > 0)
      .map((x) => ({ concepto: N > 1 ? `${x.concepto} (×${N})` : x.concepto, importe: r2(Number(x.importe) * N) }));
  }
  const out: { concepto: string; importe: number }[] = [];
  for (const s of servicios) {
    const n = miembrosDeServicio(asignacion, s.id, nMiembros);
    for (const x of s.suplidos ?? []) {
      if (!x.concepto || !(Number(x.importe) > 0)) continue;
      out.push({ concepto: n > 1 ? `${x.concepto} (×${n})` : x.concepto, importe: r2(Number(x.importe) * n) });
    }
  }
  return out;
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
