import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Memoria } from "@/lib/memoria";
import type { EmisorPdf } from "@/lib/export-pdf";

// PDF de la memoria de actividad (art. 8.1.f). Mismo motor que las facturas: pdf-lib
// con fuentes estándar, que solo codifican WinAnsi → se sanea lo que no entra.
// El documento se entrega a la Administración: cifras agregadas, cero datos personales.

const WIN_EXTRA = "€…‚ƒ„†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = (s: string) =>
  (s ?? "").split("").map((c) => {
    const n = c.charCodeAt(0);
    return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_EXTRA.includes(c) ? c : "?";
  }).join("");

const dmy = (iso: string) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };

export async function memoriaToPdf(mem: Memoria & { truncada?: boolean }, emisor: EmisorPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const A4: [number, number] = [595.28, 841.89];
  let page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, M = 50;
  const dark = rgb(0.12, 0.16, 0.23), slate = rgb(0.28, 0.33, 0.41), grey = rgb(0.55, 0.6, 0.66);
  const verde = rgb(0.06, 0.45, 0.36);
  let y = 792;

  const text = (s: string, x: number, size: number, f: PDFFont = font, color = dark) => page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, yy: number, size: number, f: PDFFont = font, color = dark) => {
    const ss = safe(s); page.drawText(ss, { x: xr - f.widthOfTextAtSize(ss, size), y: yy, size, font: f, color });
  };
  const line = (x1: number, x2: number, yy: number, w = 0.5, color = grey) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: w, color });
  const saltoSi = (min: number) => { if (y < min) { page = doc.addPage(A4); y = 800; } };

  // ── Cabecera ────────────────────────────────────────────────────────────────
  text(emisor.nombre || "Entidad colaboradora", M, 15, bold);
  right("MEMORIA DE ACTIVIDAD", W - M, y + 2, 11, bold, verde);
  right("Artículo 8.1.f · Orden ISM/164/2026", W - M, y - 12, 8, font, grey);
  y -= 18;
  for (const c of [emisor.nif ? `NIF/CIF ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean) as string[]) {
    text(c, M, 9, font, slate); y -= 12;
  }
  y -= 6;
  text(`Período: ${dmy(mem.periodo.desde)} — ${dmy(mem.periodo.hasta)}`, M, 10, bold);
  right(`Expedida el ${dmy(new Date().toISOString().slice(0, 10))}`, W - M, y, 9, font, slate);
  y -= 14;
  line(M, W - M, y, 1, dark); y -= 26;

  // ── Bloque de cifras ────────────────────────────────────────────────────────
  const cifras: [string, string][] = [
    ["Expedientes tramitados", String(mem.expedientesTramitados)],
    ["Iniciados en el período", String(mem.expedientesIniciados)],
    ["Presentados", String(mem.expedientesPresentados)],
    ["Personas atendidas", String(mem.personasAtendidas)],
  ];
  const ancho = (W - 2 * M) / cifras.length;
  for (let i = 0; i < cifras.length; i++) {
    const x = M + i * ancho;
    page.drawText(safe(cifras[i][1]), { x, y: y - 4, size: 22, font: bold, color: verde });
    page.drawText(safe(cifras[i][0]), { x, y: y - 18, size: 7.5, font, color: slate });
  }
  y -= 40;

  const seccion = (titulo: string) => {
    saltoSi(140); y -= 12;
    text(titulo, M, 10, bold); y -= 6;
    line(M, W - M, y, 0.5); y -= 16;
  };
  const fila = (izq: string, der: string, sangria = 0) => {
    saltoSi(70);
    text(izq, M + sangria, 9.5, font, slate);
    right(der, W - M, y, 9.5, bold);
    y -= 15;
  };
  const vacio = (msg: string) => { saltoSi(70); text(msg, M, 9, font, grey); y -= 15; };

  // ── 1. Procedimientos ───────────────────────────────────────────────────────
  seccion("1. PROCEDIMIENTOS EN LOS QUE HA INTERVENIDO LA ENTIDAD");
  if (mem.procedimientos.length === 0) vacio("Sin expedientes tramitados en el período.");
  for (const p of mem.procedimientos) fila(p.label, String(p.n));

  // ── 2. Actuaciones ──────────────────────────────────────────────────────────
  seccion("2. TIPO DE ACTUACIONES REALIZADAS");
  if (mem.actuaciones.length === 0) vacio("Sin actuaciones registradas en el período.");
  for (const a of mem.actuaciones) fila(a.label, String(a.n));

  // ── 3. Recursos ─────────────────────────────────────────────────────────────
  seccion("3. RECURSOS EMPLEADOS");
  fila("Personas con acceso al expediente electrónico", String(mem.recursos.personas));
  for (const r of mem.recursos.porRol) fila(r.rol, String(r.n), 14);
  if (mem.recursos.sedes > 0) fila("Sedes desde las que se presta el servicio", String(mem.recursos.sedes));

  // ── 4. Alcance y eficacia ───────────────────────────────────────────────────
  seccion("4. ALCANCE Y EFICACIA DE LA INTERVENCIÓN");
  fila("Personas distintas atendidas", String(mem.personasAtendidas));
  fila("Nacionalidades distintas atendidas", String(mem.alcance.nacionalidades));
  fila("Documentos revisados y validados", String(mem.alcance.documentosValidados));
  fila("Formularios oficiales y tasas cumplimentados", String(mem.alcance.formulariosGenerados));
  fila("Expedientes presentados ante la Administración", String(mem.expedientesPresentados));
  fila("Resoluciones favorables (concedidos)", String(mem.resoluciones.concedidos));
  fila("Resoluciones desfavorables (denegados)", String(mem.resoluciones.denegados));
  if (mem.resoluciones.desistidos > 0) fila("Desistimientos", String(mem.resoluciones.desistidos));
  if (mem.alcance.diasMedios !== null) {
    const d = mem.alcance.diasMedios;
    fila("Plazo medio de preparación hasta la presentación", `${d} ${d === 1 ? "día" : "días"}`);
  }

  // ── Nota al pie ─────────────────────────────────────────────────────────────
  saltoSi(120);
  y -= 18; line(M, W - M, y, 0.5); y -= 14;
  const nota = [
    "Documento generado automáticamente a partir del registro de actividad de la entidad.",
    "Contiene exclusivamente datos agregados: no incluye datos personales de las personas atendidas.",
  ];
  if (mem.truncada) {
    nota.push("AVISO: el volumen del histórico supera el máximo de esta consulta. Acote el período para obtener cifras completas.");
  }
  for (const n of nota) { text(n, M, 7.5, font, grey); y -= 11; }

  return doc.save();
}
