import { describe, expect, it } from "vitest";
import { aplicarMapeo, marcarDuplicadosInternos, partirNombreCompleto, normalizarTelefono, esNie, masUnAno, type Mapeo } from "./importar";

const mapeo: Mapeo = {
  columnas: [
    { indice: 0, campo: "nombreCompleto" },
    { indice: 1, campo: "documento" },
    { indice: 2, campo: "telefono" },
    { indice: 3, campo: "tramite" },
    { indice: 4, campo: "estado" },
    { indice: 5, campo: "fechaCaducidad" },
    { indice: 6, campo: "familia" },
    { indice: 7, campo: null },
  ],
  tramites: { "Arraigo social": "arraigo_social", "Renovación TIE": "renovacion_tie" },
  estados: { "Terminado": "FINALIZADO", "En trámite": "PRESENTADO" },
  crearHistorial: true,
  crearFamilias: true,
};

describe("regularización 2026 — caducidad DERIVADA = resolución + 1 año", () => {
  const base: Mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "fechaResolucion" }, { indice: 2, campo: "fechaCaducidad" }],
    tramites: {}, estados: {}, crearHistorial: false, crearFamilias: false,
  };

  it("con el flag activo, la resolución genera la caducidad derivada (no la explícita)", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "15/08/2026", ""]], { ...base, regularizacion2026: true });
    expect(f.caducidadDerivada).toBe("2027-08-15");
    expect(f.fechaCaducidad).toBe("");
  });

  it("sin el flag y sin servicio, la fecha de resolución no inventa ninguna caducidad", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "15/08/2026", ""]], base);
    expect(f.fechaCaducidad).toBe("");
    expect(f.caducidadDerivada).toBe("");
  });

  it("una caducidad explícita SIEMPRE gana: no se deriva nada", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "15/08/2026", "01/03/2028"]], { ...base, regularizacion2026: true });
    expect(f.fechaCaducidad).toBe("2028-03-01");
    expect(f.caducidadDerivada).toBe("");
  });

  it("masUnAno respeta el 29 de febrero (año no bisiesto → 1 de marzo)", () => {
    expect(masUnAno("2028-02-29")).toBe("2029-03-01");
    expect(masUnAno("no es fecha")).toBe("");
  });
});

describe("caducidad derivada del servicio (Vigía estimada por validez legal)", () => {
  const m: Mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "tramite" }, { indice: 2, campo: "fechaResolucion" }],
    tramites: { "Arraigo social": "arraigo_social", "Renovación": "renovacion_tie", "Nacionalidad": "nacionalidad" },
    estados: {}, crearHistorial: true, crearFamilias: false,
  };

  it("arraigo social (12 meses) → caducidad al año siguiente; expone fechaResolucion", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "Arraigo social", "15/03/2026"]], m);
    expect(f.servicio).toBe("arraigo_social");
    expect(f.caducidadDerivada).toBe("2027-03-15");
    expect(f.fechaResolucion).toBe("2026-03-15");
  });

  it("renovación de TIE (48 meses) → caducidad a 4 años", () => {
    const [f] = aplicarMapeo([["Chen Wei", "Renovación", "10/06/2025"]], m);
    expect(f.caducidadDerivada).toBe("2029-06-10");
  });

  it("nacionalidad no caduca → sin caducidad derivada", () => {
    const [f] = aplicarMapeo([["José Ruiz", "Nacionalidad", "01/02/2024"]], m);
    expect(f.servicio).toBe("nacionalidad");
    expect(f.caducidadDerivada).toBe("");
  });

  it("una caducidad explícita gana sobre la derivada del servicio", () => {
    const m2: Mapeo = { ...m, columnas: [...m.columnas, { indice: 3, campo: "fechaCaducidad" }] };
    const [f] = aplicarMapeo([["Ana Pérez", "Arraigo social", "15/03/2026", "20/12/2028"]], m2);
    expect(f.fechaCaducidad).toBe("2028-12-20");
    expect(f.caducidadDerivada).toBe("");
  });
});

describe("importar — motor determinista", () => {
  it("fila típica de Excel casero: nombre completo con coma, NIE, teléfono sin prefijo, fechas ES", () => {
    const [f] = aplicarMapeo([["GARCÍA LÓPEZ, MARÍA", "X1234567L", "612 345 678", "Arraigo social", "Terminado", "15/03/2027", "Familia García", "ignorar"]], mapeo);
    expect(f.ficha.nombre).toBe("MARÍA");
    expect(f.ficha.apellidos).toBe("GARCÍA LÓPEZ");
    expect(f.ficha.numeroDocumento).toBe("X1234567L");
    expect(f.ficha.telefono).toBe("+34612345678");
    expect(f.servicio).toBe("arraigo_social");
    expect(f.estado).toBe("FINALIZADO");
    expect(f.fechaCaducidad).toBe("2027-03-15");
    expect(f.familia).toBe("Familia García");
    expect(f.avisos).toEqual([]);
  });

  it("documento no NIE/DNI → pasaporte; sin estado → FINALIZADO; trámite sin mapear → aviso sin expediente", () => {
    const m: Mapeo = { ...mapeo, estados: {} };
    const [f] = aplicarMapeo([["Aissatou Diallo", "AB1234567", "+221771234567", "Nacionalidad", "", "", "", ""]], m);
    expect(f.ficha.pasaporte).toBe("AB1234567");
    expect(f.ficha.numeroDocumento).toBeUndefined();
    expect(f.ficha.telefono).toBe("+221771234567");
    expect(f.servicio).toBeNull();
    expect(f.avisos.some((a) => a.includes("Trámite sin mapear"))).toBe(true);
  });

  it("estado FINALIZADO por defecto cuando hay servicio y ninguna columna de estado", () => {
    const m: Mapeo = { ...mapeo, columnas: mapeo.columnas.filter((c) => c.campo !== "estado") };
    const [f] = aplicarMapeo([["Chen Wei", "Z7654321R", "699111222", "Renovación TIE", "lo-que-sea", "", "", ""]], m);
    expect(f.servicio).toBe("renovacion_tie");
    expect(f.estado).toBe("FINALIZADO");
  });

  it("duplicados internos por NIE marcados una sola vez", () => {
    const filas = aplicarMapeo([
      ["Ana Pérez", "Y1111111Z", "", "", "", "", "", ""],
      ["Ana Perez Bis", "Y1111111Z", "", "", "", "", "", ""],
    ], mapeo);
    marcarDuplicadosInternos(filas);
    expect(filas[0].avisos).toEqual([]);
    expect(filas[1].avisos.some((a) => a.includes("Duplicado"))).toBe(true);
  });

  it("helpers: nombre sin coma, teléfono 00-prefijo, NIE con separadores", () => {
    expect(partirNombreCompleto("María del Mar Ruiz")).toEqual({ nombre: "María", apellidos: "del Mar Ruiz" });
    expect(normalizarTelefono("0034 612345678")).toBe("+34612345678");
    expect(esNie("x-1234567-l")).toBe(true);
  });
});
