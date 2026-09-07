import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASISTENTE_SISTEMA } from "./asistente";

// El asistente «Ayuda» falló dos veces el 07/09/2026 con un despacho real: afirmó que
// Aproba no ponía el logo en las facturas (sí lo hace) y no supo nada de VeriFactu. La
// causa no fueron esas dos lagunas sino la MECÁNICA: la base de conocimiento vive en un
// fichero aparte, así que cada entrega de producto la deja un poco más vieja y nadie se
// entera hasta que un cliente pregunta. Esta prueba convierte el olvido en un fallo de
// CI, igual que la cobertura catalana: si aparece una pestaña o una sección de Ajustes
// nueva y el asistente no la menciona, el build se cae.
//
// Solo cubre las SUPERFICIES (menú y secciones de Ajustes), que son extraíbles del
// código con fiabilidad. Lo que hay DENTRO de cada pantalla sigue siendo trabajo humano:
// al entregar una función, actualizar también lib/asistente.ts.

const raiz = join(__dirname, "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
// La base escribe los títulos en mayúsculas de sección («HOJA DE ENCARGO Y MANDATO:»),
// así que la comparación ignora mayúsculas y acentos no: solo el caso.
const SABE = ASISTENTE_SISTEMA.toLowerCase();
const conoce = (x: string) => SABE.includes(x.toLowerCase());

describe("el asistente conoce el producto", () => {
  it("menciona todas las pestañas del menú lateral", () => {
    const nav = leer("components/sidebar-nav.tsx");
    const labels = [...nav.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(3); // si el regex deja de casar, que se note
    const faltan = labels.filter((l) => !conoce(l));
    expect(faltan, `pestañas ausentes de lib/asistente.ts: ${faltan.join(", ")}`).toEqual([]);
  });

  it("menciona todas las secciones de Ajustes", () => {
    const pagina = leer("app/app/ajustes/page.tsx");
    const titulos = [...pagina.matchAll(/[^a-zA-Z]title=\{t\("([^"]+)"\)\}/g)].map((m) => m[1]);
    expect(titulos.length).toBeGreaterThan(4);
    const faltan = titulos.filter((tit) => !conoce(tit));
    expect(faltan, `secciones de Ajustes ausentes de lib/asistente.ts: ${faltan.join(", ")}`).toEqual([]);
  });

  it("lleva la fecha del estado del producto, para que el modelo sepa de cuándo es", () => {
    expect(ASISTENTE_SISTEMA).toMatch(/ESTADO DEL PRODUCTO: \d{1,2} de \w+ de 20\d\d/);
  });

  it("mantiene la regla de no inventar", () => {
    expect(ASISTENTE_SISTEMA).toContain("Hablar con una persona");
    expect(ASISTENTE_SISTEMA.toLowerCase()).toContain("nunca te inventes");
  });
});
