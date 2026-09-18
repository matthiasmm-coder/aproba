import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Tasa 790-006 (Ministerio de Justicia) — certificado de ANTECEDENTES PENALES.
// Pedida por Marta y Luis el 18/09/2026: es la que acompaña a media extranjería
// (arraigos, nacionalidad, renovaciones) y hasta hoy había que salir de Aproba.
//
// Igual que la 026: la Sede de Justicia sirve el PDF oficial DIRECTAMENTE, con Nº de
// justificante único por descarga y SIN captcha. El impreso es un AcroForm con nombres
// legibles (86 campos, casillas con on-value propio) → se baja un ejemplar fresco y se
// rellena aquí. A diferencia de la 026 no hay radios repartidos por columnas: un campo
// = un nombre, con sus tres copias (Administración / Interesado / Entidad) enlazadas.
//
// Estructura del impreso: bloque superior = SOLICITANTE (quien paga) · A = efectos en el
// extranjero · B = persona de la que se pide el certificado de antecedentes penales ·
// C = persona fallecida (últimas voluntades / seguros: no lo usamos).
// En extranjería solicitante y persona del certificado son la MISMA: se rellenan los dos
// bloques con los mismos datos, editables antes de descargar.

export const SEDE_006_INFO = "https://sede.mjusticia.gob.es/es/tramites/certificado-antecedentes";
// «Descarga del formulario 790» de la ficha del trámite (idtramite propio del certificado
// de antecedentes penales: la 026 usa otro y devuelve el impreso de nacionalidad).
const SEDE_006_PDF = "https://sede.mjusticia.gob.es/servidorformularios/formularios?idFormulario=790&lang=es_es&idtramite=1288774398320&idpagina=1215197884559";
// Comprobado el 18/09/2026 en la guía oficial del Ministerio («El precio de la tasa es de
// 3,86 euros»), que además avisa: pagar de más o de menos invalida el ingreso. Editable en
// el modal por si sube.
export const IMPORTE_006 = "3,86";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MESES_006 = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// pdf-lib (Helvetica WinAnsi) no codifica fuera de Latin-1 → se limpia como en ex-forms.
const limpiar = (s: unknown) =>
  String(s ?? "").replace(/€/g, " EUR").replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[^\x00-\xFF]/g, "").trim();

// "dd/mm/aaaa" → { d, m, a } | null.
export function partirFecha006(v: string): { d: string; m: string; a: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  if (+d < 1 || +d > 31 || +mes < 1 || +mes > 12) return null;
  return { d, m: mes, a };
}

// « C/ Mallorca 245, 3º 2ª » → vía / número / piso (best-effort, todo editable después).
export function partirDomicilio006(d: string) {
  const s = String(d ?? "");
  const numero = (s.match(/\b(\d{1,4})\b/) || [])[1] ?? "";
  const piso = (s.match(/(\d+\s*[ºo]\s*\d*\s*[ªa]?)/i) || [])[1]?.replace(/\s+/g, "") ?? "";
  const via = s.replace(/,?\s*\d+\s*[ºo].*$/i, "").replace(/\b\d{1,4}\b\s*$/, "").replace(/[,.]\s*$/, "").trim();
  return { domicilio: via, numero, piso };
}

export type Campos006 = {
  numId: string; apellido1: string; apellido2?: string; nombre: string;
  domicilio: string; numero?: string; escalera?: string; piso?: string; puerta?: string;
  municipio: string; provincia: string; pais?: string; cp: string;
  telefono?: string; email?: string;
  // Bloque B — persona del certificado (por defecto, la misma que solicita).
  fechaNac: string;            // dd/mm/aaaa
  poblacionNac?: string; provinciaNac?: string; nacionalidad?: string;
  nombrePadre?: string; nombreMadre?: string; finalidad?: string;
  // Bloque A — solo si el certificado va a surtir efectos fuera de España.
  paisDestino?: string; autoridadDestino?: string;
  correoPostal?: boolean;      // «Autorizo el envío por correo postal»: por defecto NO
  importe?: string;
  firmaLugar: string; firmaFecha: string; // dd/mm/aaaa
};

// Descarga un ejemplar oficial FRESCO (justificante único). Lanza si la Sede no da un PDF.
export async function descargarPlantilla006(): Promise<Uint8Array> {
  const res = await fetch(SEDE_006_PDF, { headers: { "User-Agent": UA }, redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Sede de Justicia: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (Buffer.from(buf.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new Error("La Sede de Justicia no ha devuelto un PDF.");
  return buf;
}

// Rellena el ejemplar oficial. Campos críticos ausentes → error (una tasa a medias en la
// ventanilla del banco es peor que un fallo claro aquí).
// opts.editable: impreso con los campos AcroForm VIVOS (el gestor corrige en cualquier
// visor); sin él, aplanado (copia para el cliente y el archivo del expediente).
export async function rellenarTasa006(plantilla: Uint8Array, c: Campos006, opts?: { editable?: boolean }): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(plantilla, { ignoreEncryption: true });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const texto = (nombre: string, valor: string | undefined, opcional = false) => {
    const v = limpiar(valor);
    try {
      const f = form.getTextField(nombre);
      if (!v) return;
      f.setText(v);
      // Campos con fuente FIJA en su DA («/Helv 10 Tf»): un valor más ancho que la casilla
      // se corta en seco. Se reduce SOLO ese campo (mín. 5 pt); los que heredan «0 Tf»
      // (auto-ajuste) no se tocan. Misma regla que la 026.
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
    } catch (e) {
      if (!opcional) throw new Error(`El impreso oficial ha cambiado (falta el campo «${nombre}»).`);
      void e;
    }
  };
  // Casillas. La marca se estampa DOS veces a propósito:
  //  · check() deja el campo vivo (ejemplar editable: el gestor puede cambiarla);
  //  · además se apunta el rectángulo para dibujar una «X» encima al aplanar. La
  //    apariencia /On que trae el impreso oficial no siempre sobrevive al flatten, y una
  //    tasa impresa con la casilla «17. Antecedentes Penales» en blanco no dice qué
  //    certificado se pide (comprobado el 18/09/2026 sobre el impreso real).
  const cruces: { page: number; x: number; y: number; h: number }[] = [];
  const paginas = pdf.getPages();
  const marcar = (nombre: string, on: boolean) => {
    try {
      const b = form.getCheckBox(nombre);
      if (on) b.check(); else b.uncheck();
      if (!on) return;
      for (const w of b.acroField.getWidgets()) {
        const i = paginas.findIndex((pg) => pg.ref === w.P());
        if (i < 0) continue;
        const r = w.getRectangle();
        cruces.push({ page: i, x: r.x + r.width / 2, y: r.y + r.height / 2, h: Math.min(r.width, r.height) });
      }
    } catch { /* casilla cosmética: nunca tumba la tasa */ }
  };

  // ── Solicitante (bloque superior) ──────────────────────────────────────────
  texto("nie", c.numId);
  texto("2 PRIMER APELLIDO DEL SOLICITANTE", c.apellido1);
  texto("3 SEGUNDO APELLIDO", c.apellido2, true);
  texto("4 NOMBRE", c.nombre);
  texto("5 DOMICILIO CALLEPLAZAAVENIDA", c.domicilio);
  texto("6 NÚMERO", c.numero, true);
  texto("ESCALERA", c.escalera, true);
  texto("8 PISO", c.piso, true);
  texto("9 PUERTA", c.puerta, true);
  texto("10 TELEFONOS FIJO YO MÓVIL", c.telefono, true);
  texto("11 DOMICILIO MUNICIPIO", c.municipio);
  texto("12 DOMICILIO PROVINCIA", c.provincia);
  texto("12 DOMICILIO PAIS", c.pais || "España", true);
  texto("14 CÓDIGO POSTAL", c.cp);
  texto("15 CORREO ELECTRÓNICO", c.email, true);

  // Certificado solicitado: solo antecedentes penales (los otros dos son de herencias).
  marcar("17 Antecedentes Penales", true);
  marcar("18 Últimas voluntades", false);
  marcar("19 Contrato de seguros de cobertura de", false);

  // ── A. Efectos en el extranjero (opcional) ─────────────────────────────────
  texto("20 PAÍS DE DESTINO", c.paisDestino, true);
  texto("21 AUTORIDAD O ENTIDAD ANTE LA QUE DEBE SURTIR EFECTOS", c.autoridadDestino, true);

  // ── B. Persona del certificado de antecedentes penales ─────────────────────
  const nac = partirFecha006(c.fechaNac);
  if (!nac) throw new Error("Fecha de nacimiento inválida (dd/mm/aaaa).");
  texto("22 NIFCIFNIE", c.numId);
  texto("23 PRIMER APELLIDO O DENOMINACIÓN SOCIAL", c.apellido1);
  texto("24 SEGUNDO APELLIDO", c.apellido2, true);
  texto("25 NOMBRE", c.nombre);
  texto("26 FECHA DE NACIMIENTO", `${nac.d}/${nac.m}/${nac.a}`);
  texto("27 POBLACIÓN DE NACIMIENTO", c.poblacionNac, true);
  texto("28 PROVINCIAPAIS DE NACIMIENTO", c.provinciaNac, true);
  texto("29 PAÍS DE NACIONALIDAD", c.nacionalidad, true);
  texto("30 NOMBRE DEL PADRE", c.nombrePadre, true);
  texto("31 NOMBRE DE LA MADRE", c.nombreMadre, true);
  texto("32 FINALIDAD PARA LA QUE SE SOLICITA", c.finalidad, true);

  // ── Envío por correo postal: por defecto NO (el certificado se recoge/descarga) ──
  marcar("ACEPTAR", Boolean(c.correoPostal));
  marcar("DENEGAR", !c.correoPostal);

  // ── Ingreso y firma ───────────────────────────────────────────────────────
  texto("EUROS", c.importe || IMPORTE_006);
  marcar("Casilla de verificación7", true);   // forma de pago: en efectivo
  marcar("Casilla de verificación8", false);  // E.C. adeudo en cuenta
  const fir = partirFecha006(c.firmaFecha);
  if (!fir) throw new Error("Fecha de firma inválida (dd/mm/aaaa).");
  texto("FECHA LUGAR", c.firmaLugar);
  texto("FECHA DIA", fir.d);
  texto("FECHA MES", MESES_006[+fir.m - 1], true);
  texto("FECHA", fir.a.slice(2), true);       // el impreso ya trae «de 20……»
  // Devengo · Ejercicio: los cuatro dígitos del año, una casilla cada uno.
  ["Uno", "dos", "Tres", "cuatro"].forEach((n, i) => texto(n, fir.a[i], true));

  form.updateFieldAppearances(font);
  if (!opts?.editable) {
    form.flatten();
    for (const c of cruces) {
      const size = Math.max(6, Math.min(10, c.h));
      const pg = paginas[c.page];
      // Centrado sobre el cuadrado impreso: la «X» de Helvetica mide ~0,667 em de ancho
      // y ~0,72 em de alto sobre la línea base.
      pg.drawText("X", { x: c.x - font.widthOfTextAtSize("X", size) / 2, y: c.y - size * 0.36, size, font });
    }
  }
  return pdf.save();
}
