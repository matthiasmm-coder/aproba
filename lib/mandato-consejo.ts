import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, PDFString, PDFTextField, StandardFonts, type PDFForm } from "pdf-lib";
import { normalizarFuenteDA } from "@/lib/ex-forms";
import type { ModeloMandato } from "@/lib/mandato-modelos";

// Rellena el IMPRESO OFICIAL del Consejo General (forms/mandatos/consejo-*.pdf) con las
// casillas de camposMandatoConsejo. Se escribe en los campos del propio AcroForm: el
// formato, el texto legal y el logo del Consejo quedan intactos.
//   editable: true  → descarga del GESTOR (puede completar el segundo mandante, la
//                     representación de un tercero…), fuente /Helv como declara el impreso.
//   editable: false → lo que sale hacia el CLIENTE (portal, email): aplanado, como los EX.

// Helvetica (WinAnsi): un nombre en árabe o chino haría lanzar a pdf-lib y rompería el PDF
// entero; se quita lo no imprimible (el hueco queda para escribirlo a mano).
const limpiar = (s: string) =>
  String(s ?? "").replace(/€/g, " EUR").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[\x00-\x1F\x7F]/g, " ").replace(/[^\x00-\xFF]/g, "").replace(/\s+/g, " ").trim();

const TOPE = 9;      // cuerpo máximo: el del texto impreso alrededor
const MINIMO = 5.5;  // por debajo no se lee; mejor que corte el visor a que sea ilegible

export async function rellenarMandatoConsejo(
  modelo: Exclude<ModeloMandato, "general">,
  campos: Record<string, string>,
  opts: { editable: boolean },
): Promise<Uint8Array> {
  const bytes = await readFile(path.join(process.cwd(), "forms", "mandatos", `consejo-${modelo}.pdf`));
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [nombre, valor] of Object.entries(campos)) {
    const v = limpiar(valor);
    if (!v) continue;
    let f: PDFTextField;
    try { f = form.getTextField(nombre); } catch { continue; } // impreso cambiado: esa casilla se queda vacía
    const r = f.acroField.getWidgets()[0]?.getRectangle();
    const ancho = r?.width ?? 100, alto = r?.height ?? 10;
    // Cuerpo que CABE: las casillas van de 16 pt (el nº de la calle) a 374 pt.
    const cabe = (ancho - 3) / Math.max(helv.widthOfTextAtSize(v, 1), 0.01);
    const cuerpo = Math.max(MINIMO, Math.min(TOPE, cabe, alto - 1));
    // El impreso del Consejo (exportado de Word) escribe su /DA con la barra en octal
    // («\\057Helv  0 Tf 0 g»): pdf-lib no reconoce ahí la fuente y setFontSize lanza. Se
    // normaliza antes de escribir (y si no hubiera /DA, se pone el de la fuente del impreso).
    const da = (f.acroField.getDefaultAppearance() ?? "").replace(/\\057/g, "/");
    f.acroField.setDefaultAppearance(/\/\S+\s+[\d.]*\s*Tf/.test(da) ? da : "/Helv 0 Tf 0 g");
    f.setText(v);
    f.setFontSize(Math.round(cuerpo * 10) / 10);
  }
  form.updateFieldAppearances(helv);
  if (opts.editable) { normalizarFuenteDA(form); daEnUnaLinea(form); }
  else form.flatten();
  return pdf.save();
}

// pdf-lib deja el /DA en dos líneas («0 g\n/Helv 9 Tf») y Vista Previa (PDFKit), al editar,
// pierde entonces la fuente y el tamaño (visto en los EX, 02/09/2026). Una sola línea.
function daEnUnaLinea(form: PDFForm) {
  for (const f of form.getFields()) {
    if (!(f instanceof PDFTextField)) continue;
    const m = (f.acroField.getDefaultAppearance() ?? "").match(/\/([A-Za-z0-9#_+-]+)\s+([\d.]+)\s+Tf/);
    if (!m) continue;
    const linea = `/${m[1]} ${m[2]} Tf 0 g`;
    f.acroField.setDefaultAppearance(linea);
    for (const w of f.acroField.getWidgets()) if (w.dict.get(PDFName.of("DA"))) w.dict.set(PDFName.of("DA"), PDFString.of(linea));
  }
}
