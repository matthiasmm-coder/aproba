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

describe("EX · modo editable (campos AcroForm en lugar de texto plano)", () => {
  it("editable: EX-17 lleva campos de formulario con los valores; plano: ninguno", async () => {
    const editable = await rellenarOficial("EX-17", SAMPLE, "RENOVACION", undefined, { editable: true });
    const plano = await rellenarOficial("EX-17", SAMPLE, "RENOVACION");
    const formEd = (await PDFDocument.load(editable!, { ignoreEncryption: true })).getForm();
    const fields = formEd.getFields();
    expect(fields.length, "editable sin campos").toBeGreaterThan(15);
    const nombre = fields.find((f) => { try { return (formEd.getTextField(f.getName()).getText() ?? "") === "JULIA"; } catch { return false; } });
    expect(nombre, "el valor JULIA no está en ningún campo").toBeDefined();
    const formPl = (await PDFDocument.load(plano!, { ignoreEncryption: true })).getForm();
    expect(formPl.getFields().length, "el plano no debe llevar campos").toBe(0);
  });
  it("editable: la p.2 de EX-15 lleva campos vacíos para escribir (casillas/especificar)", async () => {
    const editable = await rellenarOficial("EX-15", SAMPLE, undefined, undefined, { editable: true });
    const form = (await PDFDocument.load(editable!, { ignoreEncryption: true })).getForm();
    const blanks = form.getFields().filter((f) => f.getName().startsWith("b_"));
    expect(blanks.length, "faltan campos vacíos de la p.2").toBeGreaterThanOrEqual(10);
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

// ── Petición de Juan (01/09/2026): poder escribir en los campos que la ficha deja vacíos.
// Antes, `estampar` salía en seco si no había valor → ninguna casilla que rellenar, ni
// siquiera en modo editable. El PDF PLANO debe seguir sin dibujar nada.
describe("modo editable · campos vacíos", () => {
  const SIN_PADRES = { ...SAMPLE, nombrePadre: "", nombreMadre: "" };

  it("crea la casilla del padre aunque la ficha esté vacía", async () => {
    const editable = await rellenarOficial("EX-18", SIN_PADRES, undefined, undefined, { editable: true });
    const conDatos = await rellenarOficial("EX-18", SAMPLE, undefined, undefined, { editable: true });
    expect(editable).toBeTruthy();
    const pdf = await PDFDocument.load(editable!);
    const nombres = pdf.getForm().getFields().map((f) => f.getName());
    expect(nombres).toContain("f_nombrePadre");
    expect(nombres).toContain("f_nombreMadre");
    // y el caso con datos sigue funcionando igual
    const conPdf = await PDFDocument.load(conDatos!);
    expect(conPdf.getForm().getTextField("f_nombrePadre").getText()).toBe("CARLOS MENDOZA");
  });

  it("el PDF plano no gana campos ni dibuja nada por un dato vacío", async () => {
    const plano = await rellenarOficial("EX-18", SIN_PADRES);
    const pdf = await PDFDocument.load(plano!);
    expect(pdf.getForm().getFields().length).toBe(0);
  });

  it("una marca (sexo/estado civil) sin valor NO crea casilla", async () => {
    const sinSexo = await rellenarOficial("EX-18", { ...SAMPLE, sexo: "", estadoCivil: "" }, undefined, undefined, { editable: true });
    const nombres = (await PDFDocument.load(sinSexo!)).getForm().getFields().map((f) => f.getName());
    expect(nombres.some((n) => n.startsWith("f_sexo"))).toBe(false);
    expect(nombres.some((n) => n.startsWith("f_ec"))).toBe(false);
  });
});

// ── Géométrie des champs éditables (cas Juan, 02/09/2026) ────────────────────
// Trois défauts constatés sur l'EX-18 rempli : la croix tombait hors du carré, la
// casilla du NIE mordait le séparateur « -- » imprimé, et le champ « día » démarrait
// sur le « a » de « , a ». Positions imprimées relevées par probe pdfjs — ce sont
// elles qui font foi ici, pas les valeurs du code.
describe("modo editable · geometría de los campos", () => {
  const IMPRESO = {
    // EX-18, page 1 : séparateurs de la rangée N.I.E.
    nieSep1: [353.8, 358.1], nieSep2: [507.8, 510.0],
    // EX-18, page 2 : « , a » puis les tramos pointillés
    aLetra: [359.2, 363.5], deMes: [384.6, 391.6], deAno: [475.7, 483.0],
    // carré à cocher « Trabajador por cuenta ajena »
    caja: { x: 68.6, y: 657, w: 7.2, h: 8 },
  };
  const rects = async () => {
    const bytes = await rellenarOficial("EX-18", SAMPLE, undefined, undefined, { editable: true });
    const form = (await PDFDocument.load(bytes!)).getForm();
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const f of form.getFields()) {
      const r = f.acroField.getWidgets()[0]?.getRectangle();
      if (r) out[f.getName()] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  };

  it("ninguna casilla del NIE pisa los separadores impresos", async () => {
    const r = await rects();
    expect(r.f_nie1.x + r.f_nie1.w).toBeLessThan(IMPRESO.nieSep1[0]);
    expect(r.f_nie2.x).toBeGreaterThan(IMPRESO.nieSep1[1]);
    expect(r.f_nie2.x + r.f_nie2.w).toBeLessThan(IMPRESO.nieSep2[0]);
    expect(r.f_nie3.x).toBeGreaterThan(IMPRESO.nieSep2[1]);
  });

  it("los tramos de « lugar y fecha » no pisan la « a » ni los « de »", async () => {
    const r = await rects();
    expect(r.b_lf_lugar.x + r.b_lf_lugar.w).toBeLessThan(IMPRESO.aLetra[0]);
    expect(r.b_lf_dia.x).toBeGreaterThan(IMPRESO.aLetra[1]);
    expect(r.b_lf_dia.x + r.b_lf_dia.w).toBeLessThan(IMPRESO.deMes[0]);
    expect(r.b_lf_mes.x).toBeGreaterThan(IMPRESO.deMes[1]);
    expect(r.b_lf_mes.x + r.b_lf_mes.w).toBeLessThan(IMPRESO.deAno[0]);
    expect(r.b_lf_ano.x).toBeGreaterThan(IMPRESO.deAno[1]);
  });

  it("la casilla a marcar está CENTRADA sobre el cuadrado impreso", async () => {
    const r = await rects();
    const c = r.b_t_cuenta_ajena;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    expect(Math.abs(cx - (IMPRESO.caja.x + IMPRESO.caja.w / 2))).toBeLessThan(1);
    expect(Math.abs(cy - (IMPRESO.caja.y + IMPRESO.caja.h / 2))).toBeLessThan(1);
  });
});

// ── Lo que la ficha NUNCA rellena, pero el gestor debe poder escribir (Juan, 02/09) ──
describe("modo editable · casillas de marca y secciones 2/3", () => {
  const campos = async (datos = SAMPLE) => {
    const b = await rellenarOficial("EX-18", datos, undefined, undefined, { editable: true });
    return (await PDFDocument.load(b!)).getForm().getFields().map((f) => f.getName());
  };

  it("crea una casilla por CADA opción de sexo y estado civil", async () => {
    const n = await campos();
    for (const k of ["X", "H", "M"]) expect(n).toContain(`m_sexo_${k}`);
    for (const k of ["S", "C", "V", "D", "Sp"]) expect(n).toContain(`m_ec_${k}`);
  });

  it("la opción de la ficha viene premarcada, las demás vacías", async () => {
    const b = await rellenarOficial("EX-18", { ...SAMPLE, sexo: "H", estadoCivil: "C" }, undefined, undefined, { editable: true });
    const form = (await PDFDocument.load(b!)).getForm();
    expect(form.getTextField("m_sexo_H").getText()).toBe("X");
    expect(form.getTextField("m_sexo_M").getText() ?? "").toBe("");
    expect(form.getTextField("m_ec_C").getText()).toBe("X");
    expect(form.getTextField("m_ec_S").getText() ?? "").toBe("");
  });

  it("sin sexo en la ficha, las casillas existen igualmente (antes: ninguna)", async () => {
    const n = await campos({ ...SAMPLE, sexo: "", estadoCivil: "" });
    expect(n).toContain("m_sexo_H");
    expect(n).toContain("m_ec_S");
  });

  it("las secciones 2) y 3) son rellenables", async () => {
    const n = await campos();
    for (const k of ["r_nombre", "r_dni", "r_domicilio", "r_localidad", "r_cp", "r_provincia", "r_telefono", "r_email"]) expect(n).toContain(`b_${k}`);
    for (const k of ["n_nombre", "n_domicilio", "n_localidad", "n_cp", "n_provincia", "n_telefono", "n_email"]) expect(n).toContain(`b_${k}`);
    expect(n).toContain("b_consiento");
  });

  it("el PDF PLANO no gana ningún campo por todo esto", async () => {
    const plano = await rellenarOficial("EX-18", { ...SAMPLE, sexo: "H", estadoCivil: "C" });
    expect((await PDFDocument.load(plano!)).getForm().getFields().length).toBe(0);
  });
});
