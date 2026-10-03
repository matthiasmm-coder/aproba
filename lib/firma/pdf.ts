import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { limpiarTextoPdf, type CajaFirma } from "@/lib/encargo";
import { ETIQUETA_EVENTO, fechaHoraMadrid, type EvidenciaFirma, type MetodoFirma } from "@/lib/firma/sobre";

// EL PDF FIRMADO (lib/firma/sobre.ts): sobre el ORIGINAL que el cliente revisó, sin regenerar
// nada, se estampa su firma en cada casilla suya, se pone en el pie de cada página quién firmó,
// cuándo y el identificador del envío, y se añade al final el CERTIFICADO DE FIRMA (huella del
// documento revisado, firmante, email verificado, cronología con IP y dispositivo) — lo que da
// un prestatario de firma, salvo su sello de tercero de confianza.

const TINTA = rgb(0.08, 0.11, 0.18);
const GRIS = rgb(0.42, 0.47, 0.55);
const VERDE = rgb(0.055, 0.55, 0.37);
const FONDO = rgb(0.955, 0.96, 0.945);
const A4: [number, number] = [595, 842];
const MARGEN = 56;
const t = (s: string | null | undefined) => limpiarTextoPdf(String(s ?? "")).replace(/\n/g, " ").trim();

export type DatosSello = {
  sobreId: string;
  titulo: string;                 // «Hoja de encargo»
  despacho: string;
  referencia: string;             // EXP-2026-0001
  hashOriginal: string;           // SHA-256 del PDF revisado
  firmante: { nombre: string; documento?: string | null; email: string };
  metodo: MetodoFirma;
  firmadoEn: string;              // ISO
  evidencias: EvidenciaFirma[];
};

// La firma dentro de su casilla: proporción intacta, centrada, apoyada abajo (como a mano).
function dibujarFirma(page: PDFPage, img: PDFImage, c: CajaFirma) {
  const escala = Math.min(c.w / img.width, c.h / img.height);
  const w = img.width * escala, h = img.height * escala;
  page.drawImage(img, { x: c.x + (c.w - w) / 2, y: c.y, width: w, height: h });
}

function partir(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of t(texto).split(/\s+/).filter(Boolean)) {
    let p = palabra;
    while (font.widthOfTextAtSize(p, size) > ancho && p.length > 1) {
      let cut = p.length;
      while (cut > 1 && font.widthOfTextAtSize(p.slice(0, cut), size) > ancho) cut--;
      if (linea) { out.push(linea); linea = ""; }
      out.push(p.slice(0, cut));
      p = p.slice(cut);
    }
    const prueba = linea ? `${linea} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) <= ancho) linea = prueba;
    else { if (linea) out.push(linea); linea = p; }
  }
  if (linea) out.push(linea);
  return out;
}

export async function sellarDocumento(original: Uint8Array, cajas: CajaFirma[], firmaPng: Uint8Array, d: DatosSello): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const img = await pdf.embedPng(firmaPng);
  const paginas = pdf.getPages();
  const total = paginas.length;

  // 1) La firma en cada casilla del firmante. Sin ninguna (no debería pasar con nuestros
  //    documentos), una página de firma antes del certificado, para no dejarlo sin firmar.
  const validas = cajas.filter((c) => c.pagina >= 0 && c.pagina < total);
  for (const c of validas) dibujarFirma(paginas[c.pagina], img, c);
  if (!validas.length) {
    const p = pdf.addPage(A4);
    p.drawText(t(`Firma de: ${d.titulo}`), { x: MARGEN, y: A4[1] - 90, size: 13, font: bold, color: TINTA });
    p.drawText(t(`${d.despacho} · Expediente ${d.referencia}`), { x: MARGEN, y: A4[1] - 108, size: 9, font, color: GRIS });
    dibujarFirma(p, img, { etiqueta: "", pagina: 0, x: MARGEN, y: A4[1] - 220, w: 220, h: 80 });
    p.drawLine({ start: { x: MARGEN, y: A4[1] - 224 }, end: { x: MARGEN + 220, y: A4[1] - 224 }, thickness: 0.7, color: GRIS });
    p.drawText(t(d.firmante.nombre), { x: MARGEN, y: A4[1] - 238, size: 9, font: bold, color: TINTA });
  }

  // 2) Pie de cada página del documento: quién, cuándo, qué envío.
  const cuando = fechaHoraMadrid(d.firmadoEn);
  const corto = d.sobreId.slice(0, 8).toUpperCase();
  const paginasDoc = pdf.getPages();
  paginasDoc.forEach((p, i) => {
    const { width } = p.getSize();
    const linea = t(`Firmado electrónicamente por ${d.firmante.nombre} el ${cuando} (hora de Madrid) · Envío ${corto} · Página ${i + 1} de ${paginasDoc.length}`);
    const size = 6.5;
    const w = font.widthOfTextAtSize(linea, size);
    p.drawText(linea, { x: Math.max(12, (width - w) / 2), y: 14, size, font, color: GRIS });
  });

  // 3) Certificado de firma, al final.
  const cert = pdf.addPage(A4);
  let y = A4[1];
  cert.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) });
  cert.drawRectangle({ x: 0, y: A4[1] - 4, width: A4[0], height: 4, color: VERDE });
  y -= 52;
  cert.drawText("CERTIFICADO DE FIRMA ELECTRÓNICA", { x: MARGEN, y, size: 14, font: bold, color: TINTA });
  y -= 16;
  cert.drawText(t(`${d.despacho} · Expediente ${d.referencia}`), { x: MARGEN, y, size: 9, font, color: GRIS });
  y -= 26;

  const seccion = (titulo: string) => {
    cert.drawRectangle({ x: MARGEN, y: y - 15.5, width: A4[0] - MARGEN * 2, height: 15.5, color: FONDO });
    cert.drawText(titulo, { x: MARGEN + 6, y: y - 11.5, size: 8.5, font: bold, color: TINTA });
    y -= 24;
  };
  const fila = (etiqueta: string, valor: string, f: PDFFont = bold, size = 9.5) => {
    const lineas = partir(valor, f, size, A4[0] - MARGEN * 2 - 150);
    cert.drawText(etiqueta, { x: MARGEN, y: y - size, size: 8, font, color: GRIS });
    lineas.forEach((ln, i) => cert.drawText(ln, { x: MARGEN + 150, y: y - size - i * 13, size, font: f, color: TINTA }));
    y -= Math.max(16, lineas.length * 13 + 3);
  };

  seccion("DOCUMENTO");
  fila("Documento", d.titulo);
  fila("Identificador del envío", d.sobreId, mono, 8.5);
  fila("Huella SHA-256", `${d.hashOriginal.slice(0, 32)} ${d.hashOriginal.slice(32)}`, mono, 8.5);
  fila("Páginas", `${total} (más este certificado)`);
  y -= 4;

  seccion("FIRMANTE");
  fila("Nombre", d.firmante.nombre);
  if (d.firmante.documento) fila("Documento de identidad", d.firmante.documento);
  fila("Email verificado", `${d.firmante.email} (código de un solo uso)`);
  fila("Método", d.metodo === "dibujada" ? "Firma manuscrita trazada en pantalla" : "Nombre escrito por el firmante como firma");
  // La imagen de la firma, tal como quedó en el documento.
  {
    const alto = 46;
    cert.drawText("Firma", { x: MARGEN, y: y - 9.5, size: 8, font, color: GRIS });
    const escala = Math.min(200 / img.width, alto / img.height);
    cert.drawImage(img, { x: MARGEN + 150, y: y - alto, width: img.width * escala, height: img.height * escala });
    y -= alto + 10;
  }
  y -= 4;

  seccion("CRONOLOGÍA (HORA DE MADRID)");
  const visibles = d.evidencias.filter((e) => e.evento !== "creado");
  for (const e of visibles) {
    if (y < 150) break; // el certificado cabe en una página: lo esencial va arriba
    const detalle = [e.ip ? `IP ${e.ip}` : "", e.dispositivo ?? "", e.detalle ?? ""].filter(Boolean).join(" · ");
    cert.drawText(fechaHoraMadrid(e.en), { x: MARGEN, y: y - 9, size: 8, font: mono, color: TINTA });
    cert.drawText(t(ETIQUETA_EVENTO[e.evento] ?? e.evento), { x: MARGEN + 120, y: y - 9, size: 8.5, font: bold, color: TINTA });
    if (detalle) {
      for (const [i, ln] of partir(detalle, font, 7.5, A4[0] - MARGEN * 2 - 120).entries()) cert.drawText(ln, { x: MARGEN + 120, y: y - 20 - i * 10, size: 7.5, font, color: GRIS });
      y -= 12;
    }
    y -= 15;
  }

  // Nota de alcance, al pie.
  const nota = "Firma electrónica en el sentido del Reglamento (UE) n.º 910/2014 (eIDAS): el firmante revisó este documento, lo firmó en pantalla y confirmó su identidad con un código de un solo uso enviado a su email. La huella SHA-256 identifica el documento revisado; cualquier cambio posterior la alteraría. Este certificado forma parte del documento firmado.";
  const lineasNota = partir(nota, font, 7.5, A4[0] - MARGEN * 2 - 16);
  const altoNota = lineasNota.length * 10 + 14;
  cert.drawRectangle({ x: MARGEN, y: 52, width: A4[0] - MARGEN * 2, height: altoNota, color: FONDO });
  lineasNota.forEach((ln, i) => cert.drawText(ln, { x: MARGEN + 8, y: 52 + altoNota - 14 - i * 10, size: 7.5, font, color: GRIS }));
  cert.drawText("Generado por Aproba · aproba-software.com", { x: MARGEN, y: 36, size: 7, font, color: GRIS });

  return pdf.save();
}
