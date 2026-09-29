import { describe, expect, it } from "vitest";
import { avisoDeEnvio, diaMadrid, esDeExtranjeria, huellaLema, numeroOficialEnTexto } from "@/lib/dehu/envios";
import type { EnvioDehu } from "@/lib/dehu/soap";

const envio = (o: Partial<EnvioDehu> & { emisor?: string; raiz?: string } = {}): EnvioDehu => ({
  identificador: "N123", codigoOrigen: "2", concepto: "Requerimiento de documentación", descripcion: null,
  organismo: { codigo: "E04995901", nombre: o.emisor ?? "Subdelegación del Gobierno en Valencia", nif: null },
  organismoRaiz: { codigo: "E05068001", nombre: o.raiz ?? "Ministerio de Política Territorial", nif: null },
  fechaPuestaDisposicion: "2026-09-29T10:15:00+02:00", tipoEnvio: 2, vinculo: 1,
  titular: { nombre: "GESTORIA EJEMPLO SL", nif: "B12345674" }, metadatosPublicos: null, estado: null, receptor: null,
  ...o,
});

describe("solo entra lo de extranjería", () => {
  it.each([
    ["Subdelegación del Gobierno en Valencia", true],
    ["Oficina de Extranjería de Barcelona", true],
    ["Dirección General de la Policía", true],
    ["Dirección General de Gestión Migratoria", true],
    ["Ministerio de Justicia", true],
    ["Consulado General de España en Bogotá", true],
    ["Agencia Estatal de Administración Tributaria", false],
    ["Tesorería General de la Seguridad Social", false],
    ["Dirección General de Tráfico", false],
  ])("%s → %s", (emisor, esperado) => {
    expect(esDeExtranjeria(envio({ emisor }))).toBe(esperado);
  });

  it("el ministerio raíz no basta: Inclusión también es la Seguridad Social", () => {
    expect(esDeExtranjeria(envio({ emisor: "Tesorería General de la Seguridad Social", raiz: "Ministerio de Inclusión, Seguridad Social y Migraciones" }))).toBe(false);
  });

  it("emisor genérico: decide el asunto; lo fiscal nunca entra aunque hable de residencia", () => {
    expect(esDeExtranjeria(envio({ emisor: "Ministerio de Inclusión, Seguridad Social y Migraciones", concepto: "Resolución autorización de residencia y trabajo" }))).toBe(true);
    expect(esDeExtranjeria(envio({ emisor: "Ministerio de Inclusión, Seguridad Social y Migraciones", concepto: "Subvención" }))).toBe(false);
    expect(esDeExtranjeria(envio({ emisor: "Agencia Estatal de Administración Tributaria", concepto: "Certificado de residencia fiscal" }))).toBe(false);
  });
});

describe("el aviso que se guarda", () => {
  const ahora = new Date("2026-09-30T08:00:00Z");

  it("notificación a nombre del despacho: 10 días naturales para abrirla, sin NIE que proponer", () => {
    const a = avisoDeEnvio(envio(), "B12345674", ahora);
    expect(a.huella).toBe(huellaLema("N123"));
    expect(a.tipo).toBe("AVISO");
    expect(a.nie).toBeNull();
    expect(a.titularNombre).toBeNull();
    expect(a.fechaPuestaDisposicion).toBe("2026-09-29");
    expect(a.fechaLimite).toBe(new Date(new Date("2026-09-29T10:15:00+02:00").getTime() + 10 * 86_400_000).toISOString());
    expect(a.aviso).toMatchObject({ canal: "LEMA", identificador: "N123", codigoOrigen: "2", tipoEnvio: 2 });
  });

  it("notificación de un cliente al que el despacho representa: su NIE sirve para proponer el expediente", () => {
    const a = avisoDeEnvio(envio({ vinculo: 2, titular: { nombre: "AHMED BENALI", nif: "X1234567L" } }), "B12345674", ahora);
    expect(a.nie).toBe("X1234567L");
    expect(a.titularNombre).toBe("AHMED BENALI");
  });

  it("una comunicación no tiene plazo para abrirla", () => {
    expect(avisoDeEnvio(envio({ tipoEnvio: 1 }), "B12345674", ahora).fechaLimite).toBeNull();
  });

  it("nº oficial citado en el asunto, con otra puntuación", () => {
    const cands = [{ numeroOficial: "46/2026/001234" }, { numeroOficial: "08-203456-2026" }, { numeroOficial: null }];
    expect(numeroOficialEnTexto("Requerimiento exp. 46 2026 001234 (Valencia)", cands)).toBe("46/2026/001234");
    expect(numeroOficialEnTexto("Resolución expediente 082034562026", cands)).toBe("08-203456-2026");
    expect(numeroOficialEnTexto("Requerimiento de documentación", cands)).toBeNull();
  });

  it("día de Madrid de una fecha de la DEHú", () => {
    expect(diaMadrid("2026-09-29T23:30:00Z")).toBe("2026-09-30");
    expect(diaMadrid("no es fecha")).toBeNull();
  });
});
