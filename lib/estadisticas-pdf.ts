import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { EmisorPdf } from "@/lib/export-pdf";
import { embeberLogo, medidasLogo } from "@/lib/pdf-logo";
import { eur } from "@/lib/facturas";
import {
  MESES_CORTOS_ES, curva, escalaEje, eurCorto, pct, nombrePeriodo, ultimoMesConDatos, variacion,
  type Estadisticas, type Punto, type Ranking,
} from "@/lib/estadisticas-facturacion";

// INFORME DE FACTURACIÓN en PDF (Facturas › Estadísticas › «Informe PDF»). Mismo motor que
// las facturas y la memoria: pdf-lib con fuentes estándar, que solo codifican WinAnsi —
// nada de «−» (U+2212) ni flechas: se escribe «-» y «+», y lo demás se sanea.
// Misma estructura que la pantalla: cifras centradas (4 + 4), gráfico, trimestres, meses,
// rentabilidad (con el reparto por servicio) y principales clientes y proveedores.

const WIN_EXTRA = "€…‚ƒ„†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s: string) =>
  (s ?? "").replace(/−/g, "-").split("").map((c) => {
    const n = c.charCodeAt(0);
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_EXTRA.includes(c) ? c : "?";
  }).join("");

const A4: [number, number] = [595.28, 841.89];
const [W, H] = A4;
const M = 44;
const OSCURO = rgb(0.12, 0.16, 0.23);
const PIZARRA = rgb(0.28, 0.33, 0.41);
const GRIS = rgb(0.55, 0.6, 0.66);
const LINEA = rgb(0.89, 0.91, 0.94);
const FONDO = rgb(0.97, 0.98, 0.99);
const VERDE = rgb(0.055, 0.549, 0.373);       // aproba-600
const VERDE_MEDIO = rgb(0.204, 0.827, 0.6);   // aproba-400
const VERDE_CLARO = rgb(0.655, 0.953, 0.816); // aproba-200
const GASTO = rgb(0.58, 0.64, 0.72);          // slate-400
const GASTO_CLARO = rgb(0.886, 0.91, 0.941);
const ROJO = rgb(0.86, 0.15, 0.15);
const AMBAR = rgb(0.85, 0.47, 0.02);          // amber-600: pendiente, no error

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const conSigno = (x: number) => `${x > 0 ? "+" : x < 0 ? "-" : ""}${pct(Math.abs(x))}`;
const facturas = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;

export async function estadisticasToPdf(est: Estadisticas, emisor: EmisorPdf, extra: { sinFechaRecibidas?: number; sede?: string | null } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Informe de facturación · ${nombrePeriodo(est.periodo)}`);
  doc.setCreator("Aproba");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage(A4);
  let y = 800;

  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = OSCURO) => page.drawText(safe(s), { x, y: yy, size, font: f, color });
  const right = (s: string, xr: number, yy: number, size: number, f: PDFFont = font, color: RGB = OSCURO) => {
    const ss = safe(s); page.drawText(ss, { x: xr - f.widthOfTextAtSize(ss, size), y: yy, size, font: f, color });
  };
  const centro = (s: string, xc: number, yy: number, size: number, f: PDFFont = font, color: RGB = OSCURO) => {
    const ss = safe(s); page.drawText(ss, { x: xc - f.widthOfTextAtSize(ss, size) / 2, y: yy, size, font: f, color });
  };
  const ajusta = (s: string, ancho: number, size: number, f: PDFFont = font) => {
    let ss = safe(s);
    if (f.widthOfTextAtSize(ss, size) <= ancho) return ss;
    while (ss.length > 1 && f.widthOfTextAtSize(`${ss}…`, size) > ancho) ss = ss.slice(0, -1);
    return `${ss.trimEnd()}…`;
  };
  const linea = (x1: number, x2: number, yy: number, grosor = 0.5, color: RGB = LINEA) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: grosor, color });
  // Trazado SVG en coordenadas de la página (pdf-lib dibuja los trazados con el eje Y hacia abajo).
  const svg = (d: string, o: { color?: RGB; borderColor?: RGB; borderWidth?: number; opacity?: number }) =>
    page.drawSvgPath(d, { x: 0, y: H, color: o.color, borderColor: o.borderColor, borderWidth: o.borderWidth, opacity: o.opacity, borderOpacity: o.opacity });
  const salto = (min: number) => { if (y < min) { page = doc.addPage(A4); y = 800; } };
  // `necesita`: alto mínimo tras el título (una tabla no se parte en dos). Las filas saltan de
  // página por debajo de 60: el título + la tabla deben caber antes.
  const titulo = (s: string, necesita = 120) => {
    salto(necesita + 95);
    y -= 8;
    text(s.toUpperCase(), M, y, 9, bold, PIZARRA);
    y -= 7; linea(M, W - M, y, 0.8, OSCURO); y -= 14;
  };

  // ── Cabecera ────────────────────────────────────────────────────────────────
  const logo = await embeberLogo(doc, emisor.logo);
  if (logo) {
    const { ancho, alto } = medidasLogo(logo, 140, 34);
    page.drawImage(logo, { x: M, y: y - alto + 12, width: ancho, height: alto });
    y -= alto + 4;
  }
  text(emisor.nombre || "Despacho", M, y, 14, bold);
  right("INFORME DE FACTURACIÓN", W - M, y + 2, 11, bold, VERDE);
  right(nombrePeriodo(est.periodo), W - M, y - 12, 9, bold, OSCURO);
  if (extra.sede) right(`Sede: ${extra.sede}`, W - M, y - 24, 8, font, PIZARRA);
  y -= 16;
  for (const c of [emisor.nif ? `NIF/CIF ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean) as string[]) {
    text(c, M, y, 8.5, font, PIZARRA); y -= 11;
  }
  right(`Generado el ${dmy(new Date())}`, W - M, y + 11, 8, font, GRIS);
  y -= 6; linea(M, W - M, y, 1, OSCURO); y -= 24;

  // ── Cifras del periodo: 4 + 4, contenido centrado ───────────────────────────
  const r = est.resumen;
  const a = est.anterior;
  const ren = est.rentabilidad;
  const vsAnio = est.periodo.anio - 1;
  const anchoB = (W - 2 * M + 8) / 4;
  const bloque = (x: number, label: string, valor: string, sub: string, color: RGB = OSCURO, barra?: { v: number; color: RGB }) => {
    const w = anchoB - 8, cx = x + w / 2;
    page.drawRectangle({ x, y: y - 44, width: w, height: 56, color: FONDO, borderColor: LINEA, borderWidth: 0.6 });
    centro(label.toUpperCase(), cx, y, 6.5, bold, GRIS);
    centro(ajusta(valor, w - 12, 14, bold), cx, y - 17, 14, bold, color);
    if (barra) {
      const bw = Math.min(70, w - 24);
      page.drawRectangle({ x: cx - bw / 2, y: y - 25, width: bw, height: 2.5, color: LINEA });
      page.drawRectangle({ x: cx - bw / 2, y: y - 25, width: Math.max(2, bw * Math.min(1, Math.abs(barra.v))), height: 2.5, color: barra.color });
    }
    centro(ajusta(sub, w - 12, 7, font), cx, y - (barra ? 36 : 32), 7, font, PIZARRA);
  };
  const dIng = a ? variacion(r.ingresos.base, a.ingresos.base) : null;
  const dGas = a ? variacion(r.gastos.base, a.gastos.base) : null;
  bloque(M, "Ingresos (sin IVA)", eur(r.ingresos.base),
    r.ingresos.sinDesglose > 0 ? `+ ${eur(r.ingresos.sinDesgloseTotal)} importados` : `${facturas(r.ingresos.n)}${dIng != null ? ` · ${conSigno(dIng)} vs ${vsAnio}` : ""}`, VERDE);
  bloque(M + anchoB, "Gastos (sin IVA)", eur(r.gastos.base), `${facturas(r.gastos.n)}${dGas != null ? ` · ${conSigno(dGas)} vs ${vsAnio}` : ""}`);
  bloque(M + 2 * anchoB, "Resultado", eur(r.resultado), "Ingresos menos gastos", r.resultado < 0 ? ROJO : OSCURO);
  bloque(M + 3 * anchoB, "Rentabilidad", ren.margen != null ? pct(ren.margen) : "-",
    ren.margen != null ? `De cada 100 €, quedan ${eur(Math.round(ren.margen * 10000) / 100)}` : "Faltan los gastos",
    ren.margen == null ? OSCURO : ren.margen < 0 ? ROJO : VERDE, ren.margen != null ? { v: ren.margen, color: ren.margen < 0 ? ROJO : VERDE } : undefined);
  y -= 66;
  bloque(M, r.ivaNeto >= 0 ? "IVA a ingresar (estim.)" : "IVA a compensar (estim.)", eur(Math.abs(r.ivaNeto)), "Repercutido - soportado");
  bloque(M + anchoB, "Pendiente de cobro", eur(r.ingresos.pendiente), `Cobrado ${eur(r.ingresos.cobrado)}`, r.ingresos.pendiente > 0 ? AMBAR : OSCURO);
  bloque(M + 2 * anchoB, "Pendiente de pago", eur(r.gastos.pendiente), `Pagado ${eur(r.gastos.pagado)}`);
  bloque(M + 3 * anchoB, "Retenciones practicadas", eur(r.gastos.retenciones), "Modelos 111 y 115");
  y -= 70;

  // ── Gráfico: ingresos y gastos por mes, con la curva del resultado ──────────
  titulo(`Ingresos y gastos por mes · ${est.periodo.anio}`);
  const meses = est.meses;
  const ultimo = ultimoMesConDatos(meses);
  const altoG = 150;
  const x0 = M + 44, x1 = W - M;
  const gw = (x1 - x0) / 12;
  const base0 = y - altoG;
  if (ultimo === 0) {
    centro(`Sin facturas en ${est.periodo.anio}`, (x0 + x1) / 2, y - altoG / 2, 9, font, GRIS);
  } else {
    const valores = meses.flatMap((m) => [m.ingresos + m.ingresosSinDesglose, m.gastos + m.gastosSinDesglose, m.resultado]);
    const { desde, hasta, ticks } = escalaEje(Math.min(0, ...valores), Math.max(0, ...valores));
    const Y = (v: number) => base0 + (altoG * (v - desde)) / (hasta - desde);
    for (const tk of ticks) {
      if (tk === 0) linea(x0, x1, Y(tk), 0.8, GASTO);
      else page.drawLine({ start: { x: x0, y: Y(tk) }, end: { x: x1, y: Y(tk) }, thickness: 0.4, color: LINEA, dashArray: [2, 3] });
      right(eurCorto(tk), x0 - 6, Y(tk) - 2.5, 6.5, font, GRIS);
    }
    const bw = Math.min(12, gw * 0.3);
    const resaltar = est.periodo.trimestre ? new Set([1, 2, 3].map((k) => (est.periodo.trimestre - 1) * 3 + k)) : null;
    // Barra con las esquinas de arriba redondeadas (en coordenadas SVG: y hacia abajo).
    const barra = (x: number, desdeV: number, hastaV: number, color: RGB, op: number, redondeo = 2.5) => {
      const yTop = H - Y(Math.max(desdeV, hastaV)), yBot = H - Y(Math.min(desdeV, hastaV));
      const h = yBot - yTop;
      if (h < 0.4) return;
      const rr = Math.min(redondeo, bw / 2, h);
      svg(`M${x},${yBot} V${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + bw - rr} Q${x + bw},${yTop} ${x + bw},${yTop + rr} V${yBot} Z`, { color, opacity: op });
    };
    meses.forEach((m, i) => {
      const cx = x0 + gw * i + gw / 2;
      const op = resaltar && !resaltar.has(m.mes) ? 0.35 : 1;
      if (m.ingresos !== 0) barra(cx - bw - 1, 0, m.ingresos, VERDE, op, m.ingresosSinDesglose > 0 ? 0 : 2.5);
      if (m.ingresosSinDesglose > 0) barra(cx - bw - 1, Math.max(0, m.ingresos), Math.max(0, m.ingresos) + m.ingresosSinDesglose, VERDE_CLARO, op);
      if (m.gastos !== 0) barra(cx + 1, 0, m.gastos, GASTO, op, m.gastosSinDesglose > 0 ? 0 : 2.5);
      if (m.gastosSinDesglose > 0) barra(cx + 1, Math.max(0, m.gastos), Math.max(0, m.gastos) + m.gastosSinDesglose, GASTO_CLARO, op);
      centro(MESES_CORTOS_ES[i], cx, base0 - 11, 6.5, font, op < 1 ? GRIS : PIZARRA);
    });
    // Curva suave del resultado (la misma que en pantalla) y sus puntos.
    const pts: Punto[] = meses.slice(0, ultimo).map((m, i) => [x0 + gw * i + gw / 2, H - Y(m.resultado)]);
    if (pts.length > 1) svg(curva(pts), { borderColor: OSCURO, borderWidth: 1.4 });
    pts.forEach(([px, py], i) => page.drawCircle({ x: px, y: H - py, size: 2.2, color: rgb(1, 1, 1), borderColor: meses[i].resultado < 0 ? ROJO : OSCURO, borderWidth: 1.2 }));
  }
  y = base0 - 26;
  // Leyenda
  let lx = x0;
  const leyenda = (color: RGB, label: string, lineaSimple = false) => {
    if (lineaSimple) page.drawLine({ start: { x: lx, y: y + 2.5 }, end: { x: lx + 12, y: y + 2.5 }, thickness: 1.4, color });
    else page.drawCircle({ x: lx + 3.5, y: y + 2.5, size: 3.2, color });
    text(label, lx + (lineaSimple ? 16 : 11), y, 7, font, PIZARRA);
    lx += (lineaSimple ? 16 : 11) + font.widthOfTextAtSize(safe(label), 7) + 14;
  };
  leyenda(VERDE, "Ingresos");
  leyenda(GASTO, "Gastos");
  leyenda(OSCURO, "Resultado", true);
  if (meses.some((m) => m.ingresosSinDesglose > 0)) leyenda(VERDE_CLARO, "Importadas sin desglose (IVA incl.)");
  y -= 22;

  // ── Tablas ──────────────────────────────────────────────────────────────────
  const tabla = (cabeceras: string[], anchos: number[], filas: { celdas: string[]; negrita?: boolean; fondo?: boolean; rojo?: number[] }[]) => {
    const xs: number[] = []; let acc = M;
    for (const w of anchos) { xs.push(acc); acc += w; }
    salto(90);
    cabeceras.forEach((c, k) => (k === 0 ? text(c.toUpperCase(), xs[k] + 4, y, 6.5, bold, GRIS) : right(c.toUpperCase(), xs[k] + anchos[k] - 4, y, 6.5, bold, GRIS)));
    y -= 6; linea(M, W - M, y, 0.5); y -= 12;
    for (const f of filas) {
      salto(60);
      if (f.fondo) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: FONDO });
      f.celdas.forEach((c, k) => {
        const fnt = f.negrita ? bold : font;
        const color = f.rojo?.includes(k) ? ROJO : k === 0 ? PIZARRA : OSCURO;
        if (k === 0) text(ajusta(c, anchos[k] - 8, 8, fnt), xs[k] + 4, y, 8, fnt, color);
        else right(ajusta(c, anchos[k] - 6, 8, fnt), xs[k] + anchos[k] - 4, y, 8, fnt, color);
      });
      y -= 15;
    }
    y -= 6;
  };
  titulo(`Por trimestre · ${est.periodo.anio}`);
  const tot = est.trimestres.reduce((s, q) => ({
    i: s.i + q.ingresos.base, ir: s.ir + q.ingresos.iva, g: s.g + q.gastos.base, gs: s.gs + q.gastos.iva,
    re: s.re + q.gastos.retenciones, iv: s.iv + q.ivaNeto, rs: s.rs + q.resultado,
  }), { i: 0, ir: 0, g: 0, gs: 0, re: 0, iv: 0, rs: 0 });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  tabla(
    ["Trimestre", "Ingresos", "IVA rep.", "Gastos", "IVA sop.", "Retenc.", "IVA estim.", "Resultado"],
    [52, 67, 64, 67, 64, 58, 68, 67],
    [
      ...est.trimestres.map((q) => ({
        celdas: [`T${q.trimestre}`, eur(q.ingresos.base), eur(q.ingresos.iva), eur(q.gastos.base), eur(q.gastos.iva), eur(q.gastos.retenciones), eur(q.ivaNeto), eur(q.resultado)],
        fondo: q.trimestre === est.periodo.trimestre,
        rojo: q.resultado < 0 ? [7] : [],
      })),
      { celdas: [`Total ${est.periodo.anio}`, eur(r2(tot.i)), eur(r2(tot.ir)), eur(r2(tot.g)), eur(r2(tot.gs)), eur(r2(tot.re)), eur(r2(tot.iv)), eur(r2(tot.rs))], negrita: true, fondo: true, rojo: tot.rs < 0 ? [7] : [] },
    ],
  );

  titulo(`Por mes · ${est.periodo.anio}`, 12 * 15 + 30);
  tabla(
    ["Mes", "Ingresos", "Gastos", "Resultado", "Margen", "IVA rep.", "IVA sop.", "Emit./Rec."],
    [48, 72, 70, 72, 52, 66, 66, 61],
    meses.map((m, i) => ({
      celdas: [MESES_CORTOS_ES[m.mes - 1], eur(m.ingresos), eur(m.gastos), eur(m.resultado), ren.margenMensual[i] != null ? pct(ren.margenMensual[i] as number) : "-", eur(m.ivaRepercutido), eur(m.ivaSoportado), `${m.nEmitidas} / ${m.nRecibidas}`],
      rojo: m.resultado < 0 ? [3, 4] : [],
      fondo: est.periodo.trimestre !== 0 && Math.floor((m.mes - 1) / 3) + 1 === est.periodo.trimestre,
    })),
  );

  // ── Rentabilidad ────────────────────────────────────────────────────────────
  titulo(`Rentabilidad · ${nombrePeriodo(est.periodo)}`, 60 + Math.min(10, ren.porServicio.length) * 15 + 30);
  bloque(M, "Punto de equilibrio", ren.sinGastos ? "-" : `${eur(ren.gastoMedioMensual)}/mes`, ren.sinGastos ? "Faltan los gastos" : `Facturas de media ${eur(ren.ingresoMedioMensual)}/mes`);
  bloque(M + anchoB, "Cobertura de gastos", ren.cobertura != null ? `${ren.cobertura.toFixed(1).replace(".", ",")}x` : "-", ren.cobertura != null ? "Ingresos / gastos" : "Faltan los gastos");
  bloque(M + 2 * anchoB, "Ticket medio", ren.ticketMedio != null ? eur(ren.ticketMedio) : "-", "Por factura, sin IVA");
  bloque(M + 3 * anchoB, "Por cliente", ren.ingresoMedioCliente != null ? eur(ren.ingresoMedioCliente) : "-", `${ren.clientes} ${ren.clientes === 1 ? "cliente" : "clientes"}`);
  y -= 66;
  if (ren.porServicio.length) {
    tabla(
      ["Servicio", "Facturas", "Ingresos", "Media", "% del total"],
      [227, 60, 80, 70, 70],
      ren.porServicio.slice(0, 10).map((sv) => ({ celdas: [sv.servicio, String(sv.n), eur(sv.base), sv.ticket != null ? eur(sv.ticket) : "-", pct(sv.cuota)] })),
    );
    if (ren.porServicio.length > 10) { text(`Y ${ren.porServicio.length - 10} servicios más: la lista completa está en el Excel.`, M + 4, y + 4, 7, font, GRIS); y -= 10; }
  }

  // ── Principales clientes y proveedores (a dos columnas) ─────────────────────
  titulo(`Principales clientes y proveedores · ${nombrePeriodo(est.periodo)}`, Math.max(est.topClientes.length, est.topProveedores.length, 1) * 17 + 20);
  const col = (W - 2 * M - 16) / 2;
  const lista = (x: number, cab: string, filas: Ranking[], vacio: string) => {
    let yy = y;
    text(cab.toUpperCase(), x, yy, 6.5, bold, GRIS); yy -= 13;
    if (!filas.length) { text(vacio, x, yy, 8, font, GRIS); return yy - 13; }
    for (const f of filas) {
      text(ajusta(f.nombre, col - 110, 8, font), x, yy, 8, font, PIZARRA);
      right(eur(f.total), x + col - 38, yy, 8, bold, OSCURO);
      right(pct(f.cuota, 0), x + col, yy, 7.5, font, GRIS);
      yy -= 6;
      page.drawRectangle({ x, y: yy, width: col, height: 2.2, color: LINEA });
      page.drawRectangle({ x, y: yy, width: Math.max(1.5, col * f.cuota), height: 2.2, color: f.cuota > 0.2 ? VERDE : VERDE_MEDIO });
      yy -= 11;
    }
    return yy;
  };
  const yA = lista(M, "Clientes (facturado con IVA)", est.topClientes, "Sin facturas emitidas en el periodo.");
  const yB = lista(M + col + 16, "Proveedores (a pagar)", est.topProveedores, "Sin facturas recibidas en el periodo.");
  y = Math.min(yA, yB) - 8;

  // ── Notas: de dónde salen las cifras ────────────────────────────────────────
  salto(120);
  linea(M, W - M, y, 0.5); y -= 13;
  const notas = [
    `${nombrePeriodo(est.periodo)}: ${facturas(est.fuentes.aproba)} emitidas en Aproba${est.fuentes.anteriores ? `, ${est.fuentes.anteriores} anteriores a Aproba (importadas)` : ""} y ${est.fuentes.recibidas} ${est.fuentes.recibidas === 1 ? "recibida" : "recibidas"}.`,
    "Ingresos y gastos, sin IVA. Los suplidos (tasas pagadas por cuenta del cliente) no son ingresos. Resultado = ingresos - gastos; rentabilidad = resultado / ingresos.",
    "Punto de equilibrio = gasto medio mensual del periodo (lo que hay que facturar al mes para cubrirlo). Los gastos no se reparten por servicio.",
    "IVA estimado = IVA repercutido - IVA soportado: en positivo, a ingresar; en negativo, a compensar.",
    ...(est.anterior ? [`La comparación con ${est.periodo.anio - 1} usa el mismo periodo, hasta la misma fecha si el año está en curso.`] : []),
    ...(r.ingresos.sinDesglose > 0 ? [`${r.ingresos.sinDesglose} facturas importadas no traen el desglose de IVA: cuentan en lo facturado con IVA (${eur(r.ingresos.sinDesgloseTotal)}), no en los ingresos ni en el IVA.`] : []),
    ...(r.ingresos.cobroDesconocido > 0 ? [`${eur(r.ingresos.cobroDesconocido)} importados sin estado del cobro: no cuentan ni como cobrados ni como pendientes.`] : []),
    ...(extra.sinFechaRecibidas ? [`${extra.sinFechaRecibidas} facturas recibidas sin fecha no se cuentan.`] : []),
    "El IVA y las retenciones son una estimación hecha con las facturas registradas en Aproba: no sustituyen a los modelos 303, 111 o 115.",
  ];
  for (const n of notas) {
    const palabras = safe(n).split(" ");
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, 7.5) > W - 2 * M) { salto(50); text(actual, M, y, 7.5, font, GRIS); y -= 10; actual = p; }
      else actual = prueba;
    }
    if (actual) { salto(50); text(actual, M, y, 7.5, font, GRIS); y -= 10; }
  }

  // ── Pie en todas las páginas ────────────────────────────────────────────────
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const pie = safe(`${emisor.nombre || "Despacho"} · Informe de facturación · ${nombrePeriodo(est.periodo)}`);
    pg.drawText(pie, { x: M, y: 24, size: 7, font, color: GRIS });
    const num = `Página ${i + 1} de ${paginas.length}`;
    pg.drawText(num, { x: W - M - font.widthOfTextAtSize(num, 7), y: 24, size: 7, font, color: GRIS });
  });

  return doc.save();
}
