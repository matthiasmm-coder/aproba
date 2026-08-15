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

describe("series por oficina (prefijo)", () => {
  it("la serie prefijada arranca en 0001: emitidos() filtra por patrón y una serie nueva recibe lista vacía", () => {
    // calcularSerie es pura: continúa el máximo DE LA LISTA QUE RECIBE. La separación
    // de series vive en emitidos() (like «DG-2026-%» vs «2026-%»), no aquí.
    expect(calcularSerie([], 2026, 1, "DG")).toEqual(["DG-2026-0001"]);
  });
  it("la serie común ignora los números prefijados", () => {
    // emitidos() ya filtra por patrón; calcularSerie con la lista común no ve DG-…
    expect(calcularSerie(["2026-0002", "2026-0001"], 2026, 1)).toEqual(["2026-0003"]);
  });
  it("la serie prefijada continúa su propio máximo", () => {
    expect(calcularSerie(["DG-2026-0007", "DG-2026-0002"], 2026, 2, "DG")).toEqual(["DG-2026-0008", "DG-2026-0009"]);
  });
  it("prefijo con año nuevo → reinicia en 0001", () => {
    expect(calcularSerie([], 2027, 1, "DG")).toEqual(["DG-2027-0001"]);
  });
});

