import crypto from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { CertificadoInvalido, leerCertificado, nifDeAtributo, partePublicaPem } from "@/lib/dehu/certificado";
import { PERSONA_FISICA, REPRESENTANTE, SELLO, p12DePrueba } from "@/lib/dehu/certificados-prueba";
import { HUELLA_HOJA_CA_EC, PFX_PRUEBA } from "@/lib/dehu/pfx-prueba";

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

  it("parte pública para la DEHú: el mismo certificado en base64, líneas de 64, sin BEGIN/END", () => {
    const c = leerCertificado(p12DePrueba({ sujeto: PERSONA_FISICA }).p12, "prueba-1234");
    const pem = partePublicaPem(c.certificadoDerB64);
    expect(pem).not.toMatch(/BEGIN|END|-----/);
    expect(pem.split("\n").every((l) => l.length <= 64)).toBe(true);
    expect(pem.replace(/\n/g, "")).toBe(c.certificadoDerB64);
    // Es exactamente el cuerpo del PEM del certificado (lo que antes había que copiar del Bloc de notas).
    expect(c.certificadoPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")).toBe(c.certificadoDerB64);
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

  it("una contraseña copiada con un espacio de más al final también abre el archivo", () => {
    const { p12 } = p12DePrueba({ sujeto: PERSONA_FISICA });
    expect(leerCertificado(p12, "prueba-1234 ").titular.nif).toBe("12345678Z");
  });

  it("NIF desde los atributos españoles", () => {
    expect(nifDeAtributo("IDCES-12345678Z")).toBe("12345678Z");
    expect(nifDeAtributo("VATES-B12345674")).toBe("B12345674");
    expect(nifDeAtributo("IDCES-X1234567L")).toBe("X1234567L");
    expect(nifDeAtributo("12345678Z")).toBe("12345678Z");
    expect(nifDeAtributo("PASES-AB123456")).toBeNull();
  });
});

// 02/10/2026: el .pfx de idCAT de una gestora daba «La contraseña no es correcta» con la
// contraseña buena. Cada archivo de lib/dehu/pfx-prueba es un caso que forge no abría solo.
describe("archivos .p12 que node-forge no abría solo", () => {
  const abrir = (b64: string, clave = "Clave-1234") => leerCertificado(Buffer.from(b64, "base64"), clave);

  it.each([
    ["RC2 de 128 bits", PFX_PRUEBA.rc2_128],
    ["3DES de dos claves", PFX_PRUEBA.des2],
    ["RC4 de 128 bits", PFX_PRUEBA.rc4_128],
    ["RC4 de 40 bits", PFX_PRUEBA.rc4_40],
  ])("cifrado antiguo %s: se abre con la contraseña buena", (_, b64) => {
    const c = abrir(b64);
    expect(c.tipo).toBe("PERSONA_FISICA");
    expect(c.titular).toEqual({ nombre: "ANA MUÑOZ PRUEBA", nif: "12345678Z" });
    expect(c.clavePrivadaPem).toMatch(/BEGIN RSA PRIVATE KEY/);
  });

  it("y con una contraseña mala, sigue siendo «la contraseña no es correcta»", () => {
    expect(() => abrir(PFX_PRUEBA.rc2_128, "otra")).toThrow("La contraseña no es correcta.");
    expect(() => abrir(PFX_PRUEBA.utf8, "Contrasena-1234€")).toThrow("La contraseña no es correcta.");
  });

  it("hoja RSA firmada por una CA de curva elíptica: se lee, con su DER original intacto", () => {
    const c = abrir(PFX_PRUEBA.caEc);
    expect(c.titular.nif).toBe("12345678Z");
    expect(c.emisor).toBe("CA PRUEBA EC");
    const der = Buffer.from(c.certificadoDerB64, "base64");
    expect(crypto.createHash("sha256").update(der).digest("hex")).toBe(HUELLA_HOJA_CA_EC);
    expect(new crypto.X509Certificate(c.certificadoPem).raw.equals(der)).toBe(true);
  });

  it("contraseña con ñ y € en un PBES2 (AES): en UTF-8, como la cifran Windows y OpenSSL", () => {
    expect(abrir(PFX_PRUEBA.utf8, "Contraseña-1234€").titular.nif).toBe("12345678Z");
  });

  it("el .cer (solo la parte pública) en lugar del .pfx: lo dice, no culpa a la contraseña", () => {
    const { certificadoPem } = p12DePrueba({ sujeto: PERSONA_FISICA });
    const cer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(certificadoPem))).getBytes(), "binary");
    expect(() => leerCertificado(cer, "lo-que-sea")).toThrow(/parte pública del certificado \(\.cer\)/);
  });

  it("lo que aún no se sabe abrir lo dice, sin echarle la culpa a la contraseña", () => {
    expect(() => abrir(PFX_PRUEBA.macSha224)).toThrow(/^Aproba aún no sabe abrir este tipo de archivo \(sha224, 2\.16\.840\.1\.101\.3\.4\.2\.4\)/);
  });
});
