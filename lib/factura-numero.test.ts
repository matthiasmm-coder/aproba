import { describe, it, expect } from "vitest";
import { calcularSiguiente, calcularSerie } from "./factura-numero";

describe("numeración de facturas", () => {
  it("empieza en 0001 cuando no hay ninguna", () => {
    expect(calcularSiguiente([], 2026)).toBe("2026-0001");
  });

  it("sigue la serie del año", () => {
    expect(calcularSiguiente(["2026-0001", "2026-0002", "2026-0003"], 2026)).toBe("2026-0004");
  });

  // El fallo que tenían tres de los seis sitios: por orden alfabético
  // "2026-9999" gana a "2026-10000" y la serie retrocedería.
  it("usa el máximo NUMÉRICO, no el lexicográfico", () => {
    expect(calcularSiguiente(["2026-9999", "2026-10000"], 2026)).toBe("2026-10001");
  });

  it("no se despista con huecos ni con el desorden", () => {
    expect(calcularSiguiente(["2026-0007", "2026-0002"], 2026)).toBe("2026-0008");
  });

  it("ignora números corruptos en vez de romper la serie", () => {
    expect(calcularSiguiente(["2026-0004", "sin-numero", ""], 2026)).toBe("2026-0005");
  });

  // Preparado para la serie por oficina (fase 2): lee el ÚLTIMO tramo.
  it("soporta un prefijo de oficina", () => {
    expect(calcularSiguiente(["DG-2026-0012"], 2026, "DG")).toBe("DG-2026-0013");
  });
});

describe("serie de N correlativos (fraccionar)", () => {
  it("devuelve N seguidos sin releer el contador", () => {
    expect(calcularSerie(["2026-0004"], 2026, 3)).toEqual(["2026-0005", "2026-0006", "2026-0007"]);
  });

  it("arranca en 0001 si la serie está vacía", () => {
    expect(calcularSerie([], 2026, 2)).toEqual(["2026-0001", "2026-0002"]);
  });
});
