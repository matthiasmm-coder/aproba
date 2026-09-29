// SOLO PARA LOS TESTS de la DEHú automática: fabrica certificados .p12 ficticios con la
// forma de los españoles (persona física FNMT, representante, sello). Nunca se importa
// desde la aplicación.
import crypto from "node:crypto";
import forge from "node-forge";

export type Atributo = { type: string; value: string; utf8?: boolean };

export function p12DePrueba(o: {
  sujeto: Atributo[]; clave?: string; desde?: Date; hasta?: Date; emisorCn?: string;
}): { p12: Buffer; certificadoPem: string; clavePrivadaPem: string } {
  // Claves con el crypto nativo (rápido); el certificado y el .p12, con forge.
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const clavePrivadaPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const pub = forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }).toString());
  const priv = forge.pki.privateKeyFromPem(clavePrivadaPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  cert.serialNumber = "0a1b2c3d4e5f";
  cert.validity.notBefore = o.desde ?? new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = o.hasta ?? new Date(Date.now() + 365 * 86_400_000);
  cert.setSubject(o.sujeto.map((a) => ({ type: a.type, value: a.value, valueTagClass: a.utf8 ? forge.asn1.Type.UTF8 : forge.asn1.Type.PRINTABLESTRING })) as unknown as forge.pki.CertificateField[]);
  cert.setIssuer([{ type: "2.5.4.3", value: o.emisorCn ?? "AC FNMT Usuarios (PRUEBA)" }, { type: "2.5.4.6", value: "ES" }]);
  cert.sign(priv, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(priv, [cert], o.clave ?? "prueba-1234", { algorithm: "3des" });
  const der = forge.asn1.toDer(asn1).getBytes();
  return { p12: Buffer.from(der, "binary"), certificadoPem: forge.pki.certificateToPem(cert), clavePrivadaPem };
}

export const PERSONA_FISICA: Atributo[] = [
  { type: "2.5.4.6", value: "ES" },
  { type: "2.5.4.5", value: "IDCES-12345678Z" },
  { type: "2.5.4.42", value: "JUAN" },
  { type: "2.5.4.4", value: "MUÑOZ PRADO", utf8: true },
  { type: "2.5.4.3", value: "MUÑOZ PRADO JUAN - 12345678Z", utf8: true },
];
export const REPRESENTANTE: Atributo[] = [
  { type: "2.5.4.6", value: "ES" },
  { type: "2.5.4.97", value: "VATES-B12345674" },
  { type: "2.5.4.10", value: "GESTORIA EJEMPLO SL" },
  { type: "2.5.4.5", value: "IDCES-12345678Z" },
  { type: "2.5.4.42", value: "JUAN" },
  { type: "2.5.4.4", value: "PRADO" },
  { type: "2.5.4.3", value: "12345678Z JUAN PRADO (R: B12345674)" },
];
export const SELLO: Atributo[] = [
  { type: "2.5.4.6", value: "ES" },
  { type: "2.5.4.97", value: "VATES-B12345674" },
  { type: "2.5.4.10", value: "GESTORIA EJEMPLO SL" },
  { type: "2.5.4.3", value: "SELLO GESTORIA EJEMPLO" },
];
