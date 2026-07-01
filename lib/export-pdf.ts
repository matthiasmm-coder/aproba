import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { eur, IVA, totalesFactura, type Factura } from "@/lib/facturas";

// PDF de factura para el export ZIP (pdf-lib reproduce components/factura-view.tsx).
// pdf-lib + StandardFont solo codifica WinAnsi → saneamos lo que no entra (nombres no
// latinos, p.ej. chino/árabe, salen como '?'; el importe/nº se conservan siempre).

export type EmisorPdf = { nombre: string; nif: string | null; domicilio?: string | null; email?: string | null };

const WIN_EXTRA = "€…‚ƒ„†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s: string) =>
  (s ?? "").split("").map((c) => {
    const n = c.charCodeAt(0);
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_EXTRA.includes(c) ? c : "?";
  }).join("");

function wrap(s: string, max: number): string[] {
  const out: string[] = [];
  for (const parrafo of (s ?? "").split("\n")) {
    let linea = "";
    for (const w of parrafo.split(/\s+/)) {
      if ((linea + " " + w).trim().length > max) { if (linea) out.push(linea); linea = w; }
      else linea = (linea + " " + w).trim();
    }
    out.push(linea);
  }
  return out;
}

export async function facturaToPdf(f: Factura, emisor: EmisorPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const A4: [number, number] = [595.28, 841.89];
  let page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, M = 50;
  const dark = rgb(0.12, 0.16, 0.23), slate = rgb(0.28, 0.33, 0.41), grey = rgb(0.55, 0.6, 0.66);
  let y = 792;

  // Las closures usan `page`/`y` actuales; al saltar de página se reasignan (facturas largas).
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = dark) => page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, yy: number, size: number, f: PDFFont = font, color = dark) => {
    const ss = safe(s); page.drawText(ss, { x: xr - f.widthOfTextAtSize(ss, size), y: yy, size, font: f, color });
  };
  const line = (x1: number, x2: number, yy: number, w = 0.5, color = grey) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: w, color });
  const saltoSi = (min = 70) => { if (y < min) { page = doc.addPage(A4); y = 800; } };

  // Cabecera: emisor (izq) + FACTURA nº (der)
  text(emisor.nombre || "Mi despacho", M, 15, bold);
  right("FACTURA", W - M, y + 2, 9, bold, grey);
  right(f.numero, W - M, y - 15, 15, bold);
  right(`Fecha: ${f.fecha}`, W - M, y - 32, 9, font, slate);
  if (f.vence) right(`Vencimiento: ${f.vence}`, W - M, y - 45, 9, font, slate);
  y -= 18;
  for (const c of [emisor.nif ? `NIF/CIF ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean) as string[]) {
    text(c, M, 9, font, slate); y -= 13;
  }

  y -= 20;
  text("FACTURAR A", M, 8, bold, grey); y -= 15;
  text(f.cliente, M, 12, bold); y -= 30;

  // Tabla de líneas
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const suplidos = f.suplidos ?? [];
  const { base, iva, suplidosTotal, total } = totalesFactura(lineas, suplidos);
  const xBase = 360, xIva = 445, xImp = W - M;
  text("CONCEPTO", M, 8, bold, grey); right("BASE", xBase, y, 8, bold, grey); right("IVA", xIva, y, 8, bold, grey); right("IMPORTE", xImp, y, 8, bold, grey);
  y -= 6; line(M, W - M, y, 1, slate); y -= 16;
  for (const l of lineas) {
    for (const [i, ln] of wrap(l.concepto, 60).entries()) { saltoSi(); text(ln, M, 10); if (i === 0) { right(eur(l.base), xBase, y, 10); right(`${Math.round(IVA * 100)} %`, xIva, y, 10, font, slate); right(eur(l.base), xImp, y, 10); } y -= 15; }
  }
  if (suplidos.length) {
    saltoSi(); y -= 6; text("SUPLIDOS (gastos sin IVA)", M, 8, bold, grey); y -= 15;
    for (const s of suplidos) { saltoSi(); text(s.concepto, M, 10); right("Exento", xIva, y, 9, font, slate); right(eur(s.importe), xImp, y, 10); y -= 15; }
  }

  // Totales (juntos en la misma página)
  saltoSi(140);
  y -= 6; line(xBase - 10, W - M, y, 0.5); y -= 16;
  const totLine = (label: string, val: string, b = false) => { right(label, xIva - 8, y, 10, b ? bold : font, b ? dark : slate); right(val, xImp, y, 10, b ? bold : font, b ? dark : slate); y -= 16; };
  totLine("Base imponible", eur(base));
  totLine(`IVA (${Math.round(IVA * 100)} %)`, eur(iva));
  if (suplidosTotal > 0) totLine("Suplidos (sin IVA)", eur(suplidosTotal));
  line(xBase - 10, W - M, y + 6, 0.5); totLine("TOTAL", eur(total), true);

  if (f.notas) {
    saltoSi(); y -= 12; text("Notas", M, 8, bold, grey); y -= 14;
    for (const ln of wrap(f.notas, 95)) { saltoSi(); text(ln, M, 9, font, slate); y -= 12; }
  }

  page.drawText(safe(`Estado: ${f.estado}  ·  Generado con Aproba`), { x: M, y: 40, size: 8, font, color: grey });
  return doc.save();
}
