import "server-only";
import forge from "node-forge";
import { normalizarNif } from "@/lib/notificaciones-dehu";

// DEHú AUTOMÁTICA — el certificado del despacho (.p12 / .pfx) (29/09/2026).
// Se lee con su contraseña para: comprobar que sirve (clave privada, vigente), saber a
// nombre de quién llegan las notificaciones (titular) y quién comparece al abrirlas
// (receptor), y firmar los mensajes a la DEHú. La DEHú admite certificados de tipo 0
// (persona física), 1 y 11/12 (representante de persona jurídica), 4 y 8 (sello).

export type TipoCertificado = "PERSONA_FISICA" | "REPRESENTANTE" | "SELLO";
export type CertificadoLeido = {
  clavePrivadaPem: string;
  certificadoPem: string;
  certificadoDerB64: string;
  tipo: TipoCertificado;
  persona: { nombre: string | null; nif: string | null };   // quien firma (vacío en un sello)
  entidad: { nombre: string | null; nif: string | null };   // la sociedad (representante o sello)
  titular: { nombre: string; nif: string };                  // a nombre de quién llegan las notificaciones
  receptor: { nombre: string; nif: string };                 // quién comparece al abrir
  emisor: string;
  serie: string;
  emitidoAt: Date;
  caducaAt: Date;
};

export class CertificadoInvalido extends Error {
  constructor(message: string) { super(message); this.name = "CertificadoInvalido"; }
}

const OID = { cn: "2.5.4.3", serie: "2.5.4.5", org: "2.5.4.10", orgId: "2.5.4.97", nombre: "2.5.4.42", apellidos: "2.5.4.4" };
type Atributo = { type?: string; value?: unknown; valueTagClass?: unknown };
// forge entrega los UTF8String del sujeto tal cual vienen (bytes UTF-8): «MUÑOZ» llegaría
// como «MUÃ\x91OZ». Se decodifican aquí; el resto de tipos (PrintableString…) ya es texto.
const campo = (attrs: Atributo[], oid: string): string | null => {
  const a = attrs.find((x) => x.type === oid);
  let v = typeof a?.value === "string" ? a.value : "";
  if (v && a?.valueTagClass === forge.asn1.Type.UTF8) { try { v = forge.util.decodeUtf8(v); } catch { /* ya era texto */ } }
  return v.trim() || null;
};

// «IDCES-12345678Z», «VATES-B12345678», «NIF 12345678Z» → el NIF limpio (o null).
export function nifDeAtributo(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toUpperCase().replace(/^(IDC|PAS|VAT)[A-Z]{2}-/, "").replace(/^NIF\s*:?\s*/, "").trim();
  return normalizarNif(s);
}
const nifEnCn = (cn: string | null) => nifDeAtributo(/\b([0-9XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])\b/.exec(cn?.toUpperCase() ?? "")?.[1]);
const nombreSinNif = (cn: string | null) => cn?.replace(/\s*-\s*(NIF\s*:?\s*)?[0-9A-Z]{9}\s*(\(R:[^)]*\))?$/i, "").replace(/\s*\(R:[^)]*\)\s*$/i, "").trim() || null;

export function leerCertificado(p12: Buffer, clave: string, ahora: Date = new Date()): CertificadoLeido {
  let pkcs12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary")));
    try { pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave); }
    catch { throw new CertificadoInvalido("La contraseña no es correcta."); }
  } catch (e) {
    if (e instanceof CertificadoInvalido) throw e;
    throw new CertificadoInvalido("El archivo no es un certificado .p12 o .pfx válido.");
  }

  const bolsas = (tipo: string) => (pkcs12.getBags({ bagType: tipo })[tipo] ?? []) as forge.pkcs12.Bag[];
  const claves = [...bolsas(forge.pki.oids.pkcs8ShroudedKeyBag), ...bolsas(forge.pki.oids.keyBag)].map((b) => b.key).filter(Boolean) as forge.pki.rsa.PrivateKey[];
  const certs = bolsas(forge.pki.oids.certBag).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  if (!claves.length) throw new CertificadoInvalido("El archivo no contiene la clave privada: expórtalo «con clave privada» (.p12 o .pfx).");
  if (!certs.length) throw new CertificadoInvalido("El archivo no contiene ningún certificado.");
  // El certificado del firmante es el que casa con la clave privada (el resto es la cadena).
  const par = claves.flatMap((k) => certs.map((c) => ({ k, c })))
    .find(({ k, c }) => { const pub = c.publicKey as forge.pki.rsa.PublicKey; return Boolean(pub?.n && k.n && pub.n.equals(k.n)); });
  if (!par) throw new CertificadoInvalido("La clave privada no corresponde a ningún certificado del archivo (¿es una clave RSA?).");
  const { k, c } = par;

  if (c.validity.notAfter.getTime() < ahora.getTime()) {
    throw new CertificadoInvalido(`El certificado caducó el ${c.validity.notAfter.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}.`);
  }
  if (c.validity.notBefore.getTime() > ahora.getTime()) throw new CertificadoInvalido("El certificado aún no es válido.");

  const suj = c.subject.attributes as Atributo[];
  const cn = campo(suj, OID.cn);
  const nifPersona = nifDeAtributo(campo(suj, OID.serie)) ?? nifEnCn(cn);
  const nifEntidad = nifDeAtributo(campo(suj, OID.orgId));
  const nombreEntidad = campo(suj, OID.org);
  const nombrePila = campo(suj, OID.nombre), apellidos = campo(suj, OID.apellidos);
  const nombrePersona = nombrePila || apellidos ? `${nombrePila ?? ""} ${apellidos ?? ""}`.trim() : nombreSinNif(cn);

  // Sello: identifica a la entidad, no a una persona. Representante: persona + entidad.
  const esEmpresa = (nif: string | null) => Boolean(nif && /^[ABCDEFGHJNPQRSUVW]/.test(nif));
  const tipo: TipoCertificado = nifEntidad && (!nifPersona || nifPersona === nifEntidad || esEmpresa(nifPersona)) ? "SELLO"
    : nifEntidad ? "REPRESENTANTE" : "PERSONA_FISICA";
  const persona = tipo === "SELLO" ? { nombre: null, nif: null } : { nombre: nombrePersona, nif: nifPersona };
  const entidad = { nombre: nombreEntidad, nif: nifEntidad };
  const titular = tipo === "PERSONA_FISICA" ? persona : entidad;
  const receptor = tipo === "SELLO" ? entidad : persona;
  if (!titular.nif || !receptor.nif) throw new CertificadoInvalido("No se encuentra el NIF en el certificado: ¿es un certificado español de persona física, de representante o de sello?");

  const emisorAttrs = c.issuer.attributes as Atributo[];
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();
  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(k),
    certificadoPem: forge.pki.certificateToPem(c),
    certificadoDerB64: forge.util.encode64(der),
    tipo, persona, entidad,
    titular: { nombre: titular.nombre ?? titular.nif, nif: titular.nif },
    receptor: { nombre: receptor.nombre ?? receptor.nif, nif: receptor.nif },
    emisor: campo(emisorAttrs, OID.cn) ?? campo(emisorAttrs, OID.org) ?? "—",
    serie: c.serialNumber,
    emitidoAt: c.validity.notBefore,
    caducaAt: c.validity.notAfter,
  };
}
