import type { ClienteFicha } from "@/lib/ficha";

// EXPEDIENTE DE EMPRESA con N trabajadores (Luis, 21/09/2026). Módulo PURO: lo comparten
// la ficha (servidor), el tablero, las rutas de la API y los tests.
//
// Dos modelos conviven en la base y este módulo los distingue:
//   • Expediente de empresa (nuevo): empresaId presente y clienteId NULO. Los trabajadores
//     viven en ExpedienteTrabajador; el «cliente» es la empresa.
//   • Expediente de trabajador con empresa pagadora (hasta el 21/09): empresaId presente
//     y clienteId = la persona. Sigue funcionando tal cual, sin trabajadores anexos.

export type TrabajadorExpediente = {
  id: string;               // Cliente.id
  filaId: string;           // ExpedienteTrabajador.id
  nombre: string;           // nombre + apellidos
  email: string | null;
  telefono: string | null;
  nacionalidad: string | null;
  token: string | null;     // enlace individual (lote 3); null si la fila no lo tuviera
  enlaceEnviadoAt: string | null;
  presentadoAt: string | null;
  ficha: ClienteFicha;
};

// Expediente DE LA EMPRESA (modelo nuevo): la empresa es el cliente y no hay titular persona.
export function esExpedienteDeEmpresa(e: { empresaId?: string | null; clienteId?: string | null }): boolean {
  return Boolean(e.empresaId) && !e.clienteId;
}

export const nombreCompleto = (p: { nombre: string; apellidos?: string | null }): string =>
  `${p.nombre} ${p.apellidos ?? ""}`.trim();

// El servicio se tarifica POR TRABAJADOR (como la familia por miembro). Sin trabajadores
// todavía, la factura sale por UNA unidad: el anticipo de un encargo que aún no tiene
// nombres no puede ser 0 €.
export function unidadesFacturables(nTrabajadores: number): number {
  return Math.max(1, Math.floor(nTrabajadores));
}

// «3/5 presentados» en la tarjeta: cuántos trabajadores del lote ya están presentados.
export function presentados(trabajadores: { presentadoAt: string | null }[]): { n: number; total: number } {
  return { n: trabajadores.filter((t) => Boolean(t.presentadoAt)).length, total: trabajadores.length };
}

// Quitar un trabajador del expediente: solo si no dejó rastro en él. Con documentos o
// formularios generados a su nombre, quitarlo dejaría huérfanos — se dice qué falta.
export function motivoNoQuitar(
  x: { nDocumentos: number; nFormularios: number },
  t: (s: string) => string = (s) => s,
): string | null {
  if (x.nDocumentos > 0) return t("Este trabajador tiene documentos en el expediente. Elimínalos antes de quitarlo.");
  if (x.nFormularios > 0) return t("Este trabajador tiene formularios generados en el expediente. Quítalos antes de quitarlo.");
  return null;
}

// Resumen de la tarjeta/ficha: «Construcciones Delta S.L. · 3 trabajadores».
export function etiquetaTrabajadores(n: number, t: (s: string) => string = (s) => s): string {
  if (n === 0) return t("sin trabajadores todavía");
  if (n === 1) return `1 ${t("trabajador")}`;
  return `${n} ${t("trabajadores")}`;
}
