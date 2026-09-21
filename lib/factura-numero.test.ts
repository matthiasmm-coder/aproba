import { describe, it, expect } from "vitest";
import { calcularSiguiente, calcularSerie, interpretarUltimoNumero, ordinalDeNumero } from "./factura-numero";

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

// ── Números quemados (24/08/2026, caso Gesnet) ────────────────────────────────
// Borrar la factura del TOPE de la serie liberaba su número y la siguiente lo
// REUTILIZABA: dos PDF distintos se llamaron 2026-0006. emitidos() une ahora los
// números de FacturaNumeroQuemado a los vivos; estas pruebas fijan la semántica
// de esa unión sobre la función pura.
describe("números quemados: un número emitido no vuelve a salir", () => {
  it("borrar la factura del tope NO libera su número (el quemado sostiene el max)", () => {
    const vivos = ["2026-0001", "2026-0002", "2026-0003", "2026-0004", "2026-0005"];
    const quemados = ["2026-0006"]; // la 0006 se borró: viva ya no está, quemada sí
    expect(calcularSiguiente([...vivos, ...quemados], 2026)).toBe("2026-0007");
  });
  it("sin la unión, el número se reutilizaría (el bug que se cierra)", () => {
    const vivos = ["2026-0001", "2026-0002", "2026-0003", "2026-0004", "2026-0005"];
    expect(calcularSiguiente(vivos, 2026)).toBe("2026-0006"); // ← lo que pasaba
  });
  it("un número vivo Y quemado a la vez no daña la serie (quema antes de borrar)", () => {
    const vivos = ["2026-0001", "2026-0002"];
    const quemados = ["2026-0002"]; // el delete falló tras quemar: duplicado inocuo
    expect(calcularSiguiente([...vivos, ...quemados], 2026)).toBe("2026-0003");
  });
  it("los quemados respetan la serie de su prefijo de oficina", () => {
    const todos = ["DG-2026-0001", "DG-2026-0002", "2026-0009"];
    expect(calcularSiguiente(todos.filter((n) => n.startsWith("DG-")), 2026, "DG")).toBe("DG-2026-0003");
  });
});

// Arranque de serie (Luis, 21/09/2026): el gestor escribe su último número y la serie sigue.
describe("interpretarUltimoNumero", () => {
  it("acepta el número suelto, con año y con prefijo, y lo deja canónico", () => {
    expect(interpretarUltimoNumero("312", 2026)).toEqual({ numero: "2026-0312", n: 312 });
    expect(interpretarUltimoNumero(" 0312 ", 2026)).toEqual({ numero: "2026-0312", n: 312 });
    expect(interpretarUltimoNumero("2026-0312", 2026)).toEqual({ numero: "2026-0312", n: 312 });
    expect(interpretarUltimoNumero("dg-2026-7", 2026, "DG")).toEqual({ numero: "DG-2026-0007", n: 7 });
    expect(interpretarUltimoNumero("DG-7", 2026, "DG")).toEqual({ numero: "DG-2026-0007", n: 7 });
  });
  it("rechaza otro año, otro prefijo, el cero y los formatos raros", () => {
    expect(interpretarUltimoNumero("2025-0312", 2026)).toHaveProperty("error");
    expect(interpretarUltimoNumero("DG-2026-0312", 2026)).toHaveProperty("error");
    expect(interpretarUltimoNumero("2026-0312", 2026, "DG")).toEqual({ numero: "DG-2026-0312", n: 312 });
    expect(interpretarUltimoNumero("XX-2026-0312", 2026, "DG")).toHaveProperty("error");
    expect(interpretarUltimoNumero("0", 2026)).toHaveProperty("error");
    expect(interpretarUltimoNumero("", 2026)).toHaveProperty("error");
    expect(interpretarUltimoNumero("factura 12", 2026)).toHaveProperty("error");
    expect(interpretarUltimoNumero("1-2-3-4", 2026)).toHaveProperty("error");
  });
  it("quemar el último número hace que la serie siga desde el siguiente", () => {
    const r = interpretarUltimoNumero("312", 2026);
    if ("error" in r) throw new Error(r.error);
    expect(calcularSiguiente(["2026-0002", r.numero], 2026)).toBe("2026-0313");
    expect(ordinalDeNumero("DG-2026-0312")).toBe(312);
    expect(ordinalDeNumero("raro")).toBe(0);
  });
});
