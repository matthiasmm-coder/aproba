import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { rellenarOficial, formulariosOficiales } from "./ex-forms";
import type { DatosForm } from "./formularios";

// NINGÚN campo editable puede tapar texto impreso del formulario oficial.
// Es la clase de fallo que reportó Juan el 02/09/2026 («N.I.E. 24-- 245»): la casilla
// se comía el separador impreso. Se comprueba en LOS 13 MODELOS, no solo en el que
// motivó el arreglo — la geometría vive en código compartido (vec, caja, ANCHO).
//
// Dos cosas NO son chevauchement, y por eso se excluyen:
//   · las líneas de puntos («………», «….. a ….. de …..») → el campo va justo encima;
//   · el cuadrado «□» → la casilla a marcar se centra sobre él.

const SAMPLE: DatosForm = {
  apellido1: "DIALLO", apellido2: "DIAZ", nombre: "AICHA", nacionalidad: "SENEGALESA",
  nie1: "Y", nie2: "1234567", nie3: "L", pasaporte: "SN9087654",
  fechaD: "14", fechaM: "03", fechaA: "1992", lugarNac: "DAKAR", paisNac: "SENEGAL",
  sexo: "M", estadoCivil: "S", nombrePadre: "MAMADOU DIALLO", nombreMadre: "FATOU DIAZ",
  domicilio: "CALLE ARAGON", numero: "145", piso: "3B", localidad: "BARCELONA",
  cp: "08011", provincia: "BARCELONA", telefono: "600111222", email: "aicha@correo.es",
} as DatosForm;

const esDiana = (s: string) => {
  const t = s.trim();
  if (!t) return true;
  const relleno = (t.match(/[.…_·\s□☐▯-]/g) ?? []).length;
  return relleno / t.length > 0.6;
};
const nuestro = (n: string) => /^(f_|b_|m_)/.test(n);

describe("ningún campo editable tapa texto impreso", () => {
  for (const code of formulariosOficiales().sort()) {
    it(`${code}`, async () => {
      const bytes = await rellenarOficial(code, SAMPLE, undefined, undefined, { editable: true });
      expect(bytes).toBeTruthy();

      const doc = await getDocument({ data: new Uint8Array(await readFile(`forms/ex/${code}.pdf`)), useSystemFonts: true }).promise;
      const impreso: { p: number; x: number; y: number; w: number; s: string }[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const c = await (await doc.getPage(p)).getTextContent();
        for (const i of c.items as { str: string; transform: number[]; width?: number }[]) {
          if (!i.str.trim() || esDiana(i.str)) continue;
          impreso.push({ p: p - 1, x: i.transform[4], y: i.transform[5], w: i.width ?? 0, s: i.str.trim() });
        }
      }

      const pdf = await PDFDocument.load(bytes!);
      const pages = pdf.getPages();
      const choques: string[] = [];
      for (const f of pdf.getForm().getFields()) {
        if (!nuestro(f.getName())) continue;
        for (const wid of f.acroField.getWidgets()) {
          const r = wid.getRectangle();
          const pi = Math.max(0, pages.findIndex((pg) => pg.ref === wid.P()));
          const cy = r.y + r.height / 2;
          for (const t of impreso) {
            if (t.p !== pi || Math.abs(cy - (t.y + 3)) > 5) continue;
            const solape = Math.min(r.x + r.width, t.x + t.w) - Math.max(r.x, t.x);
            if (solape > 1.5) choques.push(`${f.getName()} tapa «${t.s.slice(0, 24)}» (${solape.toFixed(1)}pt, p.${pi + 1})`);
          }
        }
      }
      expect(choques).toEqual([]);
    }, 30_000);
  }
});
