import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { tasaEditable, norm } from "./tasa-editable";

// Impreso 790 sintético: dos «copias» (páginas) con los mismos datos impresos como texto plano,
// más numeración del impreso que NO debe confundirse con datos cortos («1»).
async function impresoPlano() {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const pg = pdf.addPage([595, 842]);
    pg.drawText("N.I.F./N.I.E.", { x: 64, y: 700, size: 7, font: f });
    pg.drawText("Y1234567L", { x: 67, y: 685, size: 10, font: f });
    pg.drawText("Apellidos y nombre", { x: 206, y: 700, size: 7, font: f });
    pg.drawText("DIALLO DIAZ, AICHA", { x: 206, y: 685, size: 10, font: f });
    pg.drawText("CALLE", { x: 65, y: 660, size: 10, font: f });
    pg.drawText("ARAGON", { x: 113, y: 660, size: 10, font: f });
    pg.drawText("1", { x: 352, y: 660, size: 10, font: f }); // piso = dato
    pg.drawText("1", { x: 30, y: 400, size: 8, font: StandardFonts.HelveticaBold ? f : f }); // numeración impresa (otro cuerpo)
    pg.drawText("32.17", { x: 530, y: 100, size: 10, font: f }); // importe: no se toca
  }
  return pdf.save();
}

describe("tasaEditable", () => {
  it("pone un campo por dato, con un widget por copia, y no toca el importe", async () => {
    const plano = await impresoPlano();
    const { pdf, campos } = await tasaEditable(new Uint8Array(plano), {
      nif: "y1234567l", apellidosNombre: ["DIALLO DIAZ", "DIALLO DIAZ, AICHA"], calle: "CALLE", via: "Aragón", piso: "1", importeNo: "99,99",
    });
    expect(campos).toBe(5);
    const form = (await PDFDocument.load(pdf)).getForm();
    const nombres = form.getFields().map((x) => x.getName()).sort();
    expect(nombres).toEqual(["t_apellidosNombre", "t_calle", "t_nif", "t_piso", "t_via"]);
    for (const n of nombres) expect(form.getField(n).acroField.getWidgets().length, n).toBe(2);
    expect(form.getTextField("t_apellidosNombre").getText()).toBe("DIALLO DIAZ, AICHA");
    expect(form.getTextField("t_via").getText()).toBe("ARAGON");
    // El «1» del piso se localiza por la fuente/cuerpo de los datos: un solo ítem por página.
    const piso = form.getTextField("t_piso").acroField.getWidgets().map((w) => w.getRectangle());
    expect(piso.every((r) => Math.abs(r.x - 350) < 3 && Math.abs(r.y - 657) < 4)).toBe(true);
  });
  it("sin coincidencias devuelve el PDF intacto", async () => {
    const plano = new Uint8Array(await impresoPlano());
    const { pdf, campos } = await tasaEditable(plano, { nif: "NADA" });
    expect(campos).toBe(0);
    expect(pdf).toBe(plano); // el mismo objeto: ni se carga ni se reescribe
  });
  it("norm: sin acentos, mayúsculas, espacios plegados", () => {
    expect(norm("  Muñoz   Peña ")).toBe("MUNOZ PENA");
  });
});
