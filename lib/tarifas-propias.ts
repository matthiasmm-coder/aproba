// HONORARIOS PROPIOS DE UN EXPEDIENTE (pedido por Juan, 26/09/2026).
//
// Juan ya no pone precio fijo a sus servicios: cobra según el cliente, la complejidad y
// las circunstancias del trámite. El gestor fija los honorarios de ESTE expediente —por
// servicio: al inicio y al finalizar, sin IVA— sin tocar el precio del catálogo. Se guardan
// en Expediente.tarifasPropias y sustituyen a la tarifa del catálogo en TODAS las
// superficies de dinero (presupuesto, hoja de encargo, portal /j, facturas de /api/pagos y
// ficha), porque todas resuelven los servicios con serviciosDeExpediente o conTarifasPropias.
// El descuento se aplica encima, como siempre; en familia la tarifa sigue siendo POR MIEMBRO.
//
// Módulo PURO (sin red ni base): la lectura vive en lib/data/tarifas-propias.ts.

export type TarifaPropia = { anticipo: number; resto: number };
export type TarifasPropias = Record<string, TarifaPropia>; // clave del servicio → tarifa

// Opciones que solo imprime el PRESUPUESTO (no la hoja de encargo ni la factura).
export type PresupuestoOpciones = { validezDias: number; nota: string };

export const VALIDEZ_PRESUPUESTO_DIAS = 30; // la que se imprimía fija hasta el 26/09
export const MAX_TARIFA = 100_000;
export const MAX_NOTA = 600;

const r2 = (n: number) => Math.round(n * 100) / 100;

// Lectura defensiva del jsonb: lo que no sea un importe válido se descarta (nunca se
// factura un NaN ni un negativo). null = sin precio propio → manda el catálogo.
export function tarifasPropiasValidas(x: unknown): TarifasPropias | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out: TarifasPropias = {};
  for (const [clave, v] of Object.entries(x as Record<string, unknown>)) {
    if (!clave || clave.length > 80 || !v || typeof v !== "object") continue;
    const anticipo = Number((v as { anticipo?: unknown }).anticipo);
    const resto = Number((v as { resto?: unknown }).resto);
    if (!Number.isFinite(anticipo) || !Number.isFinite(resto)) continue;
    if (anticipo < 0 || resto < 0 || anticipo > MAX_TARIFA || resto > MAX_TARIFA) continue;
    out[clave] = { anticipo: r2(anticipo), resto: r2(resto) };
  }
  return Object.keys(out).length ? out : null;
}

// Sustituye la tarifa del catálogo por la del expediente en los servicios que la tengan.
// Un precio propio también resuelve el «precio a consultar»: ese expediente ya tiene
// importe, y el presupuesto puede imprimir el total.
export function conTarifasPropias<T extends { id: string; anticipo: number; resto: number }>(servicios: T[], tarifas: unknown): T[] {
  const t = tarifasPropiasValidas(tarifas);
  if (!t) return servicios;
  return servicios.map((s) => {
    const p = t[s.id];
    return p ? { ...s, anticipo: p.anticipo, resto: p.resto, precio: r2(p.anticipo + p.resto), precioOculto: false } : s;
  });
}

export function presupuestoOpcionesValidas(x: unknown): PresupuestoOpciones | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const v = x as { validezDias?: unknown; nota?: unknown };
  const dias = Math.round(Number(v.validezDias));
  const nota = typeof v.nota === "string" ? v.nota.trim().slice(0, MAX_NOTA) : "";
  return {
    validezDias: Number.isFinite(dias) && dias >= 1 && dias <= 365 ? dias : VALIDEZ_PRESUPUESTO_DIAS,
    nota,
  };
}
