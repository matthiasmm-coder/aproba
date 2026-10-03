import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { generarHojaEncargo, generarMandato, lugarDeDomicilio, type DatosEncargo } from "@/lib/encargo";

// Firma (y sello) del profesional y condiciones particulares de la hoja de encargo
// (Luis, Asenjo Global Consulting, 02/10/2026).

// PNG de 1×1 px: basta para comprobar que la imagen entra en el PDF.
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

const base: DatosEncargo = {
  referencia: "EXP-2026-0142", fecha: new Date(2026, 9, 2),
  despacho: { nombre: "Gestoría de Carmen", nif: "B12345678", domicilio: "C/ Mayor 12, 46001 Valencia", email: "hola@example.com" },
  mandatario: { nombre: "Carmen Ruiz", dni: "12345678Z", colegiado: "", colegio: "" },
  cliente: { nombre: "Marcos", apellidos: "Quispe Huamán", nie: "Y1234567X", pasaporte: "", nacionalidad: "Perú", domicilio: "C/ de la Paz 8", municipio: "Valencia", cp: "46003", provincia: "Valencia", telefono: "", email: "" },
  servicios: [{ label: "Arraigo social", desc: "", anticipo: 250, resto: 250, noIncluye: "", suplidos: [] }],
  suplidosOverride: null, descuento: null, esFamiliar: false, medios: [],
  presupuesto: { validezDias: 30, nota: "", condiciones: "", fechaPresupuesto: "", fechaEncargo: "" },
};

async function imagenes(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.context.enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
}
async function textos(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const c = page.node.Contents();
    const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const src = streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1")).join("\n");
    for (const m of src.matchAll(/<([0-9A-F]*)> Tj/g)) out.push(Buffer.from(m[1], "hex").toString("latin1"));
  }
  return out;
}

describe("firma del profesional en los documentos", () => {
  it("sin firma, ninguna imagen (como hasta ahora)", async () => {
    expect(await imagenes(await generarHojaEncargo(base))).toBe(0);
    expect(await imagenes(await generarMandato(base))).toBe(0);
    expect(await textos(await generarHojaEncargo(base, "presupuesto"))).not.toContain("POR EL DESPACHO");
  });

  it("con firma, la llevan la hoja de encargo, el mandato y el presupuesto («POR EL DESPACHO»)", async () => {
    const d = { ...base, firma: PNG };
    // Un PNG con transparencia entra como imagen + su máscara (SMask): 1 o más objetos imagen.
    expect(await imagenes(await generarHojaEncargo(d))).toBeGreaterThan(0);
    expect(await imagenes(await generarMandato(d))).toBeGreaterThan(0);
    const presupuesto = await generarHojaEncargo(d, "presupuesto");
    expect(await imagenes(presupuesto)).toBeGreaterThan(0);
    expect(await textos(presupuesto)).toContain("POR EL DESPACHO");
  });

  it("una imagen que no se puede leer no rompe el documento: sale sin firma", async () => {
    const d = { ...base, firma: new Uint8Array([1, 2, 3, 4]) };
    expect(await imagenes(await generarHojaEncargo(d))).toBe(0);
  });
});

describe("condiciones particulares de la hoja de encargo", () => {
  it("van en su apartado, antes de la protección de datos (que pasa a ser el 8)", async () => {
    const d = { ...base, presupuesto: { ...base.presupuesto, condiciones: "Incluye la cita para la toma de huellas." } };
    const t = await textos(await generarHojaEncargo(d));
    expect(t).toContain("7. CONDICIONES PARTICULARES");
    expect(t).toContain("Incluye la cita para la toma de huellas.");
    expect(t).toContain("8. PROTECCIÓN DE DATOS");
    expect(t.indexOf("7. CONDICIONES PARTICULARES")).toBeLessThan(t.indexOf("8. PROTECCIÓN DE DATOS"));
  });

  it("sin condiciones, la hoja no cambia; y el presupuesto nunca las imprime", async () => {
    expect(await textos(await generarHojaEncargo(base))).toContain("7. PROTECCIÓN DE DATOS");
    const d = { ...base, presupuesto: { ...base.presupuesto, condiciones: "Solo para la hoja." } };
    expect(await textos(await generarHojaEncargo(d, "presupuesto"))).not.toContain("Solo para la hoja.");
  });
});

// «En Madrid, a … de … de …» antes de las firmas (Luis, Asenjo Global Consulting, 03/10/2026).
describe("lugar y fecha antes de las firmas", () => {
  it("el lugar sale del domicilio del despacho: el municipio tras el código postal", () => {
    expect(lugarDeDomicilio("C/ VELAZQUEZ, 109 7º IZDA. 28005 MADRID")).toBe("Madrid");
    expect(lugarDeDomicilio("AV. DE LAS CORTES VALENCIANAS 46, 5 E, CP 46015 - VALENCIA")).toBe("Valencia");
    expect(lugarDeDomicilio("Calle Mayor 3, 08901 L'HOSPITALET DE LLOBREGAT")).toBe("L'Hospitalet de Llobregat");
    expect(lugarDeDomicilio("C/ Real 5, 28700 San Sebastián de los Reyes (Madrid)")).toBe("San Sebastián de los Reyes");
    expect(lugarDeDomicilio("Calle Mayor 12, Valencia 46001")).toBe("Valencia");
    expect(lugarDeDomicilio("C/Mayor 1, Madrid")).toBe("Madrid");
    // Sin código postal ni municipio reconocible: la línea sale en blanco, como antes.
    expect(lugarDeDomicilio("GRAN VIA LES CORTS CATALANES 164 LOCAL 18")).toBeNull();
    expect(lugarDeDomicilio("")).toBeNull();
  });

  it("hoja de encargo y mandato: «En Madrid, a» la fecha del día, ya escrita", async () => {
    const d = { ...base, lugar: "Madrid" };
    expect(await textos(await generarHojaEncargo(d))).toContain("En Madrid, a 2 de octubre de 2026");
    expect(await textos(await generarMandato(d))).toContain("En Madrid, a 2 de octubre de 2026");
  });

  it("la fecha elegida en la ventana manda en la hoja y el mandato (también en «Fecha:»)", async () => {
    const d = { ...base, lugar: "Madrid", presupuesto: { ...base.presupuesto, fechaEncargo: "2026-09-28" } };
    const hoja = await textos(await generarHojaEncargo(d));
    expect(hoja).toContain("En Madrid, a 28 de septiembre de 2026");
    expect(hoja).toContain("Fecha: 28 de septiembre de 2026");
    expect(await textos(await generarMandato(d))).toContain("En Madrid, a 28 de septiembre de 2026");
  });

  it("presupuesto firmado: lugar y fecha sobre «POR EL DESPACHO», con su propia fecha y su validez", async () => {
    const d = { ...base, lugar: "Madrid", firma: PNG, presupuesto: { ...base.presupuesto, fechaPresupuesto: "2026-09-30", fechaEncargo: "2026-09-28" } };
    const t = await textos(await generarHojaEncargo(d, "presupuesto"));
    expect(t).toContain("En Madrid, a 30 de septiembre de 2026");
    expect(t).toContain("Válido hasta el 30 de octubre de 2026");
    expect(t.indexOf("En Madrid, a 30 de septiembre de 2026")).toBeLessThan(t.indexOf("POR EL DESPACHO"));
  });

  it("sin lugar conocido, el hueco del lugar sigue en blanco pero la fecha sale escrita", async () => {
    expect(await textos(await generarHojaEncargo(base))).toContain("En ____________________________, a 2 de octubre de 2026");
  });
});
