import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unirPdfs } from "@/lib/pdf-unir";

async function conCampo(nombre: string, valor: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pag = pdf.addPage([300, 200]);
  const f = pdf.getForm().createTextField(nombre);
  f.addToPage(pag, { x: 20, y: 100, width: 200, height: 20 });
  f.setText(valor);
  return pdf.save();
}

describe("unir mandatos en un solo PDF", () => {
  it("editable: conserva los campos de cada parte, sin que choquen los nombres iguales", async () => {
    const out = await unirPdfs([
      { bytes: await conCampo("Dña", "Ana"), prefijo: "ext_" },
      { bytes: await conCampo("Dña", "Luis"), prefijo: "nac_" },
    ], { editable: true });
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPageCount()).toBe(2);
    const campos = Object.fromEntries(pdf.getForm().getFields().map((f) => [f.getName(), pdf.getForm().getTextField(f.getName()).getText()]));
    expect(campos).toEqual({ ext_Dña: "Ana", nac_Dña: "Luis" });
  });
  it("plano: sin campos, una página por parte", async () => {
    const out = await unirPdfs([
      { bytes: await conCampo("Dña", "Ana"), prefijo: "ext_" },
      { bytes: await conCampo("mandante1", "Luis"), prefijo: "gen_" },
    ], { editable: false });
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toHaveLength(0);
  });
});
