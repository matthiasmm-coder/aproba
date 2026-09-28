// NOVEDADES DIRIGIDAS: un aviso de una sola vez para UN despacho concreto, no un tour.
// Sale arriba del contenido de /app hasta que el gestor lo abre o lo cierra (no vuelve en
// ese navegador) y caduca solo en su fecha. Textos en español: el componente los pasa por
// t() (traducción catalana en lib/app-i18n.ts).
//
// 28/09/2026 — AG Global (Alberto Gil, en prueba): su trámite «Familiar de Ciudadano
// Español» no estaba en el catálogo y su pantalla Formularios salía vacía. Desde c50d799
// Aproba le propone el EX-24; Matthias quiere que lo vea al volver a entrar.

export type Novedad = { id: string; titulo: string; texto: string; cta: string; href: string; hasta: string };

const NOVEDADES: Record<string, Novedad[]> = {
  "81e5194e-dd74-48f1-a877-dfbcfedeb479": [
    {
      id: "ex24-familiar-espanol",
      titulo: "Tu trámite de familiar de ciudadano español ya trae su EX-24",
      texto: "Lo hemos añadido al catálogo: en tu expediente EXP-2026-0001, la pantalla Formularios te propone el EX-24 relleno con los datos de tu cliente.",
      cta: "Ver el EX-24",
      href: "/app/expedientes/00ee64df-b62b-4d77-81cb-b8ea85062795/formularios",
      hasta: "2026-10-17", // fin de una prueba ampliada 15 días, con margen
    },
  ],
};

// Las novedades vivas de un despacho (ninguna para los demás).
export function novedadesDe(workspaceId: string | null | undefined, ahora: Date = new Date()): Novedad[] {
  if (!workspaceId) return [];
  return (NOVEDADES[workspaceId] ?? []).filter((n) => ahora.getTime() < Date.parse(`${n.hasta}T00:00:00+02:00`));
}
