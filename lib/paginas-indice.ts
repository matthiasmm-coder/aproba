import { PAGINAS, type PaginaPublica } from "@/lib/paginas";
import { PAGINAS_TRAMITES } from "@/lib/tramites-paginas";
import { PAGINAS_MODELOS } from "@/lib/formularios-paginas";
import { PAGINAS_TASAS } from "@/lib/tasas-paginas";

// Índice ÚNICO de las páginas públicas de categoría: las de lib/paginas.ts, las de
// trámite, las de modelo oficial (EX/MI) y las de tasa. Sitemap, llms.txt y el renderer
// leen de aquí, no de cada lista.
export const TODAS_LAS_PAGINAS: PaginaPublica[] = [...PAGINAS, ...PAGINAS_TRAMITES, ...PAGINAS_MODELOS, ...PAGINAS_TASAS];
export const getPaginaPublica = (ruta: string): PaginaPublica | undefined => TODAS_LAS_PAGINAS.find((p) => p.ruta === ruta);
