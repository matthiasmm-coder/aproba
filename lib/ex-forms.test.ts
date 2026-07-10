import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { formulariosOficiales, rellenarOficial, FORMS } from "./ex-forms";
import type { DatosForm } from "./formularios";

// Blindaje de mantenimiento de los modelos EX. El riesgo principal: que el Ministerio
// publique una versión nueva del PDF oficial y descoloque silenciosamente el mapeo
// (coordenadas overlay o nombres de campo AcroForm) → expediente mal relleno → inadmisión.
// Estos tests detectan ese cambio ANTES de que llegue a producción.

const tpl = (code: string) => path.join(process.cwd(), "forms", "ex", `${code}.pdf`);
const FP_PATH = path.join(process.cwd(), "forms", "ex", "fingerprints.json");
const CODES = formulariosOficiales();
const loadFP = async () => JSON.parse(await readFile(FP_PATH, "utf8")) as Record<string, { sha256: string; paginas: number; ancho: number; alto: number }>;

const SAMPLE: DatosForm = {
  pasaporte: "AY0429317", nie1: "", nie2: "", nie3: "",
  apellido1: "MENDOZA", apellido2: "RESTREPO", nombre: "JULIA", sexo: "M",
  estadoCivil: "S", fechaD: "14", fechaM: "03", fechaA: "1992",
  lugarNac: "BOGOTA", paisNac: "COLOMBIA", nacionalidad: "COLOMBIANA",
  nombrePadre: "CARLOS MENDOZA", nombreMadre: "ANA RESTREPO",
  domicilio: "CALLE MALLORCA", numero: "245", piso: "3 2", localidad: "BARCELONA",
  cp: "08036", provincia: "BARCELONA", telefono: "600112233", email: "julia@example.com",
};

describe("EX · integridad de las plantillas oficiales (tripwire)", () => {
  it("hay huella para cada modelo mapeado", async () => {
    const fp = await loadFP();
    for (const c of CODES) expect(fp[c], `falta la huella de ${c} en fingerprints.json`).toBeDefined();
  });

  it.each(CODES)("%s · la plantilla no cambió (sha256 + páginas + tamaño)", async (code) => {
    const fp = (await loadFP())[code];
    const bytes = await readFile(tpl(code));
    const sha = createHash("sha256").update(bytes).digest("hex");
    // ⚠️ Si esto falla, el PDF oficial CAMBIÓ. Revisa el mapeo (coords/campos) contra el
    // nuevo modelo y, una vez verificado, regenera forms/ex/fingerprints.json.
    expect(sha, `la plantilla ${code} cambió respecto a la huella conocida`).toBe(fp.sha256);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    expect(pdf.getPageCount(), `${code}: nº de páginas distinto`).toBe(fp.paginas);
    const p0 = pdf.getPage(0);
    expect(Math.round(p0.getWidth()), `${code}: ancho distinto`).toBe(fp.ancho);
    expect(Math.round(p0.getHeight()), `${code}: alto distinto`).toBe(fp.alto);
  });
});

describe("EX-10 (AcroForm) · los campos del mapeo existen en el PDF", () => {
  it("ningún nombre de campo referenciado falta en EX-10.pdf", async () => {
    const mapa = FORMS["EX-10"];
    expect(mapa.modo).toBe("acroform");
    if (mapa.modo !== "acroform") return;
    const pdf = await PDFDocument.load(await readFile(tpl("EX-10")), { ignoreEncryption: true });
    const present = new Set(pdf.getForm().getFields().map((f) => f.getName()));
    const refs = [
      ...Object.values(mapa.texto),
      ...Object.values(mapa.checks ?? {}),
      ...Object.values(mapa.estadoCivil ?? {}),
      ...Object.values(mapa.tramiteChecks ?? {}).flat(),
    ].filter(Boolean) as string[];
    const faltan = [...new Set(refs)].filter((n) => !present.has(n));
    expect(faltan, `campos del mapeo ausentes en EX-10.pdf (relleno silenciosamente perdido): ${faltan.join(" · ")}`).toEqual([]);
  });
});

describe("EX · el relleno no rompe y produce un PDF válido", () => {
  it.each(CODES)("%s · rellenarOficial devuelve un PDF recargable", async (code) => {
    const out = await rellenarOficial(code, SAMPLE, "ARRAIGO_SOCIAL");
    expect(out, `${code} devolvió null`).not.toBeNull();
    expect(out!.byteLength, `${code}: PDF demasiado pequeño`).toBeGreaterThan(1000);
    const re = await PDFDocument.load(out!, { ignoreEncryption: true });
    expect(re.getPageCount()).toBeGreaterThan(0);
  });
});

describe("EX · página 2: casilla de tipo de trámite (TRAMITE_P2)", () => {
  // La posición exacta la audita scripts/audit-ex-forms.mjs (pdfjs); aquí se blinda el
  // gating: con trámite mapeado se estampa una X (más bytes), sin él el PDF no cambia.
  it.each([["EX-17", "TIE"], ["EX-17", "RENOVACION"], ["EX-17", "DUPLICADO"], ["EX-15", "NIE"]])(
    "%s × %s estampa la casilla de la p.2", async (code, tramite) => {
      const con = await rellenarOficial(code, SAMPLE, tramite);
      const sin = await rellenarOficial(code, SAMPLE);
      expect(con!.byteLength, `${code} × ${tramite}: la casilla no se estampó`).toBeGreaterThan(sin!.byteLength);
    });
  it("un trámite sin casilla mapeada no altera el PDF (EX-17 × NACIONALIDAD)", async () => {
    const con = await rellenarOficial("EX-17", SAMPLE, "NACIONALIDAD");
    const sin = await rellenarOficial("EX-17", SAMPLE);
    expect(con!.byteLength).toBe(sin!.byteLength);
  });
});

describe("EX-10 (AcroForm) · los datos se escriben en sus casillas", () => {
  it("nombre, apellido y documento quedan en sus campos", async () => {
    const mapa = FORMS["EX-10"];
    if (mapa.modo !== "acroform") return;
    const out = await rellenarOficial("EX-10", SAMPLE);
    const form = (await PDFDocument.load(out!, { ignoreEncryption: true })).getForm();
    const read = (f?: string) => { try { return f ? (form.getTextField(f).getText() ?? "") : null; } catch { return null; } };
    expect(read(mapa.texto.nombre)).toBe("JULIA");
    expect(read(mapa.texto.apellido1)).toBe("MENDOZA");
    expect(read(mapa.texto.pasaporte)).toBe("AY0429317");
  });
});
