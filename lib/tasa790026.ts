import "server-only";
import { PDFDocument, PDFName, StandardFonts, type PDFForm } from "pdf-lib";

// Tasa 790-026 (Ministerio de Justicia) — nacionalidad española por residencia.
// A diferencia de la 790-012 (generador web de la Policía con sesión + captcha), la
// Sede de Justicia sirve DIRECTAMENTE el PDF oficial, con Nº de justificante ÚNICO por
// descarga y SIN captcha. El PDF es un AcroForm de 62 campos con nombres legibles:
// se baja un ejemplar fresco (el número lo pone su servidor) y se rellena aquí.
//
// ⚠️ Los 3 radios (ID / TipoSolicitud / TipoPago) repiten sus casillas en las 3 copias
// del impreso (Administración / Interesado / Entidad) con on-values DISTINTOS por
// página (0..8): /V solo puede marcar una casilla, así que se fuerza /AS casilla a
// casilla, eligiendo por POSICIÓN (columna x) — nunca por on-value, que es opaco.

export const SEDE_026_INFO = "https://sede.mjusticia.gob.es/es/tramites/nacionalidad-espanola";
const SEDE_026_PDF = "https://sede.mjusticia.gob.es/enares790?lang=es_es&idtramite=1288776962092&idpagina=1215197884559";
// Comprobado el 28/08/2026 (BOE: sin cambio desde 2015). Editable en el modal por si sube.
export const IMPORTE_026 = "104,05";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const MESES_026 = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] as const;

// pdf-lib (Helvetica WinAnsi) no codifica fuera de Latin-1 → se limpia igual que en ex-forms.
const limpiar = (s: unknown) =>
  String(s ?? "").replace(/€/g, " EUR").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[^\x00-\xFF]/g, "").trim();

export const soloDigitos = (s: string) => String(s ?? "").replace(/\D/g, "");

// "dd/mm/aaaa" → { d:"dd", m:"mm", a:"aaaa" } | null si no es una fecha bien formada.
export function partirFecha(v: string): { d: string; m: string; a: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  if (+d < 1 || +d > 31 || +mes < 1 || +mes > 12) return null;
  return { d, m: mes, a };
}

// « C/ Mallorca 245, 3º 2ª » → domicilio (vía sin número) / número / piso. Igual que
// el best-effort de la 790-012; todo queda editable en el modal antes de generar.
export function partirDomicilio026(d: string) {
  const s = String(d ?? "");
  const numero = (s.match(/\b(\d{1,4})\b/) || [])[1] ?? "";
  const piso = (s.match(/(\d+\s*[ºo]\s*\d*\s*[ªa]?)/i) || [])[1]?.replace(/\s+/g, "") ?? "";
  const via = s.replace(/,?\s*\d+\s*[ºo].*$/i, "").replace(/\b\d{1,4}\b\s*$/, "").replace(/[,.]\s*$/, "").trim();
  return { domicilio: via, numero, piso };
}

export type Campos026 = {
  tipoDoc: "pasaporte" | "nie" | "dni";
  numId: string; apellido1: string; apellido2?: string; nombre: string;
  domicilio: string; numero?: string; escalera?: string; piso?: string; puerta?: string;
  municipio: string; provincia: string; pais?: string; cp: string;
  fechaNac: string; // dd/mm/aaaa
  telefono?: string; email?: string;
  presNumId?: string; presNombre?: string; // solo si el presentador ≠ solicitante
  importe?: string;
  firmaLugar: string; firmaFecha: string; // dd/mm/aaaa
};

// Descarga un ejemplar oficial FRESCO (justificante único). Lanza si la Sede no da un PDF.
export async function descargarPlantilla026(): Promise<Uint8Array> {
  const res = await fetch(SEDE_026_PDF, { headers: { "User-Agent": UA }, redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Sede de Justicia: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (Buffer.from(buf.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error("La Sede de Justicia no ha devuelto un PDF.");
  return buf;
}

// Marca la columna `col` (0-izquierda) del radio en LAS TRES copias: /AS por casilla
// (lo que se imprime) + /V con el on-value de la primera (coherencia del formulario).
function marcarRadio(pdf: PDFDocument, form: PDFForm, nombre: string, col: number) {
  const pages = pdf.getPages();
  const grupo = form.getRadioGroup(nombre);
  const widgets = grupo.acroField.getWidgets();
  const porPagina = new Map<number, { x: number; w: (typeof widgets)[number] }[]>();
  for (const w of widgets) {
    const ref = w.P();
    const p = pages.findIndex((pg) => pg.ref === ref);
    const lista = porPagina.get(p) ?? [];
    lista.push({ x: w.getRectangle().x, w });
    porPagina.set(p, lista);
  }
  let primera = true;
  for (const [, lista] of [...porPagina.entries()].sort((a, b) => a[0] - b[0])) {
    lista.sort((a, b) => a.x - b.x);
    lista.forEach(({ w }, i) => {
      const on = w.getOnValue();
      if (i === col && on) {
        w.dict.set(PDFName.of("AS"), on);
        if (primera) { grupo.acroField.dict.set(PDFName.of("V"), on); primera = false; }
      } else {
        w.dict.set(PDFName.of("AS"), PDFName.of("Off"));
      }
    });
  }
}

// Rellena el ejemplar oficial. Campos críticos ausentes → error (una tasa a medias en
// la ventanilla del banco es peor que un fallo claro aquí).
export async function rellenarTasa026(plantilla: Uint8Array, c: Campos026): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(plantilla, { ignoreEncryption: true });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const texto = (nombre: string, valor: string | undefined, opcional = false) => {
    const v = limpiar(valor);
    try {
      const f = form.getTextField(nombre);
      if (v) {
        f.setText(v);
        // Muchos campos del impreso llevan fuente FIJA en su DA («/Helv 12 Tf»): un
        // valor más ancho que la casilla se corta en seco (visto con datos reales:
        // «WILLIAM MARSHALL» perdía la última letra en sus 113 pt). Si el DA fija un
        // tamaño y el texto desborda, se reduce SOLO ese campo (mín. 5 pt). Los campos
        // sin DA propio heredan «/Helv 0 Tf» del formulario = auto-ajuste: no tocar.
        try {
          const da = String(f.acroField.getDefaultAppearance?.() ?? "");
          const fija = Number((/\/\S+\s+([\d.]+)\s+Tf/.exec(da) ?? [])[1] ?? 0);
          const ancho = f.acroField.getWidgets()[0]?.getRectangle().width ?? 0;
          if (fija > 0 && ancho > 8 && font.widthOfTextAtSize(v, fija) > ancho - 5) {
            let size = fija;
            while (size > 5 && font.widthOfTextAtSize(v, size) > ancho - 5) size -= 0.5;
            f.setFontSize(size);
          }
        } catch { /* ajuste de tamaño: nunca tumba el campo */ }
      }
    } catch (e) {
      if (!opcional) throw new Error(`El impreso oficial ha cambiado (falta el campo «${nombre}»).`);
      void e;
    }
  };

  texto("NumID", c.numId);
  texto("Apellido1", c.apellido1);
  texto("Apellido2", c.apellido2, true);
  texto("Nombre", c.nombre);
  texto("Domicilio", c.domicilio);
  texto("Numero", c.numero, true);
  texto("Escalera", c.escalera, true);
  texto("Piso", c.piso, true);
  texto("Puerta", c.puerta, true);
  texto("Telefono", c.telefono, true);
  texto("Municipio", c.municipio);
  texto("Provincia", c.provincia);
  texto("Pais", c.pais || "España", true);
  texto("Email", c.email, true);
  texto("NumIDPresentador", c.presNumId, true);
  texto("NombreApePresentador", c.presNombre, true);

  // C.P. y fecha de nacimiento: casillas de un dígito.
  const cp = soloDigitos(c.cp).slice(0, 5);
  cp.split("").forEach((d, i) => texto(`CP${i + 1}`, d, true));
  const nac = partirFecha(c.fechaNac);
  if (!nac) throw new Error("Fecha de nacimiento inválida (dd/mm/aaaa).");
  texto("FechaNacD1", nac.d[0], true); texto("FechaNacD2", nac.d[1], true);
  texto("FechaNacM1", nac.m[0], true); texto("FechaNacM2", nac.m[1], true);
  nac.a.split("").forEach((d, i) => texto(`FechaNacA${i + 1}`, d, true));

  // Firma y devengo (Ejercicio = año de la fecha de firma).
  const fir = partirFecha(c.firmaFecha);
  if (!fir) throw new Error("Fecha de firma inválida (dd/mm/aaaa).");
  texto("FirmaLugar", c.firmaLugar);
  texto("FirmaDia", fir.d);
  try { form.getDropdown("FirmaMes").select(MESES_026[+fir.m - 1]); } catch { /* mes: cosmético */ }
  texto("FirmaAnno", fir.a.slice(2), true); // el impreso ya trae «de 20……»
  fir.a.split("").forEach((d, i) => texto(`Ejercicio${i + 1}`, d, true));

  texto("Importe1", c.importe || IMPORTE_026);

  // Radios (columnas de izquierda a derecha, medidas sobre el impreso real):
  //   ID: Pasaporte | NIE | DNI-UE · TipoSolicitud: residencia | sefardíes · Pago: efectivo | adeudo
  const colId = c.tipoDoc === "pasaporte" ? 0 : c.tipoDoc === "nie" ? 1 : 2;
  marcarRadio(pdf, form, "ID", colId);
  marcarRadio(pdf, form, "TipoSolicitud", 0);
  marcarRadio(pdf, form, "TipoPago", 0);

  form.updateFieldAppearances(font);
  form.flatten();
  return pdf.save();
}
