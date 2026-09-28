import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { facturaToPdf } from "@/lib/export-pdf";
import { generarHojaEncargo, type DatosEncargo } from "@/lib/encargo";
import type { Factura } from "@/lib/facturas";

// Geometría real de los PDF generados (render del 28/09/2026): se lee el content stream que
// escribe pdf-lib — textos (Tf + Tm + Tj) y rayas horizontales (m + l) — de la 1ª página.
type Texto = { s: string; x: number; y: number; size: number; bold: boolean };
async function geometria(bytes: Uint8Array, pagina = 0) {
  const doc = await PDFDocument.load(bytes);
  const c = doc.getPages()[pagina].node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  const src = streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
  const textos: Texto[] = [];
  const rayas: { x1: number; x2: number; y: number }[] = [];
  let size = 0, bold = false, x = 0, y = 0;
  const lineas = src.split("\n");
  lineas.forEach((l, i) => {
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^\/(\S+) ([\d.]+) Tf$/))) { bold = m[1].includes("Bold"); size = Number(m[2]); }
    else if ((m = l.match(/^1 0 0 1 ([\d.-]+) ([\d.-]+) Tm$/))) { x = Number(m[1]); y = Number(m[2]); }
    else if ((m = l.match(/^<([0-9A-F]*)> Tj$/))) textos.push({ s: Buffer.from(m[1], "hex").toString("latin1"), x, y, size, bold });
    else if ((m = l.match(/^([\d.-]+) ([\d.-]+) l$/))) {
      const ini = lineas[i - 1].match(/^([\d.-]+) ([\d.-]+) m$/);
      if (ini && Number(ini[2]) === Number(m[2])) rayas.push({ x1: Number(ini[1]), x2: Number(m[1]), y: Number(m[2]) });
    }
  });
  return { textos, rayas };
}

// Helvetica (AFM): mayúsculas hasta 0,718 em; paréntesis/descendentes hasta −0,207 em.
const ALTURA_MAYUS = 0.718, DESCENDENTE = 0.207;

describe("factura PDF · raya del TOTAL", () => {
  const factura = (suplidos: { concepto: string; importe: number }[]) => ({
    id: "f", numero: "F-2026-0042", cliente: "Aicha Diallo Díaz", concepto: "Residencia por arraigo", base: 450,
    estado: "EMITIDA", fecha: "28/09/2026", lineas: [{ concepto: "Residencia por arraigo — honorarios", base: 450 }], suplidos,
  }) as unknown as Factura;

  it.each([
    ["con suplidos (TOTAL 582,78 €)", [{ concepto: "Tasa 790-052 · Autorizaciones de residencia", importe: 38.28 }], "Suplidos (sin IVA)"],
    ["sin suplidos", [], "IVA (21 %)"],
  ])("%s: la raya queda en el hueco, sin tachar «TOTAL»", async (_, suplidos, anterior) => {
    const { textos, rayas } = await geometria(await facturaToPdf(factura(suplidos), { nombre: "Gestoría de Carmen", nif: "B12345678" }));
    const total = textos.find((t) => t.s === "TOTAL" && t.bold)!;
    const previa = textos.find((t) => t.s === anterior)!;
    expect(total).toBeDefined();
    expect(previa).toBeDefined();
    const raya = rayas.filter((r) => r.y > total.y && r.y < previa.y);
    expect(raya).toHaveLength(1);
    // Por encima de las mayúsculas de TOTAL y por debajo de los paréntesis de la línea anterior,
    // con aire (≥ 3 pt) a los dos lados.
    expect(raya[0].y).toBeGreaterThanOrEqual(total.y + ALTURA_MAYUS * total.size + 3);
    expect(raya[0].y).toBeLessThanOrEqual(previa.y - DESCENDENTE * previa.size - 3);
  });
});

describe("factura PDF · retención de IRPF y emisor congelado (Asenjo, 28/09/2026)", () => {
  const f = {
    id: "f", numero: "MA-2026-0001", cliente: "ASENJO GLOBAL CONSULTING SL", concepto: "Asesoramiento jurídico", base: 2000,
    estado: "EMITIDA", fecha: "28/09/2026", iva: 420, total: 2420, retencionPct: 15, retencion: 300,
    emisorDatos: { nombre: "Marta Asenjo Romo", nif: "00000000T", domicilio: "Madrid", email: null },
  } as unknown as Factura;

  it("TOTAL FACTURA, la retención en negativo y TOTAL A PAGAR = total − retención", async () => {
    const { textos } = await geometria(await facturaToPdf(f, { nombre: "Despacho en vivo", nif: "B99999999" }));
    const s = textos.map((t) => t.s);
    expect(s).toContain("TOTAL FACTURA");
    expect(s).toContain("Retención IRPF (15 %)");
    expect(s.some((x) => /^-300,00/.test(x))).toBe(true);        // guion ASCII: WinAnsi no tiene U+2212
    const iPagar = s.indexOf("TOTAL A PAGAR");
    expect(iPagar).toBeGreaterThan(-1);
    expect(s[iPagar + 1]).toMatch(/^2\.120,00/);
  });

  it("el encabezado es el emisor CONGELADO, no el del despacho en vivo", async () => {
    const { textos } = await geometria(await facturaToPdf(f, { nombre: "Despacho en vivo", nif: "B99999999" }));
    const s = textos.map((t) => t.s);
    expect(s).toContain("Marta Asenjo Romo");
    expect(s).toContain("NIF/CIF 00000000T");
    expect(s).not.toContain("Despacho en vivo");
  });

  it("sin retención, el PDF de siempre: TOTAL y nada más", async () => {
    const { textos } = await geometria(await facturaToPdf({ ...f, retencion: null, retencionPct: null } as Factura, { nombre: "X", nif: null }));
    const s = textos.map((t) => t.s);
    expect(s).toContain("TOTAL");
    expect(s).not.toContain("TOTAL A PAGAR");
  });
});

describe("factura PDF · conceptos partidos por ancho", () => {
  // Antes se partía cada 60 caracteres (líneas) o nada (suplidos): en mayúsculas o con el
  // «servicio: concepto» del multi-servicio, el texto pisaba BASE o «No sujeto».
  const M = 50, W = 595.28;
  const concepto = "RENOVACIÓN DE AUTORIZACIÓN DE RESIDENCIA Y TRABAJO POR CUENTA AJENA CON TRAMITACIÓN COMPLETA";
  const suplido = "Residencia por arraigo (Aicha Diallo, Moussa Diallo): Tasa 790-052 · Autorizaciones de residencia (x2)";
  const notas = "OBSERVACIONES: " + "HONORARIOS DEVENGADOS POR LA TRAMITACIÓN DEL EXPEDIENTE ANTE LA OFICINA DE EXTRANJERÍA. ".repeat(3).trim();
  const f = {
    id: "f", numero: "F-2026-0043", cliente: "Aicha Diallo Díaz", concepto, base: 12345.67, estado: "EMITIDA", fecha: "28/09/2026",
    lineas: [{ concepto, base: 12345.67 }], suplidos: [{ concepto: suplido, importe: 76.56 }], notas,
  } as unknown as Factura;

  it("líneas antes de BASE, suplidos antes de «No sujeto», notas dentro del margen, sin perder texto", async () => {
    const helv = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const { textos } = await geometria(await facturaToPdf(f, { nombre: "Gestoría de Carmen", nif: "B12345678" }));
    const fin = (t: Texto) => t.x + helv.widthOfTextAtSize(t.s, t.size);
    const cabSuplidos = textos.find((t) => t.s === "SUPLIDOS (gastos sin IVA)")!;
    const base = textos.filter((t) => t.s.startsWith("12.345,67")).sort((a, b) => a.x - b.x)[0];
    const noSujeto = textos.find((t) => t.s === "No sujeto")!;
    const col = textos.filter((t) => t.x === M && t.size === 10 && !t.bold);
    const deLinea = col.filter((t) => t.y > cabSuplidos.y), deSuplido = col.filter((t) => t.y < cabSuplidos.y);

    expect(deLinea.length).toBeGreaterThan(1);
    for (const t of deLinea) expect(fin(t), t.s).toBeLessThanOrEqual(base.x - 8 + 0.01);
    expect(deLinea.map((t) => t.s).join(" ")).toBe(concepto);
    expect(base.y).toBe(deLinea[0].y);

    expect(deSuplido.length).toBeGreaterThan(1);
    for (const t of deSuplido) expect(fin(t), t.s).toBeLessThanOrEqual(noSujeto.x - 8 + 0.01);
    expect(deSuplido.map((t) => t.s).join(" ")).toBe(suplido);
    expect(noSujeto.y).toBe(deSuplido[0].y);

    const deNotas = textos.filter((t) => t.x === M && t.size === 9 && t.y < noSujeto.y && t.y > 45);
    expect(deNotas.length).toBeGreaterThan(1);
    for (const t of deNotas) expect(fin(t), t.s).toBeLessThanOrEqual(W - M + 0.01);
    expect(deNotas.map((t) => t.s).join(" ")).toBe(notas);
  });
});

describe("hoja de encargo / presupuesto · etiquetas de §5", () => {
  const MARGEN = 56, COLUMNA = 150;
  const concepto = "Tasa 790-052 · Autorizaciones de residencia";
  const datos: DatosEncargo = {
    referencia: "EXP-2026-0099", fecha: new Date(2026, 8, 28),
    despacho: { nombre: "Gestoría de Carmen", nif: "B12345678", domicilio: "C/ Consell de Cent 312, 2º 1ª · 08007 Barcelona", email: "hola@example.com" },
    mandatario: { nombre: "Carmen Ruiz", dni: "12345678Z", colegiado: "1234", colegio: "Col·legi Oficial de Gestors Administratius de Catalunya" },
    cliente: { nombre: "Aicha", apellidos: "Diallo Díaz", nie: "Y1234567X", pasaporte: "", nacionalidad: "Senegal", domicilio: "C/ Mallorca 101", municipio: "Barcelona", cp: "08029", provincia: "Barcelona", telefono: "", email: "" },
    servicios: [{ label: "Residencia por arraigo", desc: "", anticipo: 225, resto: 225, noIncluye: "", suplidos: [{ concepto, importe: 38.28 }] }],
    suplidosOverride: null, descuento: null, esFamiliar: false, medios: [],
    presupuesto: { validezDias: 30, nota: "" },
  };

  it.each(["encargo", "presupuesto"] as const)("%s: el concepto largo se parte en su columna y no pisa el importe", async (modo) => {
    const helv = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const { textos } = await geometria(await generarHojaEncargo(datos, modo));
    const etiquetas = textos.filter((t) => t.x === MARGEN && t.size === 8 && !t.bold);
    // Ninguna etiqueta llega a la columna del valor (con 6 pt de aire como mínimo).
    for (const t of etiquetas) expect(MARGEN + helv.widthOfTextAtSize(t.s, 8)).toBeLessThanOrEqual(MARGEN + COLUMNA - 6);
    // El concepto sale entero (partido, no cortado) y el importe en la fila de su 1ª línea.
    const i = etiquetas.findIndex((t) => t.s.startsWith("Tasa 790-052"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(`${etiquetas[i].s} ${etiquetas[i + 1].s}`).toBe(concepto);
    const importe = textos.find((t) => t.s === "38,28 EUR")!;
    expect(importe.x).toBe(MARGEN + COLUMNA);
    expect(importe.y).toBeCloseTo(etiquetas[i].y, 5);
    // La fila siguiente («Total tasas y suplidos») empieza por debajo de la 2ª línea.
    const siguiente = textos.find((t) => t.s === "Total tasas y suplidos")!;
    expect(siguiente.y).toBeLessThan(etiquetas[i + 1].y - 8);
  });
});
