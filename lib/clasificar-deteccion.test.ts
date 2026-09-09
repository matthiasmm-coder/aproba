import { describe, it, expect } from "vitest";
import { clasificarDeteccion, siguienteEtiquetaLibre } from "./tramites";

// El caso real que lo destapó (Asenjo Global, 08/09/2026): expediente de NACIONALIDAD con
// 4 documentos en la lista, pero 8 papeles reales. Antes, todo lo que la IA clasificaba
// como «otro» caía en la primera casilla de tipo OTRO —«Certificado de nacimiento»— y cada
// archivo pisaba al anterior: de 8 documentos sobrevivían 2.
const NACIONALIDAD = ["Pasaporte", "Certificado de nacimiento", "Certificado de empadronamiento", "Antecedentes penales"];

describe("clasificarDeteccion", () => {
  it("un tipo con casilla propia va a su casilla", () => {
    expect(clasificarDeteccion("pasaporte", NACIONALIDAD)).toEqual({ docTipo: "PASAPORTE", label: "Pasaporte", requerido: true });
    expect(clasificarDeteccion("empadronamiento", NACIONALIDAD)).toMatchObject({ label: "Certificado de empadronamiento", requerido: true });
  });

  it("«otro» y «desconocido» NO ocupan ninguna casilla", () => {
    for (const t of ["otro", "desconocido", "cualquier_cosa"]) {
      expect(clasificarDeteccion(t, NACIONALIDAD)).toEqual({ docTipo: "OTRO", label: "Otro documento", requerido: false });
    }
  });

  it("los tipos sin enum propio encuentran su casilla por el nombre", () => {
    expect(clasificarDeteccion("certificado_nacimiento", NACIONALIDAD)).toEqual({ docTipo: "OTRO", label: "Certificado de nacimiento", requerido: true });
    // Y si el trámite no lo pide, se queda con su propio nombre, fuera de las casillas.
    expect(clasificarDeteccion("certificado_nacimiento", ["Pasaporte"])).toEqual({ docTipo: "OTRO", label: "Certificado de nacimiento", requerido: false });
    expect(clasificarDeteccion("ccse_dele", NACIONALIDAD)).toEqual({ docTipo: "OTRO", label: "Certificado CCSE o DELE", requerido: false });
    expect(clasificarDeteccion("apostilla", NACIONALIDAD)).toMatchObject({ label: "Apostilla de La Haya", requerido: false });
  });

  it("un documento fuera de la lista no roba la casilla de otro", () => {
    // El NIE de Jhonatan: detectado tarjeta_residencia_tie, que nacionalidad no pide.
    expect(clasificarDeteccion("tarjeta_residencia_tie", NACIONALIDAD)).toEqual({ docTipo: "TARJETA_RESIDENCIA_TIE", label: "TIE actual", requerido: false });
  });

  it("los 8 papeles del caso real ocupan casillas DISTINTAS", () => {
    const detectados = ["pasaporte", "tarjeta_residencia_tie", "apostilla", "certificado_nacimiento", "apostilla", "antecedentes_penales", "ccse_dele", "empadronamiento"];
    const casillas = detectados.map((d) => clasificarDeteccion(d, NACIONALIDAD)).filter((c) => c.requerido).map((c) => c.label);
    expect(new Set(casillas).size).toBe(casillas.length); // ninguna casilla ocupada dos veces
    expect(casillas.sort()).toEqual(["Antecedentes penales", "Certificado de empadronamiento", "Certificado de nacimiento", "Pasaporte"]);
  });
});

describe("siguienteEtiquetaLibre", () => {
  it("libre → la etiqueta tal cual", () => {
    expect(siguienteEtiquetaLibre([], "Antecedentes penales")).toBe("Antecedentes penales");
    expect(siguienteEtiquetaLibre(["Pasaporte"], "Antecedentes penales")).toBe("Antecedentes penales");
  });
  it("ocupada → el nuevo entra al lado, nunca encima", () => {
    expect(siguienteEtiquetaLibre(["Antecedentes penales"], "Antecedentes penales")).toBe("Antecedentes penales (2)");
    expect(siguienteEtiquetaLibre(["Antecedentes penales", "Antecedentes penales (2)"], "Antecedentes penales")).toBe("Antecedentes penales (3)");
  });
  it("compara sin acentos ni mayúsculas", () => {
    expect(siguienteEtiquetaLibre(["  ANTECEDENTES PENALES "], "Antecedentes penales")).toBe("Antecedentes penales (2)");
  });
});
