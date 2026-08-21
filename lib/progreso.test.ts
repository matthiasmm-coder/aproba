import { describe, it, expect } from "vitest";
import { normalizarEstado, calcularProgreso, docsCompletos, faseDe, type Hechos } from "./progreso";

const base: Hechos = {
  estado: "EN_PREPARACION",
  serviciosResueltos: 1,
  docsRequeridos: [],
  tiposValidados: [],
  docsTotales: 0,
  docsValidados: 0,
  formulariosCurados: false,
  tieneTasa: false,
  encargoFirmado: false,
  encargoAplica: false,
  anticipoPagado: false,
  citaPresencial: false,
  fechaCita: null,
  arrancado: false,
};

describe("normalizarEstado — las filas antiguas no pueden romper nada", () => {
  it("los 4 estados de trabajo se funden en EN_PREPARACION", () => {
    for (const v of ["BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO"]) {
      expect(normalizarEstado(v)).toBe("EN_PREPARACION");
    }
  });

  // La cita deja de ser un estado (pasa a ser un hecho): un expediente con cita agendada
  // está resuelto, no cerrado — si cayera en FINALIZADO desaparecería de «en curso».
  it("CITA_HUELLAS pasa a RESUELTO, nunca a FINALIZADO", () => {
    expect(normalizarEstado("CITA_HUELLAS")).toBe("RESUELTO");
  });

  it("los estados que sobreviven no se tocan", () => {
    for (const v of ["PRESENTADO", "RESUELTO", "RECHAZADO", "FINALIZADO"]) {
      expect(normalizarEstado(v)).toBe(v);
    }
  });

  it("un valor desconocido o vacío no revienta: cae en preparación", () => {
    expect(normalizarEstado(null)).toBe("EN_PREPARACION");
    expect(normalizarEstado("")).toBe("EN_PREPARACION");
    expect(normalizarEstado("LO_QUE_SEA")).toBe("EN_PREPARACION");
  });
});

describe("documentos completos", () => {
  it("compara por tipo, no por cantidad (dos labels pueden mapear el mismo tipo)", () => {
    const r = docsCompletos({
      docsRequeridos: ["Pasaporte", "Certificado de empadronamiento"],
      tiposValidados: ["PASAPORTE"],
      docsTotales: 1, docsValidados: 1,
    });
    expect(r.completo).toBe(false);
    expect(r.recibidos).toBe(1);
    expect(r.faltan).toEqual(["Certificado de empadronamiento"]);
  });

  // El fallo que había que evitar: un expediente recién creado, sin requisitos
  // configurados y sin nada subido, NO puede contarse como «documentación completa».
  it("sin requisitos y sin documentos NO es completo (nada de vacuidad)", () => {
    expect(docsCompletos({ docsRequeridos: [], tiposValidados: [], docsTotales: 0, docsValidados: 0 }).completo).toBe(false);
  });

  it("sin requisitos configurados vale «todo lo subido está validado»", () => {
    expect(docsCompletos({ docsRequeridos: [], tiposValidados: ["PASAPORTE"], docsTotales: 2, docsValidados: 2 }).completo).toBe(true);
    expect(docsCompletos({ docsRequeridos: [], tiposValidados: ["PASAPORTE"], docsTotales: 2, docsValidados: 1 }).completo).toBe(false);
  });
});

describe("hitos monótonos — el seguimiento del cliente jamás retrocede", () => {
  // 18 clientes reales están en DOCS_VALIDADOS/FORM_GENERADO con documentos derivados
  // incompletos (el gestor forzó el avance). Su hito público ya estaba marcado.
  it("un expediente marcado como validado en la migración conserva su hito", () => {
    const p = calcularProgreso({ ...base, docsRequeridos: ["Pasaporte", "Nómina"], tiposValidados: [], docsDadosPorValidados: true });
    expect(p.hitos.docs).toBe(true);
    expect(p.docs.completo).toBe(false); // la verdad interna sigue siendo «faltan»
    expect(p.docs.faltan).toHaveLength(2); // y el gestor la ve
  });

  it("un expediente presentado marca TODOS los hitos anteriores", () => {
    const p = calcularProgreso({ ...base, estado: "PRESENTADO", docsRequeridos: ["Pasaporte"], tiposValidados: [], formulariosCurados: false });
    expect(p.hitos.docs).toBe(true);
    expect(p.hitos.formularios).toBe(true);
    expect(p.hitos.arrancado).toBe(true);
  });

  it("sin marcador ni presentación, el hito dice la verdad", () => {
    const p = calcularProgreso({ ...base, docsRequeridos: ["Pasaporte"], tiposValidados: [] });
    expect(p.hitos.docs).toBe(false);
  });
});

describe("formularios: la curación vacía cuenta como hecha", () => {
  // Un servicio sin formulario oficial: el gestor cura «ninguno». Si [] no contara,
  // la tarjeta repetiría «Generar formularios» para siempre.
  it("curación explícita vacía cierra el paso", () => {
    const p = calcularProgreso({ ...base, formulariosCurados: true });
    expect(p.hitos.formularios).toBe(true);
    expect(p.accion.clave).toBe("presentar");
  });

  it("solo la tasa también cuenta", () => {
    expect(calcularProgreso({ ...base, tieneTasa: true }).hitos.formularios).toBe(true);
  });
});

describe("acción siguiente — ninguna tarjeta muda", () => {
  it("sin servicio resuelto se pide elegir, no «esperando documentos»", () => {
    const p = calcularProgreso({ ...base, serviciosResueltos: 0, docsRequeridos: [] });
    expect(p.accion.clave).toBe("elegir_servicio");
    expect(p.accion.espera).toBe(false);
  });

  it("con documentos que faltan, la pelota está en el cliente", () => {
    const p = calcularProgreso({ ...base, docsRequeridos: ["Pasaporte"], tiposValidados: [] });
    expect(p.accion.clave).toBe("esperando_docs");
    expect(p.accion.espera).toBe(true);
  });

  it("documentos completos y sin formularios → generar", () => {
    const p = calcularProgreso({ ...base, docsRequeridos: ["Pasaporte"], tiposValidados: ["PASAPORTE"] });
    expect(p.accion.clave).toBe("generar_formularios");
  });

  // El caso que bloqueaba a Juan: servicio con 0 documentos configurados. Antes se
  // quedaba en «esperando documentos» eternamente.
  it("servicio sin documentos configurados no espera a nadie", () => {
    const p = calcularProgreso({ ...base, serviciosResueltos: 1, docsRequeridos: [], docsTotales: 1, docsValidados: 1 });
    expect(p.accion.clave).toBe("generar_formularios");
  });

  it("presentado espera resolución; no hay acción del gestor", () => {
    expect(calcularProgreso({ ...base, estado: "PRESENTADO" }).accion).toMatchObject({ clave: "esperando_resolucion", espera: true });
  });

  // Sin esta rama, «Finalizar» era inalcanzable tras suprimir CITA_HUELLAS.
  it("resuelto con cita presencial pendiente → agendar; ya agendada → finalizar", () => {
    expect(calcularProgreso({ ...base, estado: "RESUELTO", citaPresencial: true, fechaCita: null }).accion.clave).toBe("agendar_cita");
    expect(calcularProgreso({ ...base, estado: "RESUELTO", citaPresencial: true, fechaCita: "2026-09-12" }).accion.clave).toBe("finalizar");
    expect(calcularProgreso({ ...base, estado: "RESUELTO", citaPresencial: false }).accion.clave).toBe("finalizar");
  });

  it("un expediente legado en CITA_HUELLAS con fecha ofrece finalizar, no re-agendar", () => {
    const p = calcularProgreso({ ...base, estado: "CITA_HUELLAS", citaPresencial: true, fechaCita: "2026-09-12" });
    expect(p.estado).toBe("RESUELTO");
    expect(p.accion.clave).toBe("finalizar");
  });
});

describe("fases del board — nadie desaparece del tablero", () => {
  it("cada estado cae en una fase, siempre", () => {
    for (const e of ["EN_PREPARACION", "PRESENTADO", "RESUELTO", "RECHAZADO", "FINALIZADO"] as const) {
      expect(["recepcion", "preparacion", "presentacion", "cierre"]).toContain(faseDe(e, false, false));
    }
  });

  it("la frontera recepción/preparación se deriva del avance", () => {
    expect(faseDe("EN_PREPARACION", false, false)).toBe("recepcion");
    expect(faseDe("EN_PREPARACION", true, false)).toBe("preparacion");
    expect(faseDe("EN_PREPARACION", false, true)).toBe("preparacion"); // formularios generados con docs incompletos
  });

  it("los denegados van con la presentación, no al cierre", () => {
    expect(faseDe("RECHAZADO", true, true)).toBe("presentacion");
  });

  it("un valor legado cualquiera sigue teniendo fase", () => {
    const p = calcularProgreso({ ...base, estado: "DOCS_VALIDADOS" });
    expect(p.fase).toBeDefined();
  });
});

describe("score de orden intra-fase", () => {
  it("progresa con el avance real", () => {
    const vacio = calcularProgreso({ ...base, docsRequeridos: ["A", "B"], tiposValidados: [] }).score;
    const medio = calcularProgreso({ ...base, docsRequeridos: ["A", "B"], tiposValidados: ["A"], arrancado: true }).score;
    const listo = calcularProgreso({ ...base, docsRequeridos: ["A", "B"], tiposValidados: ["A", "B"], arrancado: true, formulariosCurados: true }).score;
    expect(vacio).toBeLessThan(medio);
    expect(medio).toBeLessThan(listo);
    expect(listo).toBeLessThan(calcularProgreso({ ...base, estado: "PRESENTADO" }).score);
  });
});
