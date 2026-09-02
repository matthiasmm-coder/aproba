import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { rellenarOficial, formulariosOficiales } from "./ex-forms";
import type { DatosForm } from "./formularios";

// NINGÚN campo editable puede tapar una PALABRA impresa del formulario oficial.
// Es la clase de fallo que reportó Juan el 02/09/2026 («N.I.E. 24-- 245»): la casilla
// se comía el separador impreso. Se comprueba en LOS 13 MODELOS, porque la geometría
// vive en código compartido (vec, caja, ANCHO, P1/P2_BLANKS).
//
// Lo que NO es un solape —y por eso hay que medirlo con precisión—:
//   · las conduites de puntos: el campo va justo encima, es su función;
//   · el cuadrado «□»: la casilla a marcar se centra sobre él.
// Una misma línea impresa mezcla las dos cosas («PERÍODO … ……… FECHA DE INICIO …»),
// así que no basta con mirar la caja del item entero: se localizan los TRAMOS de
// palabras dentro de la línea, midiendo con las métricas de la fuente calibradas
// sobre la anchura real que devuelve pdfjs.

const SAMPLE: DatosForm = {
  apellido1: "DIALLO", apellido2: "DIAZ", nombre: "AICHA", nacionalidad: "SENEGALESA",
  nie1: "Y", nie2: "1234567", nie3: "L", pasaporte: "SN9087654",
  fechaD: "14", fechaM: "03", fechaA: "1992", lugarNac: "DAKAR", paisNac: "SENEGAL",
  sexo: "M", estadoCivil: "S", nombrePadre: "MAMADOU DIALLO", nombreMadre: "FATOU DIAZ",
  domicilio: "CALLE ARAGON", numero: "145", piso: "3B", localidad: "BARCELONA",
  cp: "08011", provincia: "BARCELONA", telefono: "600111222", email: "aicha@correo.es",
} as DatosForm;

const esRelleno = (ch: string) => /[.…_·\s□☐▯-]/.test(ch);
// Un « / » ISOLÉ entre deux tramos de points (« …../…../…… ») est un SÉPARATEUR de
// créneau, pas un mot : le champ du jour doit pouvoir mordre dessus, sinon Aperçu rogne
// le second chiffre (seuil mesuré : largeur 14). Un « / » à l'intérieur d'un mot
// (« DNI/NIE/PAS », « UE/EEE/Suiza ») reste protégé, car il n'est jamais isolé.
const esSeparador = (tramo: string) => tramo === "/";
// Helvetica estándar (WinAnsi) no sabe medir «□» y compañía: se sustituyen por un
// espacio ANTES de medir. Son caracteres de relleno, así que no falsean el cálculo.
const medible = (s: string) => s.replace(/[^\u0000-\u00ff\u2026\u2018-\u201d\u20ac]/g, " ");
const nuestro = (n: string) => /^(f_|b_|m_)/.test(n);

describe("ningún campo editable tapa una palabra impresa", () => {
  for (const code of formulariosOficiales().sort()) {
    it(`${code}`, async () => {
      const bytes = await rellenarOficial(code, SAMPLE, undefined, undefined, { editable: true });
      expect(bytes).toBeTruthy();

      const medidor = await PDFDocument.create();
      const font = await medidor.embedFont(StandardFonts.Helvetica);
      const doc = await getDocument({ data: new Uint8Array(await readFile(`forms/ex/${code}.pdf`)), useSystemFonts: true }).promise;

      // Tramos de PALABRAS (no de puntos) con su x real dentro de cada línea impresa.
      const palabras: { p: number; x: number; y: number; w: number; s: string }[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const c = await (await doc.getPage(p)).getTextContent();
        for (const i of c.items as { str: string; transform: number[]; width?: number }[]) {
          const s = i.str;
          const anchoReal = i.width ?? 0;
          if (!s.trim() || anchoReal <= 0) continue;
          const m = medible(s);
          let bruto = 0;
          try { bruto = font.widthOfTextAtSize(m, 100); } catch { continue; }
          if (bruto <= 0) continue;
          const talla = (anchoReal / bruto) * 100; // taille effective de la ligne
          const x0 = i.transform[4];
          let ini = -1;
          for (let k = 0; k <= s.length; k++) {
            const dentro = k < s.length && !esRelleno(s[k]);
            if (dentro && ini < 0) ini = k;
            if (!dentro && ini >= 0) {
              const a = x0 + font.widthOfTextAtSize(m.slice(0, ini), talla);
              const b = x0 + font.widthOfTextAtSize(m.slice(0, k), talla);
              const tramo = s.slice(ini, k);
              if (!esSeparador(tramo)) palabras.push({ p: p - 1, x: a, y: i.transform[5], w: b - a, s: tramo });
              ini = -1;
            }
          }
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
          for (const t of palabras) {
            if (t.p !== pi || Math.abs(cy - (t.y + 3)) > 5) continue;
            const solape = Math.min(r.x + r.width, t.x + t.w) - Math.max(r.x, t.x);
            if (solape > 1.5) choques.push(`${f.getName()} tapa «${t.s.slice(0, 22)}» (${solape.toFixed(1)}pt, p.${pi + 1})`);
          }
        }
      }
      expect(choques).toEqual([]);
    }, 30_000);
  }
});
