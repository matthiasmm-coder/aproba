import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { generarHojaEncargo, generarMandato, type CajaFirma, type DatosEncargo } from "@/lib/encargo";
import { sellarDocumento } from "@/lib/firma/pdf";
import {
  OTP_MAX_INTENTOS, codigoCoincide, enmascararEmail, estadoVisibleSobre, fechaHoraMadrid, huellaCodigo, ipDe,
  nuevoCodigo, nuevoToken, pngDeDataUrl, recordatorioPendiente, resumenDispositivo, sha256Hex,
} from "@/lib/firma/sobre";

// FIRMA ELECTRÓNICA EN LÍNEA (lib/firma, 03/10/2026). Datos ficticios.
const base: DatosEncargo = {
  referencia: "EXP-2026-0142", fecha: new Date(2026, 9, 3),
  despacho: { nombre: "Gestoría de Carmen", nif: "B12345678", domicilio: "C/ Mayor 12, 46001 Valencia", email: "hola@example.com" },
  mandatario: { nombre: "Carmen Ruiz", dni: "12345678Z", colegiado: "", colegio: "" },
  cliente: { nombre: "Marcos", apellidos: "Quispe Huamán", nie: "Y1234567X", pasaporte: "", nacionalidad: "Perú", domicilio: "C/ de la Paz 8", municipio: "Valencia", cp: "46003", provincia: "Valencia", telefono: "", email: "" },
  servicios: [{ label: "Arraigo social", desc: "", anticipo: 250, resto: 250, noIncluye: "", suplidos: [] }],
  suplidosOverride: null, descuento: null, esFamiliar: false, medios: [],
  presupuesto: { validezDias: 30, nota: "", condiciones: "", fechaPresupuesto: "", fechaEncargo: "" },
};
// Una «firma» PNG de verdad (RGBA, una onda de tinta sobre fondo transparente), hecha aquí.
function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function trozo(tipo: string, datos: Buffer) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}
function pngFirma(w = 120, h = 40) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const fila = w * 4 + 1;
  const raw = Buffer.alloc(fila * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * fila + 1 + x * 4;
    raw[i] = 26; raw[i + 1] = 43; raw[i + 2] = 109;
    raw[i + 3] = Math.abs(y - h / 2 - 10 * Math.sin(x / 8)) < 2 ? 255 : 0;
  }
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(raw)), trozo("IEND", Buffer.alloc(0))]));
}
const FIRMA = pngFirma();

async function textos(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const c = page.node.Contents();
    const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const src = streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
    return [...src.matchAll(/<([0-9A-F]*)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
  });
}
async function imagenes(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.context.enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
}

describe("firma en línea · reglas", () => {
  it("el código: 6 cifras; su huella lleva el secreto del servidor y el sobre", () => {
    const c = nuevoCodigo();
    expect(c).toMatch(/^\d{6}$/);
    const h = huellaCodigo(c, "sobre-1", "secreto");
    expect(codigoCoincide(c, "sobre-1", h, "secreto")).toBe(true);
    expect(codigoCoincide(c, "sobre-2", h, "secreto")).toBe(false);   // otro sobre
    expect(codigoCoincide(c, "sobre-1", h, "otro")).toBe(false);      // sin el secreto no se rompe
    expect(codigoCoincide(c === "000000" ? "000001" : "000000", "sobre-1", h, "secreto")).toBe(false);
    expect(codigoCoincide("12345", "sobre-1", h, "secreto")).toBe(false);
    expect(codigoCoincide(c, "sobre-1", null, "secreto")).toBe(false);
    expect(OTP_MAX_INTENTOS).toBe(5);
  });

  it("enlace largo y aleatorio; email enmascarado; dispositivo e IP legibles", () => {
    expect(nuevoToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(nuevoToken()).not.toBe(nuevoToken());
    expect(enmascararEmail("juan.perez@gmail.com")).toBe("j***z@gmail.com");
    expect(enmascararEmail("ab@x.es")).toBe("a***@x.es");
    expect(enmascararEmail("")).toBe("");
    expect(resumenDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(resumenDispositivo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(resumenDispositivo(null)).toBe("Desconocido");
    expect(ipDe(new Headers({ "x-forwarded-for": "81.40.1.2, 10.0.0.1" }))).toBe("81.40.1.2");
  });

  it("estado visible y recordatorios a los 2 y 5 días, una vez cada uno", () => {
    const ahora = new Date("2026-10-10T10:00:00Z");
    expect(estadoVisibleSobre({ estado: "PENDIENTE" }, ahora)).toBe("pendiente");
    expect(estadoVisibleSobre({ estado: "PENDIENTE", abiertoAt: "2026-10-09T10:00:00Z" }, ahora)).toBe("abierto");
    expect(estadoVisibleSobre({ estado: "PENDIENTE", expiraAt: "2026-10-09T10:00:00Z" }, ahora)).toBe("caducado");
    expect(estadoVisibleSobre({ estado: "FIRMADO" }, ahora)).toBe("firmado");
    const s = (dias: number, recordatorios: number) => ({ estado: "PENDIENTE", enviadoAt: new Date(ahora.getTime() - dias * 86_400_000).toISOString(), recordatorios });
    expect(recordatorioPendiente(s(1, 0), ahora)).toBe(false);
    expect(recordatorioPendiente(s(2, 0), ahora)).toBe(true);
    expect(recordatorioPendiente(s(3, 1), ahora)).toBe(false);
    expect(recordatorioPendiente(s(5, 1), ahora)).toBe(true);
    expect(recordatorioPendiente(s(9, 2), ahora)).toBe(false);
    expect(recordatorioPendiente({ ...s(5, 0), estado: "FIRMADO" }, ahora)).toBe(false);
  });

  it("la imagen de la firma: solo un PNG de verdad y de tamaño razonable", () => {
    const ok = `data:image/png;base64,${Buffer.from(FIRMA).toString("base64")}`;
    expect(pngDeDataUrl(ok)?.length).toBe(FIRMA.length);
    expect(pngDeDataUrl("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(pngDeDataUrl(`data:image/png;base64,${Buffer.alloc(300, 1).toString("base64")}`)).toBeNull(); // no es PNG
    expect(pngDeDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBeNull(); // demasiado pequeño
    expect(fechaHoraMadrid("2026-10-03T18:36:23Z")).toBe("03/10/2026 20:36:23");
  });
});

describe("firma en línea · casillas y PDF sellado", () => {
  it("cada documento dice dónde firma el cliente (y el presupuesto, solo si se acepta en línea)", async () => {
    const hoja = { cajas: [] as CajaFirma[] };
    await generarHojaEncargo(base, "encargo", { salida: hoja });
    expect(hoja.cajas.map((c) => c.etiqueta)).toEqual(["EL PROFESIONAL", "EL CLIENTE"]);
    const presu = { cajas: [] as CajaFirma[] };
    await generarHojaEncargo(base, "presupuesto", { salida: presu });
    expect(presu.cajas).toEqual([]); // sin firma del despacho ni aceptación: como siempre
    const acepta = { cajas: [] as CajaFirma[] };
    await generarHojaEncargo(base, "presupuesto", { aceptacion: true, salida: acepta });
    expect(acepta.cajas.map((c) => c.etiqueta)).toEqual(["ACEPTADO POR EL CLIENTE"]);
    const mandato = { cajas: [] as CajaFirma[] };
    await generarMandato(base, undefined, { salida: mandato });
    expect(mandato.cajas.map((c) => c.etiqueta)).toEqual(["EL MANDANTE", "EL MANDATARIO"]);
    expect(mandato.cajas[0].w).toBeGreaterThan(100);
    expect(mandato.cajas[0].h).toBeGreaterThan(20);
  });

  it("el PDF sellado: firma en la casilla, pie en cada página y certificado al final", async () => {
    const salida = { cajas: [] as CajaFirma[] };
    const original = await generarHojaEncargo(base, "encargo", { salida });
    const cliente = salida.cajas.filter((c) => c.etiqueta === "EL CLIENTE");
    const paginas = (await PDFDocument.load(original)).getPageCount();
    const firmado = await sellarDocumento(original, cliente, FIRMA, {
      sobreId: "45521dd6-a106-4878-9a20-c27084e3cd38", titulo: "Hoja de encargo", despacho: "Gestoría de Carmen", referencia: "EXP-2026-0142",
      hashOriginal: sha256Hex(original), firmante: { nombre: "Marcos Quispe Huamán", documento: "Y1234567X", email: "marcos@example.com" },
      metodo: "dibujada", firmadoEn: "2026-10-03T18:36:23Z",
      evidencias: [
        { evento: "creado", en: "2026-10-03T18:00:00Z" },
        { evento: "abierto", en: "2026-10-03T18:30:00Z", ip: "81.40.1.2", dispositivo: "iPhone · Safari" },
        { evento: "codigo_ok", en: "2026-10-03T18:36:20Z", ip: "81.40.1.2", dispositivo: "iPhone · Safari" },
        { evento: "firmado", en: "2026-10-03T18:36:23Z", ip: "81.40.1.2", dispositivo: "iPhone · Safari" },
      ],
    });
    const tx = await textos(firmado);
    expect(tx).toHaveLength(paginas + 1);
    for (let i = 0; i < paginas; i++) {
      expect(tx[i].join(" ")).toContain(`Firmado electrónicamente por Marcos Quispe Huamán el 03/10/2026 20:36:23 (hora de Madrid) · Envío 45521DD6 · Página ${i + 1} de ${paginas}`);
    }
    const cert = tx[paginas].join(" ");
    expect(cert).toContain("CERTIFICADO DE FIRMA ELECTRÓNICA");
    expect(cert).toContain(sha256Hex(original).slice(0, 32));
    expect(cert).toContain("marcos@example.com (código de un solo uso)");
    expect(cert).toContain("El firmante abrió los documentos");
    expect(cert).not.toContain("Documentos preparados para la firma"); // «creado» no sale
    expect(await imagenes(firmado)).toBeGreaterThanOrEqual(1);
  });
});
