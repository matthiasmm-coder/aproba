import type { MetadataRoute } from "next";
import { ARTICULOS } from "@/lib/articulos";

// Sitemap mínimo: las páginas públicas indexables. Fechas fijas por página (se
// actualizan cuando cambia el contenido de verdad, no en cada build).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://aproba-software.com";
  const paginas: { ruta: string; prioridad: number }[] = [
    { ruta: "/", prioridad: 1 },
    { ruta: "/articulos", prioridad: 0.8 },
    { ruta: "/login", prioridad: 0.3 },
    { ruta: "/signup", prioridad: 0.5 },
    { ruta: "/legal/aviso-legal", prioridad: 0.2 },
    { ruta: "/legal/privacidad", prioridad: 0.2 },
    { ruta: "/legal/cookies", prioridad: 0.2 },
    { ruta: "/legal/terminos", prioridad: 0.2 },
    { ruta: "/legal/dpa", prioridad: 0.2 },
    { ruta: "/legal/extension", prioridad: 0.2 },
  ];
  const fijas: MetadataRoute.Sitemap = paginas.map((p) => ({
    url: `${base}${p.ruta}`,
    changeFrequency: p.ruta === "/" ? "weekly" : "monthly",
    priority: p.prioridad,
  }));
  // Un artículo nuevo entra solo en el sitemap: la fuente es lib/articulos.
  const articulos: MetadataRoute.Sitemap = ARTICULOS.map((a) => ({
    url: `${base}/articulos/${a.slug}`,
    lastModified: new Date(a.actualizado ?? a.fecha),
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  return [...fijas, ...articulos];
}
