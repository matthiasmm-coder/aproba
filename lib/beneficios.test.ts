import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BENEFICIOS, rutaDe, rutaDeTarjeta } from "./beneficios";

// Cada tarjeta de la portada tiene su página y cada página tiene una tarjeta: si alguien
// renombra una tarjeta en app/page.tsx sin tocar lib/beneficios (o al revés), esto falla
// antes de que la portada enlace a un 404.
describe("beneficios de la portada", () => {
  const portada = readFileSync("app/page.tsx", "utf8");
  it("toda tarjeta enlazada desde la portada existe", () => {
    for (const m of portada.matchAll(/rutaDeTarjeta\("([^"]+)"\)/g)) expect(() => rutaDeTarjeta(m[1])).not.toThrow();
    for (const t of ["Validación con IA", "Formularios en un clic", "Avisos automáticos", "Tablero de seguimiento", "Radar de renovaciones", "Facturas automáticas", "RGPD y DPA firmado", "Datos alojados en la UE", "Tus datos no entrenan IA", "Sin permanencia"]) {
      expect(portada).toContain(`titulo: "${t}"`);
      expect(() => rutaDeTarjeta(t)).not.toThrow();
    }
  });
  it("14 páginas, rutas únicas, títulos ≤ 65 y descripciones ≤ 160", () => {
    expect(BENEFICIOS).toHaveLength(14);
    expect(new Set(BENEFICIOS.map(rutaDe)).size).toBe(14);
    for (const b of BENEFICIOS) {
      expect(b.titulo.length, b.slug).toBeLessThanOrEqual(65);
      expect(b.descripcion.length, b.slug).toBeLessThanOrEqual(160);
      expect(b.faq.length, b.slug).toBeGreaterThanOrEqual(2);
      expect(b.significa.length + b.afirmamos.length, b.slug).toBeGreaterThan(1);
    }
  });
  it("los enlaces internos del contenido apuntan a páginas que existen", () => {
    const rutas = new Set([...BENEFICIOS.map(rutaDe), "/legal/dpa", "/legal/privacidad", "/legal/terminos", "/articulos"]);
    const texto = JSON.stringify(BENEFICIOS);
    for (const m of texto.matchAll(/\]\((\/[^)]+)\)/g)) {
      const ruta = m[1].replace(/\\"/g, "");
      expect(rutas.has(ruta) || ruta.startsWith("/articulos/"), ruta).toBe(true);
    }
  });
});
