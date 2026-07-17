import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { GEIST_REGULAR_B64, GEIST_SEMIBOLD_B64, GEIST_BOLD_B64, BADGE_ALPHA_B64 } from "@/lib/pdf-fonts";

// Propuesta comercial del servicio «Aproba Despegue», generada al vuelo cuando llega
// una solicitud desde la landing y adjuntada al email de notificación (el fundador la
// revisa y la reenvía: NUNCA se envía sola al prospecto). Misma maqueta que el
// presupuesto Sahel (onepager/Aproba-Presupuesto-Sahel.html): bandeau verde, tarjetas
// De/Para, tabla de conceptos, totales, condiciones; más la garantía de reembolso y
// la firma (precedente: documentos-cliente/confirmacion-prueba.html).
//
// Grille de precios (doctrine servicio): base fija 390 € (configuración + migración)
// + 300 € por persona a formar. «Más de 5» → se calcula sobre 6 y se marca «desde».
// UNA SOLA PÁGINA, con aire: los tamaños de fuente y espaciados están calibrados para
// que el peor caso (nombres largos) quepa — no añadir bloques sin recalibrar.

export type DatosPropuesta = {
  nombre: string;
  apellidos: string;
  despacho: string;
  email: string;
  telefono: string;
  equipo: string; // etiqueta del select («Autónomo (solo yo)», «3 personas», «Más de 5»)
};

const BASE_FIJA = 390;
const POR_PERSONA = 300;

export function personasDeEquipo(equipo: string): { n: number; abierto: boolean } {
  if (equipo.startsWith("Autónomo")) return { n: 1, abierto: false };
  if (equipo.startsWith("Más de")) return { n: 6, abierto: true };
  const n = parseInt(equipo, 10);
  return { n: Number.isFinite(n) && n > 0 ? n : 1, abierto: false };
}

const eur = (n: number) => {
  const [int, dec] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
};
const fecha = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

// Paleta Aproba (charte)
const VERDE = rgb(0x0e / 255, 0x8c / 255, 0x5f / 255); // aproba-600
const VERDE_CLARO = rgb(0xd1 / 255, 0xfa / 255, 0xe5 / 255); // aproba-100
const CREMA = rgb(0xfa / 255, 0xfa / 255, 0xf7 / 255); // cream-50
const TINTA = rgb(0x0f / 255, 0x17 / 255, 0x2a / 255); // ink
const SLATE_600 = rgb(0x47 / 255, 0x55 / 255, 0x69 / 255);
const SLATE_500 = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const SLATE_400 = rgb(0x94 / 255, 0xa3 / 255, 0xb8 / 255);
const SLATE_200 = rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255);
const SLATE_50 = rgb(0xf8 / 255, 0xfa / 255, 0xfc / 255);
const BLANCO = rgb(1, 1, 1);

const A4: [number, number] = [595.28, 841.89];
const MX = 34; // margen horizontal (≈12 mm)

type Fonts = { reg: PDFFont; semi: PDFFont; bold: PDFFont };

// Texto con recorte defensivo: la página es fija, un nombre kilométrico no debe desbordar.
function texto(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = TINTA, maxWidth?: number) {
  let t = s;
  if (maxWidth) while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -2) + "…";
  page.drawText(t, { x, y, size, font, color });
  return font.widthOfTextAtSize(t, size);
}
function textoDer(page: PDFPage, s: string, xDer: number, y: number, size: number, font: PDFFont, color = TINTA) {
  page.drawText(s, { x: xDer - font.widthOfTextAtSize(s, size), y, size, font, color });
}
// Corte en líneas SIN reordenar: una vez que una palabra desborda, TODAS las siguientes
// van a las líneas posteriores (un llenado «al mejor hueco» mezclaría el orden de la frase).
function partir(s: string, font: PDFFont, size: number, maxWidth: number, maxLineas: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const w of s.split(" ")) {
    const cand = actual ? `${actual} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= maxWidth) { actual = cand; continue; }
    lineas.push(actual);
    actual = w;
    if (lineas.length === maxLineas - 1) break;
  }
  if (actual) {
    // resto entero en la última línea (con recorte defensivo si aún desborda)
    const resto = s.slice(lineas.join(" ").length).trim();
    let t = lineas.length === maxLineas - 1 ? resto : actual;
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -2) + "…";
    lineas.push(t);
  }
  return lineas;
}
function caja(page: PDFPage, x: number, y: number, w: number, h: number, opts: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; r?: number }) {
  // pdf-lib no tiene rounded-rect nativo: rectángulo + esquinas con círculos del mismo color.
  const r = opts.r ?? 0;
  if (r > 0 && opts.fill) {
    page.drawRectangle({ x: x + r, y, width: w - 2 * r, height: h, color: opts.fill });
    page.drawRectangle({ x, y: y + r, width: w, height: h - 2 * r, color: opts.fill });
    for (const [cx, cy] of [[x + r, y + r], [x + w - r, y + r], [x + r, y + h - r], [x + w - r, y + h - r]] as const) {
      page.drawCircle({ x: cx, y: cy, size: r, color: opts.fill });
    }
  } else if (opts.fill) {
    page.drawRectangle({ x, y, width: w, height: h, color: opts.fill });
  }
  if (opts.border) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: opts.border, borderWidth: 0.7, color: undefined, opacity: 0 });
  }
}

export async function generarPropuestaPDF(d: DatosPropuesta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f: Fonts = {
    reg: await doc.embedFont(Buffer.from(GEIST_REGULAR_B64, "base64"), { subset: true }),
    semi: await doc.embedFont(Buffer.from(GEIST_SEMIBOLD_B64, "base64"), { subset: true }),
    bold: await doc.embedFont(Buffer.from(GEIST_BOLD_B64, "base64"), { subset: true }),
  };
  const page = doc.addPage(A4);
  const W = A4[0];
  const hoy = new Date();
  const valido = new Date(hoy.getTime() + 30 * 864e5);
  const ref = `PRE-${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}${String(hoy.getDate()).padStart(2, "0")}-${String(hoy.getHours()).padStart(2, "0")}${String(hoy.getMinutes()).padStart(2, "0")}`;

  const { n, abierto } = personasDeEquipo(d.equipo);
  const formacion = POR_PERSONA * n;
  const base = BASE_FIJA + formacion;
  const iva = Math.round(base * 0.21 * 100) / 100;
  const total = Math.round((base + iva) * 100) / 100;
  const desde = abierto ? "desde " : "";

  // ── Fondo crema + bandeau verde ────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: A4[1], color: CREMA });
  const HEAD_H = 86;
  page.drawRectangle({ x: 0, y: A4[1] - HEAD_H, width: W, height: HEAD_H, color: VERDE });
  // badge α (PNG: Geist no tiene el glifo griego — quedaría tofu)
  const badge = await doc.embedPng(Buffer.from(BADGE_ALPHA_B64, "base64"));
  page.drawImage(badge, { x: MX, y: A4[1] - 62, width: 34, height: 34 });
  texto(page, "aproba", MX + 44, A4[1] - 50, 24, f.bold, BLANCO);
  texto(page, "Software de extranjería", MX + 44, A4[1] - 63, 9, f.semi, VERDE_CLARO);
  // derecha: PRESUPUESTO + meta
  textoDer(page, "PRESUPUESTO", W - MX, A4[1] - 40, 19, f.bold, BLANCO);
  textoDer(page, `Nº ${ref}  ·  Fecha: ${fecha(hoy)}`, W - MX, A4[1] - 56, 8.5, f.semi, VERDE_CLARO);
  textoDer(page, `Válido hasta: ${fecha(valido)}`, W - MX, A4[1] - 68, 8.5, f.semi, VERDE_CLARO);

  let y = A4[1] - HEAD_H - 30;

  // ── Intro ──────────────────────────────────────────────────────────────────
  texto(page, "Gracias por tu interés en Aproba. Este es el presupuesto de Aproba Despegue: dejamos tu cuenta configurada,", MX, y, 9.3, f.reg, SLATE_600);
  y -= 13;
  texto(page, "tus datos y expedientes migrados y a tu equipo formado, para aprovechar el 100 % desde el primer día.", MX, y, 9.3, f.reg, SLATE_600);
  y -= 24;

  // ── Tarjetas De / Para ─────────────────────────────────────────────────────
  const CARD_W = (W - 2 * MX - 14) / 2;
  const CARD_H = 88;
  for (const [i, quien] of (["De", "Para"] as const).entries()) {
    const x = MX + i * (CARD_W + 14);
    caja(page, x, y - CARD_H, CARD_W, CARD_H, { fill: BLANCO, r: 10 });
    caja(page, x, y - CARD_H, CARD_W, CARD_H, { border: SLATE_200 });
    let cy = y - 17;
    texto(page, quien.toUpperCase(), x + 13, cy, 7.5, f.bold, SLATE_400);
    cy -= 15;
    if (quien === "De") {
      texto(page, "Aproba", x + 13, cy, 11, f.bold, TINTA); cy -= 13;
      texto(page, "ExpatfrancesCKNA07 S.L. · NIF B22993539", x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26); cy -= 11.5;
      texto(page, "Avenida Mediterráneo, 14", x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26); cy -= 11.5;
      texto(page, "08380 Malgrat de Mar (Barcelona)", x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26); cy -= 11.5;
      texto(page, "aproba.software@gmail.com · aproba-software.com", x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26);
    } else {
      texto(page, d.despacho, x + 13, cy, 11, f.bold, TINTA, CARD_W - 26); cy -= 13;
      texto(page, `A/A: ${d.nombre} ${d.apellidos}`, x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26); cy -= 11.5;
      texto(page, d.email, x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26); cy -= 11.5;
      texto(page, `${d.telefono} · Equipo: ${d.equipo.toLowerCase()}`, x + 13, cy, 8.4, f.reg, SLATE_600, CARD_W - 26);
    }
  }
  y -= CARD_H + 24;

  // ── Tabla de conceptos ─────────────────────────────────────────────────────
  texto(page, "DETALLE DEL PRESUPUESTO · APROBA DESPEGUE", MX, y, 8, f.bold, SLATE_400);
  y -= 12;
  const TW = W - 2 * MX;
  const filas: { cpt: string; desc: string; imp: string }[] = [
    { cpt: "Puesta en marcha: configuración y migración", desc: "Alta y configuración de la cuenta (servicios, tarifas, cobros, usuarios) y migración de tus clientes y expedientes en curso.", imp: eur(BASE_FIJA) },
    { cpt: `Formación práctica del equipo (${abierto ? "6 o más" : n} ${n === 1 && !abierto ? "persona" : "personas"})`, desc: `Sesiones sobre vuestra propia cuenta y vuestros casos reales, ${eur(POR_PERSONA)} por persona. Incluye acompañamiento prioritario las primeras semanas.`, imp: `${desde}${eur(formacion)}` },
  ];
  const FILA_H = 56; // sitio para 2 líneas de descripción sin truncar
  const TH = 24 + filas.length * FILA_H;
  caja(page, MX, y - TH, TW, TH, { fill: BLANCO, r: 12 });
  caja(page, MX, y - TH, TW, TH, { border: SLATE_200 });
  page.drawRectangle({ x: MX + 1, y: y - 24, width: TW - 2, height: 23, color: SLATE_50 });
  texto(page, "CONCEPTO", MX + 14, y - 16, 7.5, f.bold, SLATE_400);
  textoDer(page, "IMPORTE", W - MX - 14, y - 16, 7.5, f.bold, SLATE_400);
  let fy = y - 24;
  for (const [i, fila] of filas.entries()) {
    if (i > 0) page.drawLine({ start: { x: MX + 14, y: fy }, end: { x: W - MX - 14, y: fy }, thickness: 0.6, color: SLATE_200 });
    texto(page, fila.cpt, MX + 14, fy - 18, 10, f.semi, TINTA, TW - 130);
    for (const [j, l] of partir(fila.desc, f.reg, 8, TW - 130, 2).entries()) {
      texto(page, l, MX + 14, fy - 32 - j * 10.5, 8, f.reg, SLATE_500);
    }
    textoDer(page, fila.imp, W - MX - 14, fy - 18, 10, f.semi, TINTA);
    fy -= FILA_H;
  }
  y -= TH + 12;

  // ── Totales (bloque derecho) ───────────────────────────────────────────────
  const TOT_W = 190;
  const tx = W - MX - TOT_W;
  texto(page, "Base imponible", tx + 4, y - 10, 9, f.reg, SLATE_600);
  textoDer(page, `${desde}${eur(base)}`, W - MX - 4, y - 10, 9, f.semi, TINTA);
  texto(page, "IVA (21 %)", tx + 4, y - 25, 9, f.reg, SLATE_600);
  textoDer(page, `${desde}${eur(iva)}`, W - MX - 4, y - 25, 9, f.semi, TINTA);
  page.drawLine({ start: { x: tx, y: y - 33 }, end: { x: W - MX, y: y - 33 }, thickness: 0.6, color: SLATE_200 });
  caja(page, tx, y - 66, TOT_W, 28, { fill: VERDE, r: 9 });
  texto(page, "Total", tx + 13, y - 56, 11, f.bold, BLANCO);
  textoDer(page, `${desde}${eur(total)}`, W - MX - 13, y - 57, 14, f.bold, BLANCO);
  if (abierto) {
    texto(page, "Equipos de más de 5: importe final según el nº exacto de personas.", MX, y - 56, 8, f.reg, SLATE_500);
  }
  y -= 66 + 24;

  // ── Condiciones (2 columnas) ───────────────────────────────────────────────
  texto(page, "CONDICIONES", MX, y, 8, f.bold, SLATE_400);
  y -= 14;
  const conds: string[] = [
    "Pago único, no recurrente. Forma de pago: transferencia bancaria.",
    "Validez del presupuesto: 30 días.",
    "Puesta en marcha lista en pocos días laborables tras la confirmación.",
    "La suscripción mensual (Starter, Pro o Business) es independiente de este servicio.",
    "Migración sobre datos estructurados (CSV/Excel); los no estructurados pueden requerir ajuste.",
    "Garantía de reembolso: si se cancela antes de iniciar los trabajos, devolución del 100 %.",
  ];
  const COL_W = (W - 2 * MX - 20) / 2;
  const CY0 = y;
  for (const [i, c] of conds.entries()) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = MX + col * (COL_W + 20);
    const cy = CY0 - row * 26;
    texto(page, "·", cx, cy, 10, f.bold, VERDE);
    for (const [j, l] of partir(c, f.reg, 8.2, COL_W - 12, 2).entries()) {
      texto(page, l, cx + 9, cy - j * 10.5, 8.2, f.reg, SLATE_600);
    }
  }
  y = CY0 - Math.ceil(conds.length / 2) * 26 - 18;

  // ── Firma ──────────────────────────────────────────────────────────────────
  texto(page, "Por ExpatfrancesCKNA07 S.L. (Aproba)", MX, y, 9, f.semi, TINTA);
  const FIRMA_Y = y - 46;
  page.drawLine({ start: { x: MX, y: FIRMA_Y }, end: { x: MX + 175, y: FIRMA_Y }, thickness: 0.8, color: TINTA });
  texto(page, "Fdo.: Matthias Merle Mounier", MX, FIRMA_Y - 12, 8.5, f.reg, SLATE_600);
  texto(page, `Malgrat de Mar, a ${fecha(hoy)}`, MX, FIRMA_Y - 23, 8.5, f.reg, SLATE_600);
  // aceptación del cliente (derecha)
  texto(page, "Aceptación del cliente", W - MX - 175, y, 9, f.semi, TINTA);
  page.drawLine({ start: { x: W - MX - 175, y: FIRMA_Y }, end: { x: W - MX, y: FIRMA_Y }, thickness: 0.8, color: TINTA });
  texto(page, "Firma y fecha", W - MX - 175, FIRMA_Y - 12, 8.5, f.reg, SLATE_600);

  // ── Pie ────────────────────────────────────────────────────────────────────
  const pie = "Aproba · ExpatfrancesCKNA07 S.L. · NIF B22993539 · aproba-software.com";
  texto(page, pie, (W - f.reg.widthOfTextAtSize(pie, 7.5)) / 2, 26, 7.5, f.reg, SLATE_400);

  return doc.save();
}
