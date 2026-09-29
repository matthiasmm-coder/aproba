import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { BENEFICIOS, rutaDe, rutaDeTarjeta } from "./beneficios";

// Cada tarjeta de la portada tiene su página y cada página tiene una tarjeta: si alguien
// renombra una tarjeta en app/page.tsx sin tocar lib/beneficios (o al revés), esto falla
// antes de que la portada enlace a un 404.
describe("beneficios de la portada", () => {
  const portada = readFileSync("app/page.tsx", "utf8");
  it("toda tarjeta enlazada desde la portada existe", () => {
    for (const m of portada.matchAll(/rutaDeTarjeta\("([^"]+)"\)/g)) expect(() => rutaDeTarjeta(m[1])).not.toThrow();
    for (const t of ["Validación con IA", "Formularios en un clic", "Avisos automáticos", "Notificaciones DEHú", "Radar de renovaciones", "Facturas automáticas", "RGPD y DPA firmado", "Datos alojados en la UE", "Tus datos no entrenan IA", "Sin permanencia"]) {
      expect(portada).toContain(`titulo: "${t}"`);
      expect(() => rutaDeTarjeta(t)).not.toThrow();
    }
  });
  it("«en la portada» solo donde la portada enseña la tarjeta", () => {
    // 30/09/2026: el tablero salió de la portada (la DEHú ocupa su sitio) y su página seguía
    // diciendo «en la portada». Una página sin tarjeta lleva fueraDePortada.
    for (const b of BENEFICIOS) {
      const enPortada = portada.includes(`titulo: "${b.tarjeta}"`) || portada.includes(`rutaDeTarjeta("${b.tarjeta}")`);
      expect(Boolean(b.fueraDePortada), b.slug).toBe(!enPortada);
    }
  });
  it("16 páginas, rutas únicas, títulos ≤ 65 y descripciones ≤ 160", () => {
    // 28/09/2026: + /funciones/extranjeria-para-empresas. 30/09/2026: + /funciones/notificaciones-dehu
    // (la tarjeta DEHú sustituye al tablero en la portada; la página del tablero sigue).
    expect(BENEFICIOS).toHaveLength(16);
    expect(new Set(BENEFICIOS.map(rutaDe)).size).toBe(16);
    for (const b of BENEFICIOS) {
      expect(b.titulo.length, b.slug).toBeLessThanOrEqual(65);
      expect(b.descripcion.length, b.slug).toBeLessThanOrEqual(160);
      expect(b.faq.length, b.slug).toBeGreaterThanOrEqual(2);
      expect(b.significa.length + b.afirmamos.length, b.slug).toBeGreaterThan(1);
    }
  });
  it("solo las funciones llevan captura, y cada una tiene su fichero", () => {
    for (const b of BENEFICIOS) {
      if (b.grupo === "funciones") {
        expect(b.captura, b.slug).toBeDefined();
        expect(existsSync(`public/beneficios/${b.slug}.jpg`), b.slug).toBe(true);
        expect(b.captura!.alt.length, b.slug).toBeGreaterThan(20);
      } else {
        expect(b.captura, b.slug).toBeUndefined();
        expect(existsSync(`public/beneficios/${b.slug}.jpg`), b.slug).toBe(false);
      }
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
