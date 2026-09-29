import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { eur, IVA, totalesFactura, retencionDe, r2, type Factura } from "@/lib/facturas";
import { embeberLogo, medidasLogo } from "@/lib/pdf-logo";
import { LEYENDA_VERIFACTU, TITULO_QR, qrPng } from "@/lib/verifactu-qr";

// PDF de factura para el export ZIP (pdf-lib reproduce components/factura-view.tsx).
// pdf-lib + StandardFont solo codifica WinAnsi → saneamos lo que no entra (nombres no
// latinos, p.ej. chino/árabe, salen como '?'; el importe/nº se conservan siempre).

export type EmisorPdf = { nombre: string; nif: string | null; domicilio?: string | null; email?: string | null; logo?: string | null };

const WIN_EXTRA = "€…‚ƒ„†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s: string) =>
  (s ?? "").split("").map((c) => {
    const n = c.charCodeAt(0);
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_EXTRA.includes(c) ? c : "?";
  }).join("");

// Parte por ANCHO medido, no por nº de caracteres: 60 caracteres en mayúsculas llegaban a
// x ≈ 414 y pisaban la columna BASE (un importe de 1.234,56 € empieza en 312,7). Una
// «palabra» más ancha que la columna se trocea. Devuelve el texto ya saneado (WinAnsi).
function partir(s: string, f: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of (s ?? "").split("\n")) {
    let linea = "";
    for (const bruta of parrafo.split(/\s+/).filter(Boolean)) {
      let w = safe(bruta);
      while (w.length > 1 && f.widthOfTextAtSize(w, size) > ancho) {
        let n = w.length;
        while (n > 1 && f.widthOfTextAtSize(w.slice(0, n), size) > ancho) n--;
        if (linea) { out.push(linea); linea = ""; }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const t = linea ? `${linea} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) <= ancho) linea = t;
      else { out.push(linea); linea = w; }
    }
    out.push(linea);
  }
  return out;
}

// `extras.verifactuUrl`: URL de verificación de la AEAT (registro VERI*FACTU) → QR
// tributario de ~32 mm con su leyenda (art. 21 Orden HAC/1177/2024), a la derecha del
// bloque «Facturar a». Sin URL, el documento es el de siempre.
// `titulo` / `etiquetaVence` / `aviso` / `pie`: el mismo documento para una PROFORMA
// (29/09/2026): «FACTURA PROFORMA», «Válida hasta» y la mención de que no es una factura.
export type ExtrasPdf = { verifactuUrl?: string | null; titulo?: string; etiquetaVence?: string; aviso?: string; pie?: string };
export async function facturaToPdf(f: Factura, emisorVivo: EmisorPdf, extras: ExtrasPdf = {}): Promise<Uint8Array> {
  // Emisor CONGELADO al emitir (factura-retencion-emisor.sql) manda sobre el vivo; el logo sigue
  // siendo el actual (no es un dato fiscal). Todas las vías de PDF pasan por aquí.
  const fx = f.emisorDatos;
  const emisor: EmisorPdf = fx?.nombre ? { ...emisorVivo, nombre: fx.nombre, nif: fx.nif ?? null, domicilio: fx.domicilio ?? null, email: fx.email ?? null } : emisorVivo;
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

  // Logo del despacho arriba del todo: baja el bloque entero, las dos columnas a la vez.
  const logo = await embeberLogo(doc, emisor.logo);
  if (logo) {
    const { ancho, alto } = medidasLogo(logo, 150, 36);
    page.drawImage(logo, { x: M, y: y - alto + 12, width: ancho, height: alto });
    y -= alto + 4;
  }

  // Cabecera: emisor (izq) + FACTURA nº (der)
  text(emisor.nombre || "Mi despacho", M, 15, bold);
  right(extras.titulo ?? "FACTURA", W - M, y + 2, 9, bold, grey);
  right(f.numero, W - M, y - 15, 15, bold);
  right(`Fecha: ${f.fecha}`, W - M, y - 32, 9, font, slate);
  if (f.vence) right(`${extras.etiquetaVence ?? "Vencimiento"}: ${f.vence}`, W - M, y - 45, 9, font, slate);
  y -= 18;
  for (const c of [emisor.nif ? `NIF/CIF ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean) as string[]) {
    text(c, M, 9, font, slate); y -= 13;
  }

  y -= 20;
  const yBloqueCliente = y + 10;
  text("FACTURAR A", M, 8, bold, grey); y -= 15;
  text(f.cliente, M, 12, bold); y -= 15;
  // Snapshot fiscal congelado al emitir (documento + dirección) — pedido de Juan.
  for (const dato of [f.clienteDatos?.documento, f.clienteDatos?.direccion].filter(Boolean) as string[]) {
    text(dato, M, 9, font, slate); y -= 13;
  }
  y -= 15;

  // QR tributario (VERI*FACTU): columna derecha, a la altura del bloque del cliente. La
  // tabla de líneas arranca por debajo del QR para no pisarlo.
  if (extras.verifactuUrl) {
    try {
      const png = await doc.embedPng(await qrPng(extras.verifactuUrl));
      const lado = 91; // ≈ 32 mm (norma: 30-40 mm)
      const xq = W - M - lado;
      page.drawText(TITULO_QR, { x: xq, y: yBloqueCliente + 3, size: 7, font: bold, color: grey });
      page.drawImage(png, { x: xq, y: yBloqueCliente - lado, width: lado, height: lado });
      const leyenda = partir(`${LEYENDA_VERIFACTU} · VERI*FACTU`, font, 6.5, lado);
      leyenda.forEach((ln, i) => page.drawText(safe(ln), { x: xq, y: yBloqueCliente - lado - 9 - i * 8, size: 6.5, font, color: slate }));
      y = Math.min(y, yBloqueCliente - lado - 9 - leyenda.length * 8 - 10);
    } catch (e) { console.error("[pdf] QR VERI*FACTU", e instanceof Error ? e.message : e); }
  }

  // Tabla de líneas
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const suplidos = f.suplidos ?? [];
  const { base, iva, suplidosTotal, total } = totalesFactura(lineas, suplidos);
  const xBase = 360, xIva = 445, xImp = W - M;
  text("CONCEPTO", M, 8, bold, grey); right("BASE", xBase, y, 8, bold, grey); right("IVA", xIva, y, 8, bold, grey); right("IMPORTE", xImp, y, 8, bold, grey);
  y -= 6; line(M, W - M, y, 1, slate); y -= 16;
  // Columna CONCEPTO: hasta 8 pt antes del importe más ancho de BASE (alineado a la derecha).
  const anchoConcepto = xBase - 8 - M - Math.max(...lineas.map((l) => font.widthOfTextAtSize(safe(eur(l.base)), 10)));
  for (const l of lineas) {
    for (const [i, ln] of partir(l.concepto, font, 10, anchoConcepto).entries()) { saltoSi(); text(ln, M, 10); if (i === 0) { right(eur(l.base), xBase, y, 10); right(`${Math.round(IVA * 100)} %`, xIva, y, 10, font, slate); right(eur(l.base), xImp, y, 10); } y -= 15; }
  }
  if (suplidos.length) {
    saltoSi(); y -= 6; text("SUPLIDOS (gastos sin IVA)", M, 8, bold, grey); y -= 15;
    // Sin columna BASE: el concepto llega hasta 8 pt antes de «No sujeto».
    const anchoSuplido = xIva - 8 - M - font.widthOfTextAtSize("No sujeto", 9);
    for (const s of suplidos) {
      for (const [i, ln] of partir(s.concepto, font, 10, anchoSuplido).entries()) { saltoSi(); text(ln, M, 10); if (i === 0) { right("No sujeto", xIva, y, 9, font, slate); right(eur(s.importe), xImp, y, 10); } y -= 15; }
    }
  }

  // Totales (juntos en la misma página)
  saltoSi(140);
  y -= 6; line(xBase - 10, W - M, y, 0.5); y -= 16;
  const totLine = (label: string, val: string, b = false) => { right(label, xIva - 8, y, 10, b ? bold : font, b ? dark : slate); right(val, xImp, y, 10, b ? bold : font, b ? dark : slate); y -= 16; };
  totLine("Base imponible", eur(base));
  totLine(`IVA (${Math.round(IVA * 100)} %)`, eur(iva));
  if (suplidosTotal > 0) totLine("Suplidos (sin IVA)", eur(suplidosTotal));
  // La raya va en el hueco entre la línea anterior y TOTAL (a y + 6 cruzaba las mayúsculas
  // de «TOTAL», que parecía tachado): 7 pt bajo la línea anterior, ~6 pt sobre TOTAL.
  // Retención de IRPF: el TOTAL de la factura no cambia; debajo, la retención y lo que se paga.
  const retencion = f.retencion != null ? r2(Number(f.retencion)) : retencionDe(base, f.retencionPct);
  y -= 4; line(xBase - 10, W - M, y + 13, 0.5); totLine(retencion ? "TOTAL FACTURA" : "TOTAL", eur(total), true);
  if (retencion) {
    totLine(`Retención IRPF${f.retencionPct ? ` (${f.retencionPct} %)` : ""}`, `-${eur(Math.abs(retencion))}`);
    y -= 4; line(xBase - 10, W - M, y + 13, 0.5); totLine("TOTAL A PAGAR", eur(r2(total - retencion)), true);
  }

  if (f.notas) {
    saltoSi(); y -= 12; text("Notas", M, 8, bold, grey); y -= 14;
    for (const ln of partir(f.notas, font, 9, W - 2 * M)) { saltoSi(); text(ln, M, 9, font, slate); y -= 12; }
  }

  if (extras.aviso) {
    saltoSi(); y -= 14;
    for (const ln of partir(extras.aviso, bold, 9, W - 2 * M)) { saltoSi(); text(ln, M, 9, bold, slate); y -= 12; }
  }

  page.drawText(safe(extras.pie ?? `Estado: ${f.estado}  ·  Generado con Aproba${extras.verifactuUrl ? "  ·  VERI*FACTU" : ""}`), { x: M, y: 40, size: 8, font, color: grey });
  return doc.save();
}
