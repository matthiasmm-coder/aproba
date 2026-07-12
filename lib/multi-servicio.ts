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

// Label compuesto para conceptos de factura y cabeceras («Arraigo social + Canje»).
export function labelServicios(servicios: Servicio[], fallback = ""): string {
  return servicios.map((s) => s.label?.trim()).filter(Boolean).join(" + ") || fallback;
}
