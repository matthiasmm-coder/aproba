import { describe, it, expect } from "vitest";
import { aplicarMapeo, type Mapeo } from "./importar";
import { caducidadDeGrupo, chocan, crearIndicePersonas, fusionarFichas, marcarMismaPersona } from "./importar-personas";

const mapeo: Mapeo = {
  columnas: [
    { indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "documento" }, { indice: 2, campo: "email" },
    { indice: 3, campo: "fechaNacimiento" }, { indice: 4, campo: "telefono" },
  ],
  tramites: {}, validezMeses: {}, estados: {}, crearHistorial: true, crearFamilias: false,
};
const filasDe = (datos: string[][]) => aplicarMapeo(datos, mapeo);

describe("la misma persona en varias filas", () => {
  it("listado de facturas: el mismo NIE o pasaporte en varias filas es UNA persona", () => {
    const filas = filasDe([
      ["Cindy Vargas", "Z1234567L", "", "", ""],
      ["Yousupha Manneh", "PA123456", "", "", ""],
      ["CINDY VARGAS", "Z1234567L", "", "", "612345678"],
      ["Yousupha Manneh", "PA123456", "", "", ""],
    ]);
    marcarMismaPersona(filas);
    expect(filas.map((f) => f.mismaQue)).toEqual([null, null, 0, 1]);
  });

  it("mismo nombre sin documentos que choquen = misma persona (sin acentos ni mayúsculas)", () => {
    const filas = filasDe([
      ["José Pérez", "Y1111111Z", "", "", ""],
      ["JOSE PEREZ", "PA999", "", "", ""],   // NIE en una, pasaporte en otra: no se contradicen
      ["Jose Perez", "", "", "", ""],
    ]);
    marcarMismaPersona(filas);
    expect(filas.map((f) => f.mismaQue)).toEqual([null, 0, 0]);
  });

  it("mismo nombre con dos NIE o dos fechas de nacimiento = dos personas, con aviso", () => {
    const filas = filasDe([
      ["Maria Garcia", "Y1111111Z", "", "1990-01-01", ""],
      ["Maria Garcia", "Y2222222Z", "", "", ""],
      ["Maria Garcia", "", "", "1985-05-05", ""],
    ]);
    marcarMismaPersona(filas);
    expect(filas.map((f) => f.mismaQue)).toEqual([null, null, null]);
    expect(filas[1].avisos.some((a) => a.includes("otros datos"))).toBe(true);
    expect(filas[2].avisos.some((a) => a.includes("otros datos"))).toBe(true); // ¿la 2ª o nadie? no se adivina
  });

  it("una familia que comparte el email del titular NO se funde en una persona", () => {
    const filas = filasDe([
      ["Amadou Diallo", "", "familia@correo.es", "", ""],
      ["Awa Diallo", "", "familia@correo.es", "", ""],
      ["Amadou Diallo", "", "familia@correo.es", "", ""],
    ]);
    marcarMismaPersona(filas);
    expect(filas.map((f) => f.mismaQue)).toEqual([null, null, 0]);
  });

  it("una fila descartada o sin nombre no ancla a nadie", () => {
    const filas = filasDe([
      ["Ana Ruiz", "Y1111111Z", "", "", ""],
      ["", "Y3333333Z", "", "", ""],
      ["Ana Ruiz", "Y1111111Z", "", "", ""],
    ]);
    filas[0].excluir = true;
    marcarMismaPersona(filas);
    expect(filas.map((f) => f.mismaQue)).toEqual([null, null, null]);
  });

  it("contra la cartera del despacho: lo que sabe el índice se acumula", () => {
    const ix = crearIndicePersonas<string>();
    ix.añadir("c1", { nombre: "Luis", apellidos: "Gonzales Paz", numeroDocumento: "Y5555555Z" });
    expect(ix.buscar({ nombre: "LUIS", apellidos: "GONZALES PAZ", pasaporte: "P1" }).coincide).toBe("c1");
    expect(ix.buscar({ nombre: "Luis", apellidos: "Gonzales Paz", numeroDocumento: "Y6666666Z" })).toEqual({ choca: "c1" });
    ix.añadir("c1", { pasaporte: "P1" });
    expect(ix.buscar({ pasaporte: "p1" }).coincide).toBe("c1");
    expect(chocan({ pasaporte: "P1" }, { pasaporte: "P2" })).toBe(true);
    expect(chocan({ numeroDocumento: "y-5555555-z" }, { numeroDocumento: "Y5555555Z" })).toBe(false);
  });

  it("la ficha del grupo toma el primer valor no vacío; la caducidad, la más reciente y la real primero", () => {
    expect(fusionarFichas([{ nombre: "Cindy", telefono: "" }, { nombre: "CINDY", telefono: "+34612345678", email: "c@x.es" }]))
      .toEqual({ nombre: "Cindy", telefono: "+34612345678", email: "c@x.es" });
    expect(caducidadDeGrupo([{ fechaCaducidad: "", caducidadDerivada: "2027-01-01" }, { fechaCaducidad: "", caducidadDerivada: "2028-06-01" }]))
      .toEqual({ fecha: "2028-06-01", fuente: "ESTIMADA" });
    expect(caducidadDeGrupo([{ fechaCaducidad: "2026-12-01", caducidadDerivada: "" }, { fechaCaducidad: "", caducidadDerivada: "2030-01-01" }]))
      .toEqual({ fecha: "2026-12-01", fuente: "REAL" });
    expect(caducidadDeGrupo([{ fechaCaducidad: "", caducidadDerivada: "" }])).toBeNull();
  });
});
