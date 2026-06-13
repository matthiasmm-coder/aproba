import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Formulario } from "./formularios";

// Génère un PDF réel (A4) à partir de la structure `Formulario` (sections + champs).
// Mise en page sobre type formulaire officiel : en-tête organismo, casillas du trámite,
// sections numérotées, champs en grille, pied de page. C'est un brouillon propre et
// téléchargeable — l'overlay sur le PDF officiel exact de la sede reste une étape future.

const A4 = { w: 595.28, h: 841.89 };
const M = 46; // marge
const CW = A4.w - M * 2; // largeur de contenu

// pdf-lib (Helvetica WinAnsi) n'encode pas l'unicode hors Latin-1 → on nettoie.
const clean = (s: unknown): string =>
  String(s ?? "")
    .replace(/€/g, " EUR")
    .replace(/[—–]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");

const INK = rgb(0.1, 0.12, 0.16);
const GRAY = rgb(0.5, 0.52, 0.56);
const LINE = rgb(0.78, 0.8, 0.83);
const BAR = rgb(0.93, 0.94, 0.96);
const BOX = rgb(0.98, 0.985, 0.99);

type Ctx = { referencia: string; clienteNombre: string; gestoria: string; fecha: string };

export async function formularioToPdf(f: Formulario, ctx: Ctx): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${f.tipo} — ${ctx.referencia}`);
  pdf.setAuthor("Aproba");
  pdf.setSubject(f.titulo);

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = M; // décalage depuis le haut

  const text = (x: number, topY: number, str: string, fnt: PDFFont, size: number, color = INK) =>
    page.drawText(clean(str), { x, y: A4.h - topY - size, size, font: fnt, color });

  const wrap = (str: string, fnt: PDFFont, size: number, maxW: number): string[] => {
    const words = clean(str).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (fnt.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  const truncate = (str: string, fnt: PDFFont, size: number, maxW: number): string => {
    let s = clean(str);
    if (fnt.widthOfTextAtSize(s, size) <= maxW) return s;
    while (s.length > 1 && fnt.widthOfTextAtSize(s + "...", size) > maxW) s = s.slice(0, -1);
    return s + "...";
  };

  const need = (h: number) => {
    if (y + h > A4.h - M - 24) {
      page = pdf.addPage([A4.w, A4.h]);
      y = M;
    }
  };

  // ── En-tête ────────────────────────────────────────────────────────────────
  const tipoBoxW = 66;
  text(M, y, f.organismo, font, 8, GRAY);
  const titulo = wrap(f.titulo, bold, 13, CW - tipoBoxW - 14);
  let ty = y + 13;
  for (const ln of titulo) {
    text(M, ty, ln, bold, 13);
    ty += 16;
  }
  // boîte du type (EX-10 / 790-012)
  page.drawRectangle({ x: A4.w - M - tipoBoxW, y: A4.h - y - 26, width: tipoBoxW, height: 26, borderColor: INK, borderWidth: 1.2 });
  const tw = bold.widthOfTextAtSize(f.tipo, 12);
  text(A4.w - M - tipoBoxW / 2 - tw / 2, y + 8, f.tipo, bold, 12);

  y = Math.max(ty, y + 30) + 2;
  page.drawLine({ start: { x: M, y: A4.h - y }, end: { x: A4.w - M, y: A4.h - y }, thickness: 1.4, color: INK });
  y += 16;

  // ── Casillas (type de trámite) ───────────────────────────────────────────
  if (f.casillas?.length) {
    let cx = M;
    const sz = 11;
    for (const c of f.casillas) {
      const lbl = clean(c.label);
      const lblW = font.widthOfTextAtSize(lbl, 9);
      if (cx + 16 + lblW > A4.w - M) {
        cx = M;
        y += 18;
      }
      page.drawRectangle({ x: cx, y: A4.h - y - sz, width: sz, height: sz, borderColor: c.marcada ? INK : GRAY, borderWidth: 1, color: c.marcada ? INK : undefined });
      if (c.marcada) text(cx + 2, y - 0.5, "X", bold, 9, rgb(1, 1, 1));
      text(cx + sz + 5, y + 1, lbl, font, 9);
      cx += sz + 9 + lblW + 16;
    }
    y += 22;
  }

  // ── Sections ───────────────────────────────────────────────────────────────
  const drawField = (x: number, w: number, label: string, value: string) => {
    text(x, y, label.toUpperCase(), bold, 6.5, GRAY);
    page.drawRectangle({ x, y: A4.h - y - 12 - 18, width: w, height: 18, color: BOX, borderColor: LINE, borderWidth: 0.7 });
    text(x + 5, y + 12 + 4.5, truncate(value, font, 10, w - 10), font, 10);
  };
  const FIELD_H = 12 + 18 + 12; // label + box + gap

  for (const s of f.secciones) {
    need(20 + FIELD_H);
    // barre de titre de section
    page.drawRectangle({ x: M, y: A4.h - y - 16, width: CW, height: 16, color: BAR });
    text(M + 6, y + 4, s.titulo, bold, 9, rgb(0.32, 0.34, 0.38));
    y += 16 + 10;

    const campos = s.campos;
    let i = 0;
    while (i < campos.length) {
      const c = campos[i];
      need(FIELD_H);
      if ((c.ancho ?? "full") === "full") {
        drawField(M, CW, c.label, c.value);
        i += 1;
      } else {
        const gap = 14;
        const half = (CW - gap) / 2;
        drawField(M, half, c.label, c.value);
        const c2 = campos[i + 1];
        if (c2 && (c2.ancho ?? "full") !== "full") {
          drawField(M + half + gap, half, c2.label, c2.value);
          i += 2;
        } else i += 1;
      }
      y += FIELD_H;
    }
    y += 8;
  }

  // ── Pied de page (sur chaque page) ─────────────────────────────────────────
  const pies = pdf.getPages();
  pies.forEach((p, idx) => {
    const fy = A4.h - M + 8;
    p.drawLine({ start: { x: M, y: A4.h - (A4.h - M) }, end: { x: A4.w - M, y: A4.h - (A4.h - M) }, thickness: 0.6, color: LINE });
    p.drawText(clean(`Generado con Aproba · Expediente ${ctx.referencia} · ${ctx.gestoria}`), { x: M, y: A4.h - fy, size: 7, font, color: GRAY });
    const der = clean(`Borrador — revisar antes de presentar · ${idx + 1}/${pies.length}`);
    p.drawText(der, { x: A4.w - M - font.widthOfTextAtSize(der, 7), y: A4.h - fy, size: 7, font, color: GRAY });
  });

  return pdf.save();
}
