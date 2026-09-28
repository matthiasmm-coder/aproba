import { describe, expect, it } from "vitest";
import {
  avisoQueCierra, diasHasta, esCandidatoAvisoDehu, etiquetaNotificacion, fechaLimiteSugerida, limiteParaAbrir, normalizarAvisoLeido,
  normalizarNotificacionLeida, sugerirExpediente, type AvisoPendiente, type ExpedienteCandidato,
} from "@/lib/notificaciones-dehu";

describe("notificaciones DEHú · lectura normalizada", () => {
  it("se queda con lo válido y descarta lo inventable", () => {
    const n = normalizarNotificacionLeida({
      tipo: "requerimiento", organismo: "  Oficina de Extranjería de  Valencia ", nie: "y-0000000.z", pasaporte: "p 1234567",
      numero_expediente: " 460020260012345 ", fecha_acto: "2026-09-20", fecha_notificacion: "2026-02-30",
      plazo: 10, plazo_tipo: "habiles", documentos: ["Contrato de trabajo", "", 7],
      tasas: [{ modelo: "790-052", importe: "38.28" }, { modelo: "", importe: 3 }], confianza: 1.7,
      empresa_nif: "b-12345678", cita: { fecha: "2026-10-20", hora: "9.30h", lugar: "Comisaría de Sants" }, tipo_extra: "x",
    });
    expect(n.tipo).toBe("REQUERIMIENTO");
    expect(n.organismo).toBe("Oficina de Extranjería de Valencia");
    expect(n.nie).toBe("Y0000000Z");
    expect(n.pasaporte).toBe("P1234567");
    expect(n.numeroExpediente).toBe("460020260012345");
    expect(n.fechaActo).toBe("2026-09-20");
    expect(n.fechaNotificacion).toBeNull(); // 30 de febrero no existe
    expect(n.plazo).toBe(10);
    expect(n.plazoTipo).toBe("HABILES");
    expect(n.empresaNif).toBe("B12345678");
    expect(n.cita).toEqual({ fecha: "2026-10-20", hora: "09:30", lugar: "Comisaría de Sants" });
    expect(n.documentos).toEqual(["Contrato de trabajo"]); // lo que no es texto se descarta
    expect(n.tasas).toEqual([{ modelo: "790-052", importe: 38.28 }]);
    expect(n.confianza).toBe(1);
  });
  it("un tipo desconocido es OTRA; un documento que no es notificación se marca", () => {
    const n = normalizarNotificacionLeida({ tipo: "carta de amor", es_notificacion: false, nie: "12345" });
    expect(n.tipo).toBe("OTRA");
    expect(n.esNotificacion).toBe(false);
    expect(n.nie).toBeNull();
    // AVISO y VERIFICACION solo vienen de un email, nunca de un PDF.
    expect(normalizarNotificacionLeida({ tipo: "AVISO" }).tipo).toBe("OTRA");
    // Un plazo en meses se acota a 12; sin tipo, días hábiles.
    expect(normalizarNotificacionLeida({ plazo: 40, plazo_tipo: "MESES" }).plazo).toBeNull();
    expect(normalizarNotificacionLeida({ plazo: 15 }).plazoTipo).toBe("HABILES");
  });
});

describe("notificaciones DEHú · plazos", () => {
  it("un requerimiento: 10 días hábiles desde la notificación (sin fines de semana)", () => {
    // Lunes 5/10/2026 → 10 hábiles = lunes 19/10/2026.
    const d = fechaLimiteSugerida({ tipo: "REQUERIMIENTO", plazo: null, plazoTipo: null, fechaNotificacion: "2026-10-05" });
    expect(d?.toISOString().slice(0, 10)).toBe("2026-10-19");
  });
  it("plazo en naturales y sin plazo si no es un requerimiento", () => {
    expect(fechaLimiteSugerida({ tipo: "OTRA", plazo: 15, plazoTipo: "NATURALES", fechaNotificacion: "2026-10-01" })?.toISOString().slice(0, 10)).toBe("2026-10-16");
    // Jueves 1/10 + 10 naturales = domingo 11/10 → pasa al lunes 12/10 (art. 30.5).
    expect(fechaLimiteSugerida({ tipo: "OTRA", plazo: 10, plazoTipo: "NATURALES", fechaNotificacion: "2026-10-01" })?.toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(fechaLimiteSugerida({ tipo: "RESOLUCION_FAVORABLE", plazo: null, plazoTipo: null, fechaNotificacion: "2026-10-01" })).toBeNull();
  });
  it("plazo en meses: mismo día del mes de vencimiento, o el último si no existe (art. 30.4)", () => {
    // Recurso de reposición (1 mes) notificado el 15/09/2026 → jueves 15/10/2026.
    expect(fechaLimiteSugerida({ tipo: "RESOLUCION_DESFAVORABLE", plazo: 1, plazoTipo: "MESES", fechaNotificacion: "2026-09-15" })?.toISOString().slice(0, 10)).toBe("2026-10-15");
    // 31/01 + 1 mes → 28/02/2026, sábado → lunes 2/03.
    expect(fechaLimiteSugerida({ tipo: "RESOLUCION_DESFAVORABLE", plazo: 1, plazoTipo: "MESES", fechaNotificacion: "2026-01-31" })?.toISOString().slice(0, 10)).toBe("2026-03-02");
  });
  it("un aviso: 10 días naturales para abrirla", () => {
    expect(limiteParaAbrir(new Date("2026-09-28T09:00:00Z")).toISOString()).toBe("2026-10-08T09:00:00.000Z");
  });
});

describe("notificaciones DEHú · a qué expediente", () => {
  const exps: ExpedienteCandidato[] = [
    { id: "e1", referencia: "EXP-1", numeroOficial: "460020260012345", vivo: true, creadoAt: "2026-06-01", personas: [{ clienteId: "c1", nombre: "Ana Pérez Gómez", nie: "Y0000000Z", pasaporte: null }] },
    { id: "e2", referencia: "EXP-2", numeroOficial: null, vivo: false, creadoAt: "2025-01-01", personas: [{ clienteId: "c1", nombre: "Ana Pérez Gómez", nie: "Y0000000Z", pasaporte: null }] },
    { id: "e3", referencia: "EXP-3", numeroOficial: null, vivo: true, creadoAt: "2026-09-01", personas: [{ clienteId: "c2", nombre: "Luis Martín", nie: null, pasaporte: "AB123456" }, { clienteId: "c3", nombre: "Samir Haddad", nie: "X1111111H", pasaporte: null }] },
  ];
  it("por nº de expediente, luego NIE (el vivo más reciente), pasaporte y nombre", () => {
    expect(sugerirExpediente({ numeroExpediente: "46 0020260012345", nie: null, pasaporte: null, titularNombre: null }, exps)).toEqual({ expedienteId: "e1", clienteId: "c1", motivo: "nº de expediente" });
    expect(sugerirExpediente({ numeroExpediente: null, nie: "Y0000000Z", pasaporte: null, titularNombre: null }, exps)).toEqual({ expedienteId: "e1", clienteId: "c1", motivo: "NIE" });
    expect(sugerirExpediente({ numeroExpediente: null, nie: null, pasaporte: "AB123456", titularNombre: null }, exps)?.expedienteId).toBe("e3");
    // Trabajador de un expediente de empresa, por su NIE.
    expect(sugerirExpediente({ numeroExpediente: null, nie: "X1111111H", pasaporte: null, titularNombre: null }, exps)).toEqual({ expedienteId: "e3", clienteId: "c3", motivo: "NIE" });
    expect(sugerirExpediente({ numeroExpediente: null, nie: null, pasaporte: null, titularNombre: "ANA PEREZ GOMEZ" }, exps)?.expedienteId).toBe("e1");
  });
  it("no adivina: un nombre solo, o dos personas con el mismo dato", () => {
    expect(sugerirExpediente({ numeroExpediente: null, nie: null, pasaporte: null, titularNombre: "Ana" }, exps)).toBeNull();
    const dobles: ExpedienteCandidato[] = [
      { id: "a", referencia: "A", numeroOficial: null, vivo: true, creadoAt: "2026-01-01", personas: [{ clienteId: "x", nombre: "Juan Gil", nie: null, pasaporte: null }] },
      { id: "b", referencia: "B", numeroOficial: null, vivo: true, creadoAt: "2026-02-01", personas: [{ clienteId: "y", nombre: "Juan Gil", nie: null, pasaporte: null }] },
    ];
    expect(sugerirExpediente({ numeroExpediente: null, nie: null, pasaporte: null, titularNombre: "Juan Gil" }, dobles)).toBeNull();
  });
  it("una empresa con un solo expediente vivo, por su NIF", () => {
    const emp: ExpedienteCandidato[] = [
      { id: "x1", referencia: "X1", numeroOficial: null, vivo: true, creadoAt: "2026-03-01", empresaNif: "B12345678", personas: [{ clienteId: "t1", nombre: "Omar Ali", nie: null, pasaporte: null }] },
      { id: "x2", referencia: "X2", numeroOficial: null, vivo: false, creadoAt: "2025-03-01", empresaNif: "B12345678", personas: [{ clienteId: "t2", nombre: "Lina Sol", nie: null, pasaporte: null }] },
    ];
    expect(sugerirExpediente({ numeroExpediente: null, nie: null, pasaporte: null, titularNombre: null, empresaNif: "B12345678" }, emp)).toEqual({ expedienteId: "x1", clienteId: "t1", motivo: "NIF de la empresa" });
  });
  it("misma persona con dos expedientes vivos: se propone el cliente, no el expediente", () => {
    const dos: ExpedienteCandidato[] = [
      { id: "v1", referencia: "V1", numeroOficial: null, vivo: true, creadoAt: "2026-01-01", personas: [{ clienteId: "c", nombre: "Ana", nie: "Y0000000Z", pasaporte: null }] },
      { id: "v2", referencia: "V2", numeroOficial: null, vivo: true, creadoAt: "2026-05-01", personas: [{ clienteId: "c", nombre: "Ana", nie: "Y0000000Z", pasaporte: null }] },
    ];
    expect(sugerirExpediente({ numeroExpediente: null, nie: "Y0000000Z", pasaporte: null, titularNombre: null }, dos)).toEqual({ expedienteId: null, clienteId: "c", motivo: "NIE", candidatos: ["v2", "v1"] });
  });
});

describe("notificaciones DEHú · avisos por email", () => {
  it("filtro barato antes de la IA", () => {
    expect(esCandidatoAvisoDehu({ remitente: "no-reply@dehu.redsara.es", asunto: "Nueva notificación", texto: "" })).toBe(true);
    expect(esCandidatoAvisoDehu({ remitente: "x@gmail.com", asunto: "Fwd: aviso", texto: "Tiene una notificación en la Dirección Electrónica Habilitada única" })).toBe(true);
    expect(esCandidatoAvisoDehu({ remitente: "info@sede.gob.es", asunto: "Comunicación puesta a disposición", texto: "" })).toBe(true);
    expect(esCandidatoAvisoDehu({ remitente: "cliente@gmail.com", asunto: "Mi pasaporte", texto: "adjunto el pasaporte" })).toBe(false);
  });
  it("lectura del aviso normalizada; un enlace nunca pasa por código", () => {
    const a = normalizarAvisoLeido({ es_aviso: true, organismo: "Delegación del Gobierno", fecha_puesta_disposicion: "2026-09-28", nie: "x1111111h", codigo: "https://falso.example/verificar" });
    expect(a).toMatchObject({ esAviso: true, esVerificacion: false, organismo: "Delegación del Gobierno", fechaPuestaDisposicion: "2026-09-28", nie: "X1111111H", codigo: null });
    expect(normalizarAvisoLeido({ es_verificacion: true, codigo: "A7K-392" }).codigo).toBe("A7K-392");
  });
  it("el PDF importado cierra su aviso pendiente", () => {
    const avisos: AvisoPendiente[] = [
      { id: "a1", organismo: "Oficina de Extranjería de Barcelona", fechaPuestaDisposicion: "2026-09-25", identificador: null, numeroExpediente: null, nie: null, createdAt: "2026-09-25T08:00:00Z" },
      { id: "a2", organismo: "Oficina de Extranjería de Barcelona", fechaPuestaDisposicion: "2026-09-25", identificador: null, numeroExpediente: null, nie: null, createdAt: "2026-09-25T09:00:00Z" },
      { id: "a3", organismo: "Subdelegación del Gobierno en Girona", fechaPuestaDisposicion: "2026-09-26", identificador: "N-2026-77", numeroExpediente: null, nie: null, createdAt: "2026-09-26T08:00:00Z" },
    ];
    const pdf = { identificador: null, numeroExpediente: null, nie: null, organismo: "OFICINA DE EXTRANJERIA DE BARCELONA", fechaPuestaDisposicion: "2026-09-25" };
    expect(avisoQueCierra(pdf, avisos)).toBe("a1"); // intercambiables: el más antiguo
    expect(avisoQueCierra({ ...pdf, organismo: null, fechaPuestaDisposicion: null, identificador: "n202677" }, avisos)).toBe("a3");
    expect(avisoQueCierra({ ...pdf, organismo: "Ministerio de Justicia" }, avisos)).toBeNull();
    expect(avisoQueCierra({ ...pdf, fechaPuestaDisposicion: null }, avisos)).toBeNull();
  });
  it("etiqueta para el historial y días que quedan", () => {
    expect(etiquetaNotificacion({ tipo: "REQUERIMIENTO", fechaNotificacion: "2026-10-05" })).toBe("DEHú · Requerimiento 05/10/2026");
    expect(diasHasta("2026-10-08T09:00:00Z", new Date("2026-09-28T22:00:00Z"))).toBe(10);
    expect(diasHasta("2026-09-27T09:00:00Z", new Date("2026-09-28T08:00:00Z"))).toBe(-1);
  });
});
