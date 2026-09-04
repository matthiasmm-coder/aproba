import { describe, it, expect } from "vitest";
import { construirMemoria, resolucionDe, type EntradaMemoria } from "./memoria";

// La memoria es un documento que sale hacia la Administración (art. 8.1.f): lo que se
// prueba aquí es que no MIENTE — ni infla, ni se come actuaciones, ni depende de que
// el despacho mueva las tarjetas del tablero.

const base = (p: Partial<EntradaMemoria> = {}): EntradaMemoria => ({
  desde: "2026-01-01",
  hasta: "2026-12-31",
  expedientes: [],
  eventos: [],
  servicios: {},
  miembros: [],
  sedes: 0,
  ...p,
});

const exp = (id: string, createdAt: string, o: Partial<EntradaMemoria["expedientes"][number]> = {}) => ({
  id, createdAt, tipo: "ARRAIGO_SOCIAL", estado: "DOCS_PENDIENTES", clienteId: `c-${id}`, ...o,
});

describe("memoria de actividad · art. 8.1.f", () => {
  it("cuenta como tramitado el expediente ANTIGUO que tuvo actuaciones dentro del período", () => {
    // El caso real: expediente abierto en 2025 sobre el que se trabajó en 2026. La
    // entidad lo tramitó en 2026 y debe poder acreditarlo.
    const m = construirMemoria(base({
      expedientes: [exp("a", "2025-11-02")],
      eventos: [{ expedienteId: "a", tipo: "DOC_VALIDADO", createdAt: "2026-03-05T10:00:00Z" }],
    }));
    expect(m.expedientesTramitados).toBe(1);
    expect(m.expedientesIniciados).toBe(0); // no se dio de alta en el período
  });

  it("no cuenta el expediente sin ninguna actividad en el período", () => {
    const m = construirMemoria(base({
      expedientes: [exp("a", "2025-11-02")],
      eventos: [{ expedienteId: "a", tipo: "DOC_VALIDADO", createdAt: "2025-11-03T10:00:00Z" }],
    }));
    expect(m.expedientesTramitados).toBe(0);
    expect(m.procedimientos).toEqual([]);
  });

  it("no depende del estado del tablero: sin un solo PRESENTADO la memoria sigue llena", () => {
    // Uso real medido (02/09): 0 de 81 expedientes marcados «presentado». Una memoria
    // que contara por estado saldría vacía siendo el trabajo cierto.
    const m = construirMemoria(base({
      expedientes: [exp("a", "2026-02-01"), exp("b", "2026-02-02")],
      eventos: [
        { expedienteId: "a", tipo: "DOC_VALIDADO", createdAt: "2026-02-03T09:00:00Z" },
        { expedienteId: "b", tipo: "FORM_GENERADO", createdAt: "2026-02-04T09:00:00Z" },
      ],
    }));
    expect(m.expedientesTramitados).toBe(2);
    expect(m.expedientesPresentados).toBe(0);
    expect(m.actuaciones.reduce((s, a) => s + a.n, 0)).toBe(2);
  });

  it("los extremos del período son inclusivos", () => {
    const m = construirMemoria(base({
      desde: "2026-03-01", hasta: "2026-03-31",
      expedientes: [exp("a", "2026-03-01T00:00:00Z"), exp("b", "2026-03-31T23:30:00Z"), exp("c", "2026-04-01T00:10:00Z")],
    }));
    expect(m.expedientesTramitados).toBe(2);
  });

  it("agrupa por la etiqueta del servicio configurado y cae al tipo oficial si no la hay", () => {
    const m = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-10", { servicioClave: "arraigo_exprés" }),
        exp("b", "2026-01-11", { servicioClave: "arraigo_exprés" }),
        exp("c", "2026-01-12", { tipo: "NACIONALIDAD" }),
      ],
      servicios: { "arraigo_exprés": "Arraigo exprés" },
    }));
    expect(m.procedimientos).toEqual([
      { label: "Arraigo exprés", n: 2 },
      { label: "Nacionalidad española", n: 1 },
    ]);
  });

  it("no parte el mismo trámite en dos líneas según venga con clave de servicio o sin ella", () => {
    // Defecto visto en datos reales: 6 expedientes con servicioClave y 2 sin ella
    // salían como «Renovación de TIE» y «Renovación TIE», dos filas para lo mismo.
    const m = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-10", { tipo: "RENOVACION", servicioClave: "renovacion_tie" }),
        exp("b", "2026-01-11", { tipo: "RENOVACION", servicioClave: null }),
      ],
      servicios: { renovacion_tie: "Renovación de TIE" },
    }));
    expect(m.procedimientos).toEqual([{ label: "Renovación de TIE", n: 2 }]);
  });

  it("cuenta PERSONAS distintas, no expedientes", () => {
    const m = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-10", { clienteId: "juan" }),
        exp("b", "2026-01-11", { clienteId: "juan" }), // renovación del mismo cliente
        exp("c", "2026-01-12", { clienteId: "ana" }),
      ],
    }));
    expect(m.expedientesTramitados).toBe(3);
    expect(m.personasAtendidas).toBe(2);
  });

  it("nunca se come una actuación de tipo desconocido", () => {
    const m = construirMemoria(base({
      expedientes: [exp("a", "2026-01-10")],
      eventos: [{ expedienteId: "a", tipo: "TIPO_FUTURO", createdAt: "2026-01-11T09:00:00Z" }],
    }));
    expect(m.actuaciones).toEqual([{ label: "Otras actuaciones", n: 1 }]);
  });

  it("el plazo medio solo usa presentaciones del período, y es null si no hay ninguna", () => {
    const conPlazo = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-01T00:00:00Z", { fechaPresentacion: "2026-01-11T00:00:00Z" }),
        exp("b", "2026-02-01T00:00:00Z", { fechaPresentacion: "2026-02-21T00:00:00Z" }),
      ],
    }));
    expect(conPlazo.expedientesPresentados).toBe(2);
    expect(conPlazo.alcance.diasMedios).toBe(15); // (10 + 20) / 2

    const sinPlazo = construirMemoria(base({ expedientes: [exp("a", "2026-01-01")] }));
    expect(sinPlazo.alcance.diasMedios).toBeNull();
  });

  it("cuenta como presentado el expediente con evento PRESENTADO aunque falte la fecha", () => {
    // La memoria no puede contradecirse: si en «actuaciones» hay 1 presentación,
    // en «alcance» no puede haber 0 expedientes presentados.
    const m = construirMemoria(base({
      expedientes: [exp("a", "2026-01-01T00:00:00Z", { fechaPresentacion: null })],
      eventos: [{ expedienteId: "a", tipo: "PRESENTADO", createdAt: "2026-01-21T00:00:00Z" }],
    }));
    const actuacionesPresentacion = m.actuaciones.find((a) => a.label === "Presentación ante la Administración")?.n ?? 0;
    expect(m.expedientesPresentados).toBe(actuacionesPresentacion);
    expect(m.expedientesPresentados).toBe(1);
    expect(m.alcance.diasMedios).toBe(20); // la fecha del evento sirve de referencia
  });

  it("normaliza las nacionalidades para no contar dos veces la misma", () => {
    const m = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-10", { nacionalidad: "Colombia" }),
        exp("b", "2026-01-11", { nacionalidad: " colombia " }),
        exp("c", "2026-01-12", { nacionalidad: "Marruecos" }),
        exp("d", "2026-01-13", { nacionalidad: null }),
      ],
    }));
    expect(m.alcance.nacionalidades).toBe(2);
  });

  it("lee el resultado de `salida` y, sin ella, del estado — como hace la migración v4", () => {
    // El cierre v4 escribe FINALIZADO/RECHAZADO, nunca RESUELTO: contar RESUELTO daba 0.
    expect(resolucionDe({ salida: "concedido", estado: "BORRADOR" })).toBe("concedidos");
    expect(resolucionDe({ salida: "denegado", estado: "FINALIZADO" })).toBe("denegados"); // salida manda
    expect(resolucionDe({ salida: "desistido", estado: "PRESENTADO" })).toBe("desistidos");
    expect(resolucionDe({ salida: "en_tramite", estado: "FINALIZADO" })).toBeNull();
    expect(resolucionDe({ salida: null, estado: "FINALIZADO" })).toBe("concedidos");
    expect(resolucionDe({ salida: null, estado: "RESUELTO" })).toBe("concedidos");
    expect(resolucionDe({ salida: null, estado: "RECHAZADO" })).toBe("denegados");
    expect(resolucionDe({ salida: null, estado: "PRESENTADO" })).toBeNull();

    const m = construirMemoria(base({
      expedientes: [
        exp("a", "2026-01-10", { salida: "concedido" }),
        exp("b", "2026-01-11", { estado: "FINALIZADO" }),
        exp("c", "2026-01-12", { salida: "denegado" }),
        exp("d", "2026-01-13", { salida: "en_tramite", estado: "PRESENTADO" }),
      ],
    }));
    expect(m.resoluciones).toEqual({ concedidos: 2, denegados: 1, desistidos: 0 });
  });

  it("desglosa los recursos por rol", () => {
    const m = construirMemoria(base({
      miembros: [{ role: "OWNER" }, { role: "GESTOR" }, { role: "GESTOR" }],
      sedes: 2,
    }));
    expect(m.recursos.personas).toBe(3);
    expect(m.recursos.sedes).toBe(2);
    expect(m.recursos.porRol).toEqual([{ rol: "Tramitación", n: 2 }, { rol: "Dirección", n: 1 }]);
  });
});
