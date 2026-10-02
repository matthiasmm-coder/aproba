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

// Opciones de los documentos de ESTE expediente: validez y observaciones del PRESUPUESTO, y
// condiciones particulares de la HOJA DE ENCARGO (Luis, 02/10/2026). Ninguna va a la factura.
export type PresupuestoOpciones = { validezDias: number; nota: string; condiciones: string };

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
  const v = x as { validezDias?: unknown; nota?: unknown; condiciones?: unknown };
  const dias = Math.round(Number(v.validezDias));
  const texto = (t: unknown) => (typeof t === "string" ? t.trim().slice(0, MAX_NOTA) : "");
  return {
    validezDias: Number.isFinite(dias) && dias >= 1 && dias <= 365 ? dias : VALIDEZ_PRESUPUESTO_DIAS,
    nota: texto(v.nota),
    condiciones: texto(v.condiciones),
  };
}

// Cada ventana guarda SUS campos: el presupuesto la validez y la nota, la hoja de encargo sus
// condiciones. Se funden con lo guardado para que una no borre lo de la otra. `parcial` null
// (clientes anteriores) = presupuesto por defecto, conservando las condiciones. Todo por
// defecto → null (la columna vacía, como antes).
export function fusionarOpciones(actual: unknown, parcial: unknown): PresupuestoOpciones | null {
  const a = presupuestoOpcionesValidas(actual) ?? { validezDias: VALIDEZ_PRESUPUESTO_DIAS, nota: "", condiciones: "" };
  const p = parcial && typeof parcial === "object" && !Array.isArray(parcial) ? (parcial as Record<string, unknown>) : null;
  const tiene = (k: string) => Boolean(p && Object.prototype.hasOwnProperty.call(p, k));
  const nuevo = presupuestoOpcionesValidas({
    validezDias: p ? (tiene("validezDias") ? p.validezDias : a.validezDias) : VALIDEZ_PRESUPUESTO_DIAS,
    nota: p ? (tiene("nota") ? p.nota : a.nota) : "",
    condiciones: tiene("condiciones") ? p!.condiciones : a.condiciones,
  })!;
  return nuevo.validezDias === VALIDEZ_PRESUPUESTO_DIAS && !nuevo.nota && !nuevo.condiciones ? null : nuevo;
}
