import { describe, expect, it } from "vitest";
import {
  aplicarMapeo, aplicarOverrides, marcarDuplicadosInternos, partirNombreCompleto,
  normalizarTelefono, esNie, parseImporte, type Mapeo,
  ESTADOS_EN_CURSO, esEstadoEnCurso,
} from "./importar";

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
  validezMeses: {},
  estados: { "Terminado": "FINALIZADO", "En trámite": "PRESENTADO" },
  crearHistorial: true,
  crearFamilias: true,
};

// La renovación se deduce de la NATURALEZA del trámite (validez legal de la tarjeta que
// produce), no de un interruptor global: cada trámite lleva sus propios meses.
describe("renovación deducida por trámite", () => {
  const base: Mapeo = {
    columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "tramite" }, { indice: 2, campo: "fechaResolucion" }, { indice: 3, campo: "fechaCaducidad" }],
    tramites: { "Regularización DA 21": null, "Renovación": "renovacion_tie", "Nacionalidad": "nacionalidad", "Arraigo social": "arraigo_social" },
    validezMeses: { "Regularización DA 21": 12, "Renovación": 48, "Nacionalidad": null },
    estados: {}, crearHistorial: true, crearFamilias: false,
  };

  it("regularización 2026 (sin servicio en el catálogo) → renovación al año", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "Regularización DA 21", "30/06/2026", ""]], base);
    expect(f.servicio).toBeNull();
    expect(f.caducidadDerivada).toBe("2027-06-30");
  });

  it("renovación de TIE → 4 años", () => {
    const [f] = aplicarMapeo([["Chen Wei", "Renovación", "10/06/2025", ""]], base);
    expect(f.caducidadDerivada).toBe("2029-06-10");
  });

  it("nacionalidad (validez null) → ningún vencimiento", () => {
    const [f] = aplicarMapeo([["José Ruiz", "Nacionalidad", "01/02/2024", ""]], base);
    expect(f.caducidadDerivada).toBe("");
  });

  it("sin validez propuesta → repli sobre la validez legal del servicio del catálogo", () => {
    const [f] = aplicarMapeo([["Nour Haddad", "Arraigo social", "12/01/2026", ""]], base);
    expect(f.caducidadDerivada).toBe("2027-01-12"); // arraigo = 12 meses
  });

  it("una caducidad explícita SIEMPRE gana: no se deduce nada", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "Regularización DA 21", "30/06/2026", "01/03/2028"]], base);
    expect(f.fechaCaducidad).toBe("2028-03-01");
    expect(f.caducidadDerivada).toBe("");
  });

  it("expone el trámite bruto y la fecha del servicio para la revisión", () => {
    const [f] = aplicarMapeo([["Ana Pérez", "Regularización DA 21", "30/06/2026", ""]], base);
    expect(f.tramite).toBe("Regularización DA 21");
    expect(f.fechaResolucion).toBe("2026-06-30");
  });
});

describe("aplicarOverrides — correcciones del gestor antes de importar", () => {
  const filaBase = () => aplicarMapeo([["GARCÍA LÓPEZ, MARÍA", "X1234567L", "612345678", "Arraigo social", "Terminado", "15/03/2027", "Familia García", ""]], mapeo);

  it("corrige nombre, teléfono y email", () => {
    const filas = filaBase();
    aplicarOverrides(filas, { 0: { nombre: "Maria Luisa", telefono: "699 88 77 66", email: "  maria@email.com " } });
    expect(filas[0].ficha.nombre).toBe("Maria Luisa");
    expect(filas[0].ficha.telefono).toBe("+34699887766");
    expect(filas[0].ficha.email).toBe("maria@email.com");
  });

  it("una fecha escrita por el gestor manda y anula la estimada", () => {
    const filas = aplicarMapeo([["Ana Pérez", "", "", "Arraigo social", "", "", "", ""]], { ...mapeo, columnas: [...mapeo.columnas, { indice: 8, campo: "fechaResolucion" }] });
    aplicarOverrides(filas, { 0: { caducidad: "2030-05-01" } });
    expect(filas[0].fechaCaducidad).toBe("2030-05-01");
    expect(filas[0].caducidadDerivada).toBe("");
  });

  it("vaciar la fecha deja al cliente sin vencimiento", () => {
    const filas = filaBase();
    expect(filas[0].fechaCaducidad).toBe("2027-03-15");
    aplicarOverrides(filas, { 0: { caducidad: "" } });
    expect(filas[0].fechaCaducidad).toBe("");
    expect(filas[0].caducidadDerivada).toBe("");
  });

  it("excluir marca la fila como descartada", () => {
    const filas = filaBase();
    expect(filas[0].excluir).toBe(false);
    aplicarOverrides(filas, { 0: { excluir: true } });
    expect(filas[0].excluir).toBe(true);
  });

  it("sin overrides no toca nada", () => {
    const filas = filaBase();
    aplicarOverrides(filas, undefined);
    expect(filas[0].ficha.nombre).toBe("MARÍA");
    expect(filas[0].excluir).toBe(false);
  });
});

describe("parseImporte — montants historiques (info, no factura)", () => {
  it("varios formatos españoles e ingleses", () => {
    expect(parseImporte("690€")).toBe(690);
    expect(parseImporte("1.290,50 €")).toBe(1290.5);
    expect(parseImporte("300")).toBe(300);
    expect(parseImporte("150.50")).toBe(150.5);
    expect(parseImporte("28.470 €")).toBe(28470);
    expect(parseImporte("1.000.000")).toBe(1000000);
    expect(parseImporte("")).toBeNull();
    expect(parseImporte("—")).toBeNull();
  });
  it("aplicarMapeo captura el importe de la columna", () => {
    const m: Mapeo = {
      columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "importe" }],
      tramites: {}, validezMeses: {}, estados: {}, crearHistorial: true, crearFamilias: false,
    };
    const [f] = aplicarMapeo([["Ana Pérez", "690€"]], m);
    expect(f.importe).toBe(690);
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

  it("documento no NIE/DNI → pasaporte; sin estado → FINALIZADO; trámite sin mapear → aviso sin servicio", () => {
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

describe("expedientes EN CURSO (crearEnCurso, 15/09/2026)", () => {
  const cab = ["Nombre", "Apellidos", "Trámite", "Estado"];
  const mapeoBase = {
    columnas: cab.map((_, i) => ({ indice: i, campo: (["nombre", "apellidos", "tramite", "estado"] as const)[i] })),
    tramites: { "Arraigo social": "arraigo_social", "Cosa rara": null },
    validezMeses: {},
    estados: { "En preparación": "EN_PREPARACION", "Presentado": "PRESENTADO", "Resuelto": "RESUELTO" },
    crearHistorial: true, crearFamilias: false,
  };
  const filas = [
    ["Ana", "García", "Arraigo social", "En preparación"],
    ["Luis", "Pérez", "Arraigo social", "Presentado"],
    ["Eva", "Ruiz", "Arraigo social", "Resuelto"],
    ["Tom", "Vidal", "Cosa rara", "En preparación"],
  ];
  it("sin la opción, nada cambia: todo va al historial", () => {
    const out = aplicarMapeo(filas, { ...mapeoBase });
    expect(out.map((f) => f.enCurso)).toEqual([false, false, false, false]);
    expect(out[0].servicio).toBe("arraigo_social");
    expect(out[0].estado).toBe("EN_PREPARACION");
  });
  it("con la opción, solo los trámites vivos con servicio del catálogo abren expediente", () => {
    const out = aplicarMapeo(filas, { ...mapeoBase, crearEnCurso: true });
    expect(out.map((f) => f.enCurso)).toEqual([true, true, false, false]);
    expect(out[2].estado).toBe("RESUELTO"); // pasado → historial
    expect(out[3].servicio).toBeNull();
    expect(out[3].avisos.some((a) => a.includes("no se abre expediente"))).toBe(true);
  });
  it("la opción funciona aunque el historial esté desmarcado (el servicio se resuelve igual)", () => {
    const out = aplicarMapeo(filas, { ...mapeoBase, crearHistorial: false, crearEnCurso: true });
    expect(out[0].enCurso).toBe(true);
    expect(out[0].servicio).toBe("arraigo_social");
    expect(out[2].servicio).toBe("arraigo_social");
    expect(out[2].enCurso).toBe(false);
  });
  it("esEstadoEnCurso: solo EN_PREPARACION y PRESENTADO", () => {
    expect(ESTADOS_EN_CURSO).toEqual(["EN_PREPARACION", "PRESENTADO"]);
    expect(esEstadoEnCurso("RESUELTO")).toBe(false);
    expect(esEstadoEnCurso("PRESENTADO")).toBe(true);
  });
});

describe("fecha de presentación (15/09/2026)", () => {
  const cab = ["Nombre", "Trámite", "Estado", "Fecha de presentación", "Fecha de resolución"];
  const base = {
    columnas: cab.map((_, i) => ({ indice: i, campo: (["nombre", "tramite", "estado", "fechaPresentacion", "fechaResolucion"] as const)[i] })),
    tramites: { "Arraigo social": "arraigo_social" }, validezMeses: {},
    estados: { "En preparación": "EN_PREPARACION", "Presentado": "PRESENTADO", "Resuelto": "RESUELTO" },
    crearHistorial: true, crearEnCurso: true, crearFamilias: false,
  };
  it("se lee en formato español y viaja en la fila", () => {
    const [f] = aplicarMapeo([["Ana", "Arraigo social", "Presentado", "20/08/2026", ""]], base);
    expect(f.fechaPresentacion).toBe("2026-08-20");
    expect(f.estado).toBe("PRESENTADO");
    expect(f.enCurso).toBe(true);
  });
  it("«en preparación» con fecha de presentación → presentado, con aviso visible", () => {
    const [f] = aplicarMapeo([["Ana", "Arraigo social", "En preparación", "20/08/2026", ""]], base);
    expect(f.estado).toBe("PRESENTADO");
    expect(f.avisos.some((a) => a.includes("se importa como presentado"))).toBe(true);
  });
  it("sin columna de estado no se infiere nada: sigue siendo historial (FINALIZADO)", () => {
    const sinEstado = { ...base, columnas: base.columnas.filter((c) => c.campo !== "estado") };
    const [f] = aplicarMapeo([["Ana", "Arraigo social", "Presentado", "20/08/2026", ""]], sinEstado);
    expect(f.estado).toBe("FINALIZADO");
    expect(f.enCurso).toBe(false);
  });
  it("fecha inválida → aviso, sin fecha", () => {
    const [f] = aplicarMapeo([["Ana", "Arraigo social", "Presentado", "ayer", ""]], base);
    expect(f.fechaPresentacion).toBe("");
    expect(f.avisos.some((a) => a.startsWith("Fecha de presentación no válida"))).toBe(true);
  });
  it("un trámite resuelto con fecha de presentación va al historial, no al tablero", () => {
    const [f] = aplicarMapeo([["Ana", "Arraigo social", "Resuelto", "20/02/2026", "10/06/2026"]], base);
    expect(f.enCurso).toBe(false);
    expect(f.estado).toBe("RESUELTO");
    expect(f.fechaResolucion).toBe("2026-06-10");
  });
});

// Columna «empresa» (Luis, Asenjo 21/09/2026): la razón social viaja tal cual en la fila;
// el vínculo (Empresa + Cliente.empresaId) lo hace el ejecutor, idempotente por nombre.
describe("columna empresa", () => {
  it("conserva la razón social limpia y queda vacía cuando la fila no la trae", () => {
    const m: Mapeo = { ...mapeo, columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "empresa" }] };
    const [a, b] = aplicarMapeo([["Amadou Ba", "  Talleres   Ebro S.L. "], ["Fatima Benali", ""]], m);
    expect(a.empresa).toBe("Talleres Ebro S.L.");
    expect(b.empresa).toBe("");
    expect(a.ficha.nombre).toBe("Amadou");
  });
});

// Nº de expediente OFICIAL (pedido de Matthias, 23/09/2026): antes la columna «Nº
// expediente» del Excel del despacho solo podía ir a «referencia» (nota «ref. anterior»).
describe("columna nº de expediente oficial", () => {
  it("se lee limpio y en mayúsculas, aparte de la referencia interna", () => {
    const m: Mapeo = { ...mapeo, columnas: [{ indice: 0, campo: "nombreCompleto" }, { indice: 1, campo: "numeroOficial" }, { indice: 2, campo: "referencia" }] };
    const [a, b] = aplicarMapeo([["Oksana Koval", "  ba/0045/2025 ", "2024-118"], ["Karim Benali", "", ""]], m);
    expect(a.numeroOficial).toBe("BA/0045/2025");
    expect(a.referencia).toBe("2024-118");
    expect(b.numeroOficial).toBe("");
  });
});
