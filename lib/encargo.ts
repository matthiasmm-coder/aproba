import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchServiciosDeWorkspace } from "./data/config";
import { TIPO_A_SERVICIO } from "./tramites";

// ─────────────────────────────────────────────────────────────────────────────
// HOJA DE ENCARGO + MANDATO DE REPRESENTACIÓN (petición del 1er cliente real).
// Generados al vuelo con los datos ya presentes en la plataforma; el cliente los
// descarga desde su portal, los firma y los vuelve a subir como documentos.
// El mandato reproduce el modelo oficial del Consejo General de Colegios de
// Gestores Administrativos aportado por el cliente (arts. 1709-1739 CC, art. 5
// Ley 39/2015), con la mención específica adaptada a extranjería.
// ─────────────────────────────────────────────────────────────────────────────

export type DatosEncargo = {
  referencia: string;
  fecha: Date;
  despacho: { nombre: string; nif: string; domicilio: string; email: string };
  mandatario: { nombre: string; dni: string; colegiado: string; colegio: string };
  cliente: {
    nombre: string; apellidos: string; documento: string; nacionalidad: string;
    domicilio: string; municipio: string; cp: string; provincia: string;
    telefono: string; email: string;
  };
  servicio: { label: string; desc: string; anticipo: number; resto: number; noIncluye: string };
  medios: string[]; // medios de pago disponibles (transferencia con IBAN, tarjeta…)
};

const s = (v: unknown) => String(v ?? "").trim();
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} EUR`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
// Helvetica (WinAnsi): normaliza tipografía y ELIMINA controles (que si no
// harían que pdf-lib lanzara «WinAnsi cannot encode» y rompiera todo el PDF con
// un 500 persistente — vector: cualquier campo pegado desde Word/PDF). Conserva
// \n para los saltos de párrafo. Los reemplazos van ANTES del strip final.
const limpiar = (t: string) => t
  .replace(/\u20AC/g, "EUR")                 // €
  .replace(/[\u00AB\u00BB\u201C\u201D]/g, '"') // « » " "
  .replace(/[\u2018\u2019]/g, "'")           // ' '
  .replace(/[\u2013\u2014]/g, "-")           // – —
  .replace(/\u2026/g, "...")                  // …
  .replace(/[\u00A0\t\r]/g, " ")            // nbsp, tab, CR → espacio (conserva \n)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "") // controles
  .replace(/[^\x00-\xFF]/g, "");            // resto no-WinAnsi (árabe/chino…)
// Hueco a rellenar a mano cuando el dato falta O cuando tras limpiar queda vacío
// (p. ej. un nombre en árabe/chino que Helvetica no puede pintar): en un documento
// legal el nombre NUNCA debe desaparecer en silencio — se deja subrayado.
const o = (v: unknown, ancho = 24) => limpiar(s(v)).trim() || "_".repeat(ancho);

// ── Recogida de datos ────────────────────────────────────────────────────────

type ExpRow = {
  id: string; referencia: string; tipo: string; servicioClave: string | null; workspaceId: string;
  cliente: Record<string, string | null> | null;
};

export async function datosEncargo(admin: SupabaseClient, exp: ExpRow): Promise<DatosEncargo | null> {
  // Workspace: datos del despacho + mandatario. Replis si la migración no está aplicada.
  let wsRes = await admin.from("Workspace")
    .select("nombre, nif, domicilio, emailFacturacion, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio")
    .eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace").select("nombre, nif, domicilio, emailFacturacion").eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace").select("nombre, nif").eq("id", exp.workspaceId).maybeSingle();
  const ws = (wsRes.data ?? {}) as Record<string, unknown>;
  if (!ws.nombre) return null;

  const servicios = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
  const servicio = servicios.find((x) => x.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
  if (!servicio) return null;

  // Medios de pago reales del despacho: IBAN activo + tarjeta si está configurada.
  const medios: string[] = [];
  try {
    const { data: cuentas } = await admin.from("CuentaBancaria").select("iban, titular").eq("workspaceId", exp.workspaceId).eq("activa", true).limit(1);
    const c = cuentas?.[0] as { iban?: string; titular?: string } | undefined;
    if (c?.iban) medios.push(`Transferencia bancaria a la cuenta ${c.iban} (titular: ${c.titular ?? s(ws.nombre)})`);
  } catch { /* tabla sin migrar */ }
  try {
    const { fetchStripeKeyDeWorkspace } = await import("./cobros-tarjeta");
    if (await fetchStripeKeyDeWorkspace(admin, exp.workspaceId)) medios.push("Pago con tarjeta (enlace de pago seguro online)");
  } catch { /* sin tarjeta */ }
  if (!medios.length) medios.push("Transferencia bancaria (datos facilitados en la factura)");

  const c = exp.cliente ?? {};
  return {
    referencia: exp.referencia,
    fecha: new Date(),
    despacho: { nombre: s(ws.nombre), nif: s(ws.nif), domicilio: s(ws.domicilio), email: s(ws.emailFacturacion) },
    mandatario: {
      nombre: s(ws.mandatarioNombre), dni: s(ws.mandatarioDni),
      colegiado: s(ws.mandatarioColegiado), colegio: s(ws.mandatarioColegio),
    },
    cliente: {
      nombre: s(c.nombre), apellidos: s(c.apellidos), documento: s(c.numeroDocumento), nacionalidad: s(c.nacionalidad),
      domicilio: [s(c.via), s(c.numeroVia), s(c.piso)].filter(Boolean).join(", "),
      municipio: s(c.municipio), cp: s(c.codigoPostal), provincia: s(c.provincia),
      telefono: s(c.telefono), email: s(c.email),
    },
    servicio: {
      label: servicio.label, desc: servicio.desc,
      anticipo: servicio.anticipo, resto: servicio.resto,
      noIncluye: s((servicio as { noIncluye?: string }).noIncluye),
    },
    medios,
  };
}

// ── Motor de maquetación (pdf-lib) ──────────────────────────────────────────

const A4: [number, number] = [595, 842];
const MARGEN = 56;
const ANCHO = A4[0] - MARGEN * 2;
const TINTA = rgb(0.08, 0.11, 0.18);
const GRIS = rgb(0.42, 0.47, 0.55);
const VERDE = rgb(0.055, 0.55, 0.37);

class Maqueta {
  doc!: PDFDocument; page!: PDFPage; y = 0;
  font!: PDFFont; bold!: PDFFont;
  static async crear(): Promise<Maqueta> {
    const m = new Maqueta();
    m.doc = await PDFDocument.create();
    m.font = await m.doc.embedFont(StandardFonts.Helvetica);
    m.bold = await m.doc.embedFont(StandardFonts.HelveticaBold);
    m.nuevaPagina();
    return m;
  }
  hdr?: { despacho: string; ref: string };
  nuevaPagina() {
    this.page = this.doc.addPage(A4);
    // Fondo blanco explícito (sin él, la página es transparente en conversiones).
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(1, 1, 1) });
    this.y = A4[1] - MARGEN;
    // Páginas 2+: cabecera de continuación (la 1ª la pinta cabecera() aparte).
    if (this.hdr) {
      this.page.drawRectangle({ x: 0, y: A4[1] - 4, width: A4[0], height: 4, color: VERDE });
      this.page.drawText(limpiar(this.hdr.despacho), { x: MARGEN, y: A4[1] - 30, size: 9, font: this.bold, color: GRIS });
      const ref = limpiar(`Expediente ${this.hdr.ref}`);
      this.page.drawText(ref, { x: A4[0] - MARGEN - this.font.widthOfTextAtSize(ref, 8), y: A4[1] - 30, size: 8, font: this.font, color: GRIS });
      this.y = A4[1] - 48;
    }
  }
  necesita(alto: number) { if (this.y - alto < MARGEN) this.nuevaPagina(); }
  espacio(n: number) { this.y -= n; }
  private lineas(texto: string, size: number, font: PDFFont, ancho = ANCHO): string[] {
    const out: string[] = [];
    for (const brut of limpiar(texto).split("\n")) {
      let linea = "";
      for (const palabra of brut.split(/\s+/).filter(Boolean)) {
        // Trocear por caracteres una «palabra» más ancha que el ancho (evita desborde).
        let p = palabra;
        while (p.length > 1 && font.widthOfTextAtSize(p, size) > ancho) {
          let cut = p.length;
          while (cut > 1 && font.widthOfTextAtSize(p.slice(0, cut), size) > ancho) cut--;
          if (linea) { out.push(linea); linea = ""; }
          out.push(p.slice(0, cut));
          p = p.slice(cut);
        }
        const test = linea ? `${linea} ${p}` : p;
        if (font.widthOfTextAtSize(test, size) <= ancho) linea = test;
        else { if (linea) out.push(linea); linea = p; }
      }
      out.push(linea);
    }
    return out;
  }
  parrafo(texto: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; interlinea?: number; sangria?: number }) {
    const size = opts?.size ?? 9.5;
    const font = opts?.bold ? this.bold : this.font;
    const inter = opts?.interlinea ?? size * 1.45;
    const x = MARGEN + (opts?.sangria ?? 0);
    for (const linea of this.lineas(texto, size, font, ANCHO - (opts?.sangria ?? 0))) {
      this.necesita(inter);
      this.page.drawText(linea, { x, y: this.y - size, size, font, color: opts?.color ?? TINTA });
      this.y -= inter;
    }
  }
  titulo(texto: string) {
    this.necesita(30);
    this.page.drawText(limpiar(texto), { x: MARGEN, y: this.y - 13, size: 13, font: this.bold, color: TINTA });
    this.y -= 30;
  }
  seccion(texto: string) {
    this.espacio(6);
    this.necesita(38); // barra (22) + al menos una línea de contenido → no huérfana
    this.page.drawRectangle({ x: MARGEN, y: this.y - 15.5, width: ANCHO, height: 15.5, color: rgb(0.955, 0.96, 0.945) });
    this.page.drawText(limpiar(texto), { x: MARGEN + 6, y: this.y - 11.5, size: 8.5, font: this.bold, color: TINTA });
    this.y -= 22;
  }
  fila(label: string, valor: string) {
    const size = 9.5;
    const lh = 13;
    const lns = this.lineas(valor, size, this.bold, ANCHO - 150); // lineas() ya limpia
    const alto = Math.max(15.5, lns.length * lh);
    this.necesita(alto);
    this.page.drawText(limpiar(label), { x: MARGEN, y: this.y - size, size: 8, font: this.font, color: GRIS });
    lns.forEach((ln, i) => this.page.drawText(ln, { x: MARGEN + 150, y: this.y - size - i * lh, size, font: this.bold, color: TINTA }));
    this.y -= alto;
  }
  firmas(izq: string, der: string) {
    this.necesita(86);
    const mitad = MARGEN + ANCHO / 2;
    const yTop = this.y - 8;
    this.page.drawText(limpiar(izq), { x: MARGEN, y: yTop, size: 9, font: this.bold, color: TINTA });
    this.page.drawText(limpiar(der), { x: mitad + 20, y: yTop, size: 9, font: this.bold, color: TINTA });
    const yLinea = yTop - 52;
    this.page.drawLine({ start: { x: MARGEN, y: yLinea }, end: { x: MARGEN + 190, y: yLinea }, thickness: 0.7, color: GRIS });
    this.page.drawLine({ start: { x: mitad + 20, y: yLinea }, end: { x: mitad + 210, y: yLinea }, thickness: 0.7, color: GRIS });
    this.page.drawText("Firma", { x: MARGEN, y: yLinea - 11, size: 7.5, font: this.font, color: GRIS });
    this.page.drawText("Firma", { x: mitad + 20, y: yLinea - 11, size: 7.5, font: this.font, color: GRIS });
    this.y = yLinea - 26;
  }
  cabecera(despacho: string, referencia: string) {
    this.hdr = { despacho, ref: referencia }; // reutilizado en nuevaPagina() (págs. 2+)
    this.page.drawRectangle({ x: 0, y: A4[1] - 4, width: A4[0], height: 4, color: VERDE });
    this.page.drawText(limpiar(despacho), { x: MARGEN, y: A4[1] - 34, size: 11, font: this.bold, color: TINTA });
    const ref = limpiar(`Expediente ${referencia}`);
    this.page.drawText(ref, { x: A4[0] - MARGEN - this.font.widthOfTextAtSize(ref, 8), y: A4[1] - 34, size: 8, font: this.font, color: GRIS });
    this.y = A4[1] - 58;
  }
  async bytes(): Promise<Uint8Array> { return this.doc.save(); }
}

// ── 1) HOJA DE ENCARGO ──────────────────────────────────────────────────────

export async function generarHojaEncargo(d: DatosEncargo): Promise<Uint8Array> {
  const m = await Maqueta.crear();
  m.cabecera(d.despacho.nombre, d.referencia);
  m.titulo("HOJA DE ENCARGO PROFESIONAL");
  m.parrafo(`Fecha: ${fechaLarga(d.fecha)}`, { size: 8.5, color: GRIS });
  m.espacio(4);

  m.seccion("1. EL PROFESIONAL");
  m.fila("Despacho", d.despacho.nombre);
  m.fila("NIF/CIF", o(d.despacho.nif));
  m.fila("Domicilio profesional", o(d.despacho.domicilio, 40));
  if (d.mandatario.nombre) m.fila("Profesional responsable", d.mandatario.nombre + (d.mandatario.colegiado ? ` (colegiado n. ${d.mandatario.colegiado})` : ""));
  m.fila("Contacto", o(d.despacho.email, 30));

  m.seccion("2. EL CLIENTE");
  m.fila("Nombre completo", o(`${d.cliente.nombre} ${d.cliente.apellidos}`.trim(), 30));
  m.fila("NIE / Pasaporte", o(d.cliente.documento));
  m.fila("Nacionalidad", o(d.cliente.nacionalidad));
  m.fila("Domicilio", [d.cliente.domicilio, d.cliente.cp, d.cliente.municipio, d.cliente.provincia].filter(Boolean).join(", ") || o("", 40));
  m.fila("Contacto", [d.cliente.telefono, d.cliente.email].filter(Boolean).join(" / ") || o("", 30));

  m.seccion("3. OBJETO DEL ENCARGO — SERVICIOS INCLUIDOS");
  m.parrafo(`El cliente encarga al profesional la tramitación de: ${d.servicio.label}.`, { bold: true });
  if (d.servicio.desc) m.parrafo(d.servicio.desc);
  m.parrafo("El encargo incluye la preparación y revisión de la documentación, la cumplimentación de los formularios oficiales del trámite, su presentación ante el órgano competente y el seguimiento del expediente hasta su resolución.");

  m.seccion("4. SERVICIOS NO INCLUIDOS");
  m.parrafo(d.servicio.noIncluye || "Cualquier actuación no descrita en el apartado anterior. En particular, recursos administrativos o judiciales, trámites distintos del indicado y desplazamientos, que en su caso serán objeto de encargo y presupuesto aparte.");

  m.seccion("5. HONORARIOS");
  if (d.servicio.anticipo > 0 || d.servicio.resto > 0) {
    if (d.servicio.anticipo > 0) m.fila("Al inicio (a la firma)", `${eur(d.servicio.anticipo)} + IVA (21%)`);
    if (d.servicio.resto > 0) m.fila("Al finalizar el trámite", `${eur(d.servicio.resto)} + IVA (21%)`);
    m.fila("Total honorarios", `${eur(d.servicio.anticipo + d.servicio.resto)} + IVA (21%)`);
  } else {
    m.fila("Honorarios", "Según presupuesto");
  }
  m.parrafo("Los honorarios no incluyen las tasas oficiales ni otros suplidos, que se repercutirán al cliente por su importe exacto en la factura correspondiente.", { size: 8.5, color: GRIS });

  m.seccion("6. FORMA Y MEDIOS DE PAGO");
  m.parrafo(
    d.servicio.anticipo > 0 && d.servicio.resto > 0
      ? "El pago se realiza en dos plazos: el anticipo al inicio del encargo y el resto a la finalización del trámite, previa emisión de la factura correspondiente."
      : d.servicio.anticipo > 0
        ? "El pago se realiza en un único plazo al inicio del encargo, previa emisión de la factura correspondiente."
        : d.servicio.resto > 0
          ? "El pago se realiza a la finalización del trámite, previa emisión de la factura correspondiente."
          : "El pago se acuerda según el presupuesto aceptado, previa emisión de la factura correspondiente.",
  );
  for (const medio of d.medios) m.parrafo(`- ${medio}`, { sangria: 8 });

  m.seccion("7. PROTECCIÓN DE DATOS");
  m.parrafo(`Los datos personales del cliente serán tratados por ${d.despacho.nombre} como responsable del tratamiento, con la única finalidad de prestar los servicios objeto de este encargo y cumplir las obligaciones legales derivadas. El cliente puede ejercer sus derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad dirigiéndose al despacho en los datos de contacto indicados. Conforme al RGPD (UE) 2016/679 y la LO 3/2018.`, { size: 8.5, color: GRIS });

  m.espacio(10);
  m.parrafo("En ____________________________, a ______ de ______________________ de 20____", { size: 9.5 });
  m.espacio(8);
  m.firmas("EL PROFESIONAL", "EL CLIENTE");
  return m.bytes();
}

// ── 2) MANDATO DE REPRESENTACIÓN (modelo Consejo GA, adaptado a extranjería) ─

export async function generarMandato(d: DatosEncargo): Promise<Uint8Array> {
  const m = await Maqueta.crear();
  m.cabecera(d.despacho.nombre, d.referencia);
  m.titulo("MANDATO CON REPRESENTACIÓN");
  m.espacio(2);

  const mandante = `${d.cliente.nombre} ${d.cliente.apellidos}`.trim();
  const notif = [d.cliente.domicilio, d.cliente.cp ? `CP ${d.cliente.cp}` : "", d.cliente.municipio, d.cliente.provincia].filter(Boolean).join(", ");

  m.parrafo(`D./Dna. ${o(mandante, 40)}, con DNI/NIE ${o(d.cliente.documento, 14)}, y domicilio a efectos de notificaciones en ${o(notif, 50)}, en concepto de MANDANTE, dice y otorga:`);
  m.espacio(4);
  // Cláusula de colegiación SOLO si el gestor la configuró: un abogado no colegiado
  // como GA no debe quedar afiliado falsamente a un Colegio de Gestores.
  const colegiadoTxt = d.mandatario.colegiado ? `, número de colegiado ${d.mandatario.colegiado}` : "";
  const colegioTxt = d.mandatario.colegio ? `, perteneciente al ${d.mandatario.colegio}` : "";
  m.parrafo(`Que por el presente documento confiere, con carácter general, MANDATO CON REPRESENTACIÓN a favor de D./Dna. ${o(d.mandatario.nombre, 36)}, con DNI ${o(d.mandatario.dni, 12)}${colegiadoTxt}${colegioTxt}, y al despacho profesional ${d.despacho.nombre}, con domicilio en ${o(d.despacho.domicilio, 40)}, en concepto de MANDATARIO, para que promueva, solicite y realice todos los trámites necesarios para su actuación ante todos los órganos y entidades de la Administración del Estado, Autonómica, Provincial y Local que resulten competentes, y específicamente ante las Oficinas de Extranjería y demás órganos competentes en materia de extranjería e inmigración.`);
  m.espacio(4);
  m.parrafo("El presente mandato, que se regirá por los artículos 1709 a 1739 del Código Civil, se confiere al amparo del artículo 5 de la Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas, y del artículo 1 del Estatuto Orgánico de la Profesión de Gestor Administrativo, aprobado por Decreto 424/1963.");
  m.espacio(4);
  m.parrafo("El mandante autoriza al mandatario para que nombre sustituto, en caso de necesidad justificada, a favor de un Gestor Administrativo colegiado ejerciente. El presente mandato mantendrá su vigencia mientras no sea expresamente revocado por el mandante y comunicada fehacientemente su revocación al mandatario. El mandatario al que se le revoque el presente mandato queda obligado a devolverlo al mandante en el momento en que se le comunique la revocación. En caso de fallecimiento, jubilación o cese de negocio del mandatario, o cualquier otra causa que impida la terminación del mandato, el mandante autoriza de forma expresa que el trámite encomendado sea finalizado por el profesional que le sustituya oficialmente.");
  m.espacio(4);
  m.parrafo("El mandante declara bajo su responsabilidad, de conformidad con el artículo 69 de la Ley 39/2015, que cumple con los requisitos establecidos en la normativa vigente para obtener el reconocimiento de un derecho o facultad o para su ejercicio, que dispone de la documentación que así lo acredita, que es auténtica y su contenido enteramente correcto, y que la entrega al mandatario, el cual se responsabiliza de su custodia y se compromete a ponerla a disposición de la Administración cuando le sea requerida, manteniendo el cumplimiento de las anteriores obligaciones durante el período de tiempo inherente al trámite conferido.");
  m.espacio(4);
  m.parrafo(`El mandante declara que conoce y consiente que los datos que suministra pueden incorporarse a ficheros de los que será responsable el mandatario y, en su caso, el Colegio Oficial de Gestores Administrativos correspondiente, con el único objeto de posibilitar la prestación de los servicios profesionales objeto del presente mandato y el cumplimiento de las obligaciones derivadas del trámite encomendado. El mandante tiene derecho de acceso, rectificación, supresión, limitación, oposición y portabilidad de sus datos, dirigiéndose al mandatario en su domicilio profesional, así como a interponer reclamación ante la Agencia Española de Protección de Datos, en los términos de la LO 3/2018 y el Reglamento (UE) 2016/679.`, { size: 8.5, color: GRIS });

  m.espacio(10);
  m.parrafo("En ____________________________, a ______ de ______________________ de 20____");
  m.espacio(6);
  m.parrafo("El mandatario acepta el mandato conferido y se obliga a cumplirlo de conformidad con las instrucciones del mandante, y declara bajo su responsabilidad que los documentos recibidos del mandante han sido verificados en cuanto a la corrección formal de los datos contenidos en los mismos.", { size: 8.5, color: GRIS });
  m.espacio(10);
  m.firmas("EL MANDANTE", "EL MANDATARIO");
  return m.bytes();
}
