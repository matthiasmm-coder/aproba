import { PAGINAS, type PaginaPublica } from "@/lib/paginas";
import { PAGINAS_TRAMITES } from "@/lib/tramites-paginas";

// Índice ÚNICO de las páginas públicas de categoría: las de lib/paginas.ts y las de
// trámite. Sitemap, llms.txt y el renderer leen de aquí, no de cada lista.
export const TODAS_LAS_PAGINAS: PaginaPublica[] = [...PAGINAS, ...PAGINAS_TRAMITES];
export const getPaginaPublica = (ruta: string): PaginaPublica | undefined => TODAS_LAS_PAGINAS.find((p) => p.ruta === ruta);
