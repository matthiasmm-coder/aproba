import { describe, it, expect } from "vitest";
import { deducirOrigen, resumirOrigen } from "./origen";

const H = "https://aproba-software.com";

describe("origen de un registro", () => {
  it("una utm gana sobre el referrer", () => {
    const o = deducirOrigen(`${H}/?utm_source=linkedin&utm_medium=post&utm_campaign=colegios`, "https://google.com/");
    expect(o).toMatchObject({ fuente: "linkedin", medio: "post", campana: "colegios" });
  });

  it("reconoce buscadores y redes por su dominio", () => {
    expect(deducirOrigen(H, "https://www.google.es/search?q=x")).toMatchObject({ fuente: "google", medio: "organico" });
    expect(deducirOrigen(H, "https://www.linkedin.com/feed/")).toMatchObject({ fuente: "linkedin", medio: "referencia" });
  });

  // El fallo clásico: contar una navegación interna como si fuera una fuente nueva.
  it("la navegación interna NO es un origen", () => {
    expect(deducirOrigen(`${H}/precios`, `${H}/`)).toMatchObject({ fuente: "directo" });
  });

  it("sin referrer es tráfico directo", () => {
    expect(deducirOrigen(H, "")).toMatchObject({ fuente: "directo" });
  });

  it("un dominio desconocido se guarda tal cual, sin www", () => {
    expect(deducirOrigen(H, "https://www.gestores.net/noticias")).toMatchObject({ fuente: "gestores.net", medio: "referencia" });
  });

  it("no guarda la query de la página de entrada (nada de datos personales)", () => {
    const o = deducirOrigen(`${H}/demo?email=alguien@correo.com`, "https://google.com/");
    expect(o.aterrizaje).toBe("/demo");
    expect(JSON.stringify(o)).not.toContain("alguien@correo.com");
  });

  it("resume en una línea legible", () => {
    expect(resumirOrigen({ fuente: "google", medio: "organico", aterrizaje: "/precios" }))
      .toBe("google · organico · entró por /precios");
    expect(resumirOrigen(null)).toBe("origen desconocido");
  });
});
