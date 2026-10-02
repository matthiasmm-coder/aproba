import "server-only";
import forge from "node-forge";
import { CONTACTO } from "@/lib/contacto";
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

// ── Lo que node-forge no abre solo ──────────────────────────────────────────────────────
// 02/10/2026: el .pfx de idCAT de una gestora daba «La contraseña no es correcta» con la
// contraseña buena: cualquier fallo de forge se leía como contraseña mala. Ahora abrirP12
// dice qué pasa de verdad, y forge se completa, una sola vez, con lo que le falta:
//  · los cifrados «PKCS#12 PBE» de la RFC 7292 (apéndice C) que no trae: RC2 de 128 bits,
//    3DES de dos claves, RC4 de 128 y de 40 bits (misma derivación de clave, con SHA-1);
//  · PBES2 (AES) con ñ, tildes o € en la contraseña: Windows y OpenSSL la cifran en UTF-8 y
//    forge la pasaba tal cual (la MAC va en UTF-16, y esa forge ya la hacía bien).
type Descifrador = { update(d: forge.util.ByteStringBuffer): void; finish(): boolean; output: forge.util.ByteStringBuffer };
type Pbe = {
  getCipher: ((oid: string, params: forge.asn1.Asn1, password: string) => Descifrador) & { deAproba?: true };
  generatePkcs12Key(password: string, salt: forge.util.ByteStringBuffer, id: number, iter: number, n: number): forge.util.ByteStringBuffer;
};

function rc4(clave: string): Descifrador {
  const s = Array.from({ length: 256 }, (_, n) => n);
  for (let n = 0, j = 0; n < 256; n++) { j = (j + s[n] + clave.charCodeAt(n % clave.length)) & 255; [s[n], s[j]] = [s[j], s[n]]; }
  let i = 0, j = 0;
  const output = forge.util.createBuffer();
  return {
    output,
    update(d) {
      const bytes = d.getBytes();
      for (let n = 0; n < bytes.length; n++) {
        i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]];
        output.putByte(bytes.charCodeAt(n) ^ s[(s[i] + s[j]) & 255]);
      }
    },
    finish: () => true,
  };
}

const PBE_PKCS12: Record<string, { bytes: number; descifrador: (clave: string, iv: string) => Descifrador }> = {
  "1.2.840.113549.1.12.1.1": { bytes: 16, descifrador: (k) => rc4(k) }, // RC4 de 128 bits
  "1.2.840.113549.1.12.1.2": { bytes: 5, descifrador: (k) => rc4(k) },  // RC4 de 40 bits
  "1.2.840.113549.1.12.1.4": { bytes: 16, descifrador: (k, iv) => {     // 3DES de dos claves: K1 K2 K1
    const c = forge.cipher.createDecipher("3DES-CBC", k + k.slice(0, 8)); c.start({ iv }); return c;
  } },
  "1.2.840.113549.1.12.1.5": { bytes: 16, descifrador: (k, iv) => {     // RC2 de 128 bits
    const c = forge.rc2.createDecryptionCipher(k, 128); c.start(iv); return c;
  } },
};

const pbe = (forge.pki as unknown as { pbe: Pbe }).pbe;
if (!pbe.getCipher.deAproba) { // una sola vez, aunque el módulo se cargue de nuevo
  const deForge = pbe.getCipher;
  const getCipher: Pbe["getCipher"] = (oid, params, password) => {
    if (oid === forge.pki.oids.pkcs5PBES2) return deForge(oid, params, forge.util.encodeUtf8(password));
    const esquema = PBE_PKCS12[oid];
    if (!esquema) return deForge(oid, params, password);
    const [sal, vueltas] = params.value as forge.asn1.Asn1[]; // pkcs-12PbeParams: salt, iterations
    const salt = forge.util.createBuffer(sal.value as string);
    const n = forge.util.createBuffer(vueltas.value as string);
    const iteraciones = n.getInt(n.length() << 3);
    return esquema.descifrador(
      pbe.generatePkcs12Key(password, salt, 1, iteraciones, esquema.bytes).getBytes(),
      pbe.generatePkcs12Key(password, salt, 2, iteraciones, 8).getBytes());
  };
  getCipher.deAproba = true;
  pbe.getCipher = getCipher;
}

// forge comprueba la MAC (es decir, la contraseña) ANTES de descifrar nada. Si la MAC no
// cuadra, es la contraseña; si cuadra y luego algo no se sabe leer, es el archivo, no ella.
function abrirP12(asn1: forge.asn1.Asn1, clave: string): forge.pkcs12.Pkcs12Pfx {
  const conMac = Array.isArray(asn1.value) && asn1.value.length > 2;
  const deContraseña = (e: Error) => /MAC could not be verified/i.test(e.message) || (!conMac && !/unsupported/i.test(e.message));
  let fallo: Error | null = null;
  // Tal cual y, si no, sin espacios en los extremos: al copiar un código se cuela alguno.
  for (const intento of clave.trim() && clave.trim() !== clave ? [clave, clave.trim()] : [clave]) {
    try { return forge.pkcs12.pkcs12FromAsn1(asn1, false, intento); }
    catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      if (!fallo || deContraseña(fallo)) fallo = error; // se queda el que más dice
    }
  }
  const e = fallo as Error & { oid?: unknown };
  if (/not an PKCS#12 PFX/i.test(e.message)) {
    // Confusión habitual: el .cer (la parte pública, la que pide el alta en la DEHú).
    const v = asn1.value;
    const esCer = Array.isArray(v) && v.length === 3 && v[2].type === forge.asn1.Type.BITSTRING;
    throw new CertificadoInvalido(esCer
      ? "Este archivo es solo la parte pública del certificado (.cer), sin la clave privada: sube el .p12 o el .pfx."
      : "El archivo no es un certificado .p12 o .pfx válido.");
  }
  if (deContraseña(e)) throw new CertificadoInvalido("La contraseña no es correcta.");
  const oid = typeof e.oid === "string" && /^\d+(\.\d+)+$/.test(e.oid) ? e.oid : /\b\d+(?:\.\d+){3,}\b/.exec(e.message)?.[0];
  const nombre = oid && (forge.pki.oids as Record<string, string>)[oid];
  const detalle = oid ? (nombre ? `${nombre}, ${oid}` : oid) : e.message;
  const antesDeLaMac = /PFX|password integrity|authSafe content data|MAC/i.test(e.message);
  throw new CertificadoInvalido(conMac && !antesDeLaMac
    ? `La contraseña es correcta, pero el archivo usa un cifrado que Aproba aún no sabe abrir (${detalle}). Escríbenos a ${CONTACTO.email} y lo resolvemos.`
    : `Aproba aún no sabe abrir este tipo de archivo (${detalle}). Escríbenos a ${CONTACTO.email} y lo resolvemos.`);
}

export function leerCertificado(p12: Buffer, clave: string, ahora: Date = new Date()): CertificadoLeido {
  let asn1: forge.asn1.Asn1;
  try { asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary"))); }
  catch { throw new CertificadoInvalido("El archivo no es un certificado .p12 o .pfx válido."); }
  const pkcs12 = abrirP12(asn1, clave);

  const bolsas = (tipo: string) => (pkcs12.getBags({ bagType: tipo })[tipo] ?? []) as forge.pkcs12.Bag[];
  const bolsasClave = [...bolsas(forge.pki.oids.pkcs8ShroudedKeyBag), ...bolsas(forge.pki.oids.keyBag)];
  const claves = bolsasClave.map((b) => b.key).filter(Boolean) as forge.pki.rsa.PrivateKey[];
  // forge descarta (cert null) un certificado RSA si su emisor firma con curva elíptica: se
  // lee sin calcular su huella y se guarda su DER original, el que se registró en la DEHú.
  const certs = bolsas(forge.pki.oids.certBag).flatMap((b) => {
    try {
      if (b.cert) return [{ c: b.cert, der: forge.asn1.toDer(forge.pki.certificateToAsn1(b.cert)).getBytes() }];
      return b.asn1 ? [{ c: forge.pki.certificateFromAsn1(b.asn1, false), der: forge.asn1.toDer(b.asn1).getBytes() }] : [];
    } catch { return []; } // un certificado de la cadena con clave de curva elíptica: no hace falta
  });
  if (!claves.length) {
    throw new CertificadoInvalido(bolsasClave.length
      ? "La clave privada de este certificado no es RSA (es de curva elíptica u otro tipo): Aproba aún no la admite."
      : "El archivo no contiene la clave privada: expórtalo «con clave privada» (.p12 o .pfx).");
  }
  if (!certs.length) throw new CertificadoInvalido("El archivo no contiene ningún certificado que Aproba sepa leer.");
  // El certificado del firmante es el que casa con la clave privada (el resto es la cadena).
  const par = claves.flatMap((k) => certs.map(({ c, der }) => ({ k, c, der })))
    .find(({ k, c }) => { const pub = c.publicKey as forge.pki.rsa.PublicKey; return Boolean(pub?.n && k.n && pub.n.equals(k.n)); });
  if (!par) throw new CertificadoInvalido("La clave privada no corresponde a ningún certificado del archivo (¿es una clave RSA?).");
  const { k, c, der } = par;

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
  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(k),
    certificadoPem: forge.pem.encode({ type: "CERTIFICATE", body: der }),
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

// Lo que pide la DEHú en «Configuración Gran Destinatario › Parte pública (formato PEM)»:
// el base64 del certificado en líneas de 64, SIN las líneas BEGIN/END (así lo aceptó el
// alta real del 02/10/2026). Aproba lo da hecho: el gestor ya no exporta ningún .cer.
export function partePublicaPem(certificadoDerB64: string): string {
  return (certificadoDerB64.replace(/\s+/g, "").match(/.{1,64}/g) ?? []).join("\n");
}
