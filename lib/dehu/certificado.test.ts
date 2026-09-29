import { describe, expect, it } from "vitest";
import { CertificadoInvalido, leerCertificado, nifDeAtributo } from "@/lib/dehu/certificado";
import { PERSONA_FISICA, REPRESENTANTE, SELLO, p12DePrueba } from "@/lib/dehu/certificados-prueba";

describe("certificado del despacho (.p12)", () => {
  it("persona física (FNMT): titular y receptor son la persona, con su NIF y su nombre con Ñ", () => {
    const { p12 } = p12DePrueba({ sujeto: PERSONA_FISICA });
    const c = leerCertificado(p12, "prueba-1234");
    expect(c.tipo).toBe("PERSONA_FISICA");
    expect(c.titular).toEqual({ nombre: "JUAN MUÑOZ PRADO", nif: "12345678Z" });
    expect(c.receptor).toEqual(c.titular);
    expect(c.clavePrivadaPem).toMatch(/BEGIN RSA PRIVATE KEY/);
    expect(c.certificadoDerB64.length).toBeGreaterThan(500);
    expect(c.emisor).toBe("AC FNMT Usuarios (PRUEBA)");
  });

  it("representante de persona jurídica: las notificaciones son de la sociedad, comparece la persona", () => {
    const c = leerCertificado(p12DePrueba({ sujeto: REPRESENTANTE }).p12, "prueba-1234");
    expect(c.tipo).toBe("REPRESENTANTE");
    expect(c.titular).toEqual({ nombre: "GESTORIA EJEMPLO SL", nif: "B12345674" });
    expect(c.receptor).toEqual({ nombre: "JUAN PRADO", nif: "12345678Z" });
  });

  it("sello de empresa: titular y receptor son la sociedad", () => {
    const c = leerCertificado(p12DePrueba({ sujeto: SELLO }).p12, "prueba-1234");
    expect(c.tipo).toBe("SELLO");
    expect(c.titular.nif).toBe("B12345674");
    expect(c.receptor.nif).toBe("B12345674");
  });

  it("contraseña mala, archivo que no es un .p12, certificado caducado", () => {
    const { p12 } = p12DePrueba({ sujeto: PERSONA_FISICA });
    expect(() => leerCertificado(p12, "otra")).toThrow(/contraseña/);
    expect(() => leerCertificado(Buffer.from("%PDF-1.4 no soy un certificado"), "x")).toThrow(CertificadoInvalido);
    const viejo = p12DePrueba({ sujeto: PERSONA_FISICA, desde: new Date("2020-01-01"), hasta: new Date("2022-01-01") }).p12;
    expect(() => leerCertificado(viejo, "prueba-1234")).toThrow(/caducó/);
  });

  it("NIF desde los atributos españoles", () => {
    expect(nifDeAtributo("IDCES-12345678Z")).toBe("12345678Z");
    expect(nifDeAtributo("VATES-B12345674")).toBe("B12345674");
    expect(nifDeAtributo("IDCES-X1234567L")).toBe("X1234567L");
    expect(nifDeAtributo("12345678Z")).toBe("12345678Z");
    expect(nifDeAtributo("PASES-AB123456")).toBeNull();
  });
});
