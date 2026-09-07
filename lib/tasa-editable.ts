import "server-only";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";

// Hace EDITABLES los datos personales de un impreso 790 generado por una Sede (012 Policía,
// 052 Administraciones Públicas): esos generadores devuelven un PDF PLANO (texto impreso,
// sin campos). Aquí se localizan, con pdfjs, los ítems de texto que coinciden con los valores
// que el gestor envió, se tapan en blanco y se pone encima un campo AcroForm con ese valor —
// UN campo por dato, con un widget en cada copia del impreso (Administración / Interesado /
// Entidad), así corregir una vez corrige las tres. El importe, el justificante y el código
// de barras NO se tocan (el banco cobra por el código de barras: editarlo lo invalidaría).
// Si el PDF no trae texto extraíble o nada coincide, se devuelve tal cual (nunca falla).

const TINTA = rgb(0, 0, 0);
const FONDO = rgb(0.93, 0.96, 1); // azul muy claro: el gestor VE que ahí se puede escribir
export const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

type Item = { s: string; x: number; y: number; w: number; h: number; font: string; page: number };

/** valores: clave → uno o varios candidatos (el impreso puede juntar «APELLIDO1 APELLIDO2, NOMBRE»). */
export async function tasaEditable(bytes: Uint8Array, valores: Record<string, string | string[]>): Promise<{ pdf: Uint8Array; campos: number }> {
  let items: Item[] = [];
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      for (const i of tc.items as { str: string; transform: number[]; width: number; height: number; fontName: string }[]) {
        if (!i.str?.trim()) continue;
        items.push({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.hypot(i.transform[0], i.transform[1]), font: i.fontName, page: p - 1 });
      }
    }
  } catch {
    return { pdf: bytes, campos: 0 };
  }
  if (!items.length) return { pdf: bytes, campos: 0 };

  const candidatos = Object.entries(valores).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(norm).filter((x) => x.length >= 1)] as const).filter(([, l]) => l.length);
  const coincide = (it: Item, v: string) => norm(it.s) === v;
  // 1) Valores largos (≥ 3 caracteres): fijan la fuente y el cuerpo con que el generador
  //    imprime los DATOS. 2) Los cortos («31», «1») solo se aceptan con esa misma fuente y
  //    cuerpo, para no confundirlos con numeración impresa del propio impreso.
  const largos = candidatos.flatMap(([k, l]) => l.filter((v) => v.length >= 3).map((v) => [k, v] as const));
  const hitsLargos = items.filter((it) => largos.some(([, v]) => coincide(it, v)));
  const firma = new Map<string, number>();
  for (const it of hitsLargos) { const key = `${it.font}|${Math.round(it.h)}`; firma.set(key, (firma.get(key) ?? 0) + 1); }
  const fuenteDatos = [...firma.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!fuenteDatos) return { pdf: bytes, campos: 0 };

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let campos = 0;
  const usados = new Set<Item>();
  for (const [clave, lista] of candidatos) {
    // Primer candidato que aparezca en el impreso (p. ej. «DIALLO DIAZ, AICHA» antes que «DIALLO»).
    let hits: Item[] = [];
    let valorOriginal = "";
    for (const v of lista) {
      hits = items.filter((it) => !usados.has(it) && coincide(it, v) && (v.length >= 3 || `${it.font}|${Math.round(it.h)}` === fuenteDatos));
      if (hits.length) { valorOriginal = it0(hits); break; }
    }
    if (!hits.length) continue;
    const f = form.createTextField(`t_${clave.replace(/[^A-Za-z0-9_]/g, "")}`);
    f.setText(valorOriginal);
    const size = Math.max(6, Math.min(12, Math.round(hits[0].h)));
    for (const it of hits) {
      usados.add(it);
      const pg = pages[it.page];
      if (!pg) continue;
      // Ancho: hasta el siguiente ítem impreso de la misma línea (−4), máx. 260, mín. el texto + 30.
      const siguiente = items.filter((o) => o.page === it.page && o !== it && Math.abs(o.y - it.y) < 3 && o.x > it.x + it.w - 1).sort((a, b) => a.x - b.x)[0];
      const tope = siguiente ? siguiente.x - 4 : pg.getWidth() - 30;
      const ancho = Math.max(it.w + 30, Math.min(260, tope - it.x));
      // Tapar el texto impreso: caja de la tinta (descendentes incluidos).
      pg.drawRectangle({ x: it.x - 1, y: it.y - 0.3 * it.h, width: it.w + 2, height: it.h * 1.15, color: rgb(1, 1, 1), borderWidth: 0 });
      f.addToPage(pg, { x: it.x - 2, y: it.y - 0.3 * it.h - 1, width: ancho, height: it.h * 1.15 + 3, font, textColor: TINTA, backgroundColor: FONDO, borderWidth: 0, borderColor: undefined });
    }
    f.setFontSize(size);
    campos++;
  }
  if (!campos) return { pdf: bytes, campos: 0 };
  try { form.updateFieldAppearances(font); } catch { /* ignore */ }
  // /DA en una sola línea y en cada widget (Vista Previa no hereda el del campo — ver ex-forms).
  for (const f of form.getFields()) {
    if (!f.getName().startsWith("t_")) continue;
    const da = f.acroField.getDefaultAppearance?.();
    const m = da?.match(/\/([A-Za-z0-9#_+-]+)\s+([\d.]+)\s+Tf/);
    if (!m) continue;
    const linea = `/${m[1]} ${m[2]} Tf 0 0 0 rg`;
    f.acroField.setDefaultAppearance(linea);
    for (const w of f.acroField.getWidgets()) w.dict.set(PDFName.of("DA"), PDFString.of(linea));
  }
  return { pdf: await pdf.save(), campos };
}

const it0 = (hits: Item[]) => hits[0].s.trim();
