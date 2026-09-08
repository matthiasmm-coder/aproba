import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { clienteEncargoDeEmpresa, type EmpresaFiscal } from "@/lib/empresa";
import { embeberLogo, medidasLogo } from "./pdf-logo";
import type { PDFImage } from "pdf-lib";
import { aplicarDescuento, asignacionValida, descuentoValido, etiquetaDescuento, miembrosDeServicio, type Descuento as DescuentoExp } from "@/lib/multi-servicio";
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
  despacho: { nombre: string; nif: string; domicilio: string; email: string; logo?: string | null };
  mandatario: { nombre: string; dni: string; colegiado: string; colegio: string };
  cliente: {
    nombre: string; apellidos: string; nie: string; pasaporte: string; nacionalidad: string;
    domicilio: string; municipio: string; cp: string; provincia: string;
    telefono: string; email: string;
  };
  // Multi-servicio: principal primero (debe resolver — si no, 409), extras después.
  servicios: { label: string; desc: string; anticipo: number; resto: number; noIncluye: string; precioOculto?: boolean; suplidos: { concepto: string; importe: number }[]; porcentaje?: number; porcentajeSobre?: string }[];
  // Override manual de tasas/suplidos del expediente (si el gestor los ajustó): lista PLANA
  // que sustituye a los suplidos por servicio en §5. null = usar los de cada servicio.
  suplidosOverride: { concepto: string; importe: number }[] | null;
  descuento: DescuentoExp | null; // rebaja de honorarios (nunca tasas)
  // Familiar → la hoja es POR PERSONA y no conoce N: el IMPORTE fijo se muestra como
  // línea informativa. Sin familia (N=1) los plazos se calculan exactos (aplicarDescuento).
  esFamiliar: boolean;
  // Cliente-EMPRESA: el bloque `cliente` es la empresa (contrata y paga) y aquí va la
  // persona extranjera del expediente, que la hoja nombra como beneficiaria.
  trabajador?: string;
  // …y la persona completa, para el MANDATO: el poder de representación lo otorga quien es
  // representado ante la Administración (la persona extranjera), no la empresa que paga.
  persona?: DatosEncargo["cliente"];
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
  .replace(/[\u2013\u2014\u2212]/g, "-")     // – — − (signo menos del descuento: sin él «−150 EUR» quedaría «150 EUR»)
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
  id: string; referencia: string; tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null;
  suplidosOverride?: { concepto: string; importe: number }[] | null; descuento?: unknown; serviciosAsignacion?: unknown; familiaId?: string | null;
  workspaceId: string; oficinaId?: string | null;
  cliente: Record<string, string | null> | null;
};

export async function datosEncargo(admin: SupabaseClient, exp: ExpRow): Promise<DatosEncargo | null> {
  // Workspace: datos del despacho + mandatario. Replis si la migración no está aplicada.
  let wsRes = await admin.from("Workspace")
    .select("nombre, nif, domicilio, domicilioActividad, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, encargoFormasPago")
    .eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace")
    .select("nombre, nif, domicilio, emailFacturacion, logoUrl, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, encargoFormasPago")
    .eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace")
    .select("nombre, nif, domicilio, emailFacturacion, hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio")
    .eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace").select("nombre, nif, domicilio, emailFacturacion").eq("id", exp.workspaceId).maybeSingle();
  if (wsRes.error) wsRes = await admin.from("Workspace").select("nombre, nif").eq("id", exp.workspaceId).maybeSingle();
  const ws = (wsRes.data ?? {}) as Record<string, unknown>;
  if (!ws.nombre) return null;

  // MULTI-OFICINA — hoja de encargo/mandato de la SEDE : si la oficina del expediente
  // (o la que apunta con «usar los mismos que X», un salto) tiene decisión propia
  // (hojaEncargoActiva no null), SU bloque manda: activa + mandatario + formas de pago.
  // Si no, el del despacho. El emisor fiscal ya se resuelve más abajo por su cuenta.
  if (exp.oficinaId) {
    try {
      const { data: of } = await admin.from("Oficina")
        .select("hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, encargoFormasPago, encargoComoOficinaId")
        .eq("id", exp.oficinaId).maybeSingle();
      let bloque = of as Record<string, unknown> | null;
      const ref = (bloque?.encargoComoOficinaId as string | null) ?? null;
      if (ref) {
        const { data: dest } = await admin.from("Oficina")
          .select("hojaEncargoActiva, mandatarioNombre, mandatarioDni, mandatarioColegiado, mandatarioColegio, encargoFormasPago")
          .eq("id", ref).maybeSingle();
        if (dest) bloque = dest as Record<string, unknown>;
      }
      if (bloque && bloque.hojaEncargoActiva !== null && bloque.hojaEncargoActiva !== undefined) {
        ws.hojaEncargoActiva = bloque.hojaEncargoActiva;
        ws.mandatarioNombre = bloque.mandatarioNombre ?? null;
        ws.mandatarioDni = bloque.mandatarioDni ?? null;
        ws.mandatarioColegiado = bloque.mandatarioColegiado ?? null;
        ws.mandatarioColegio = bloque.mandatarioColegio ?? null;
        ws.encargoFormasPago = bloque.encargoFormasPago ?? null;
      }
    } catch { /* migración config-por-oficina ausente → bloque del despacho */ }
  }

  const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null);
  // El PRINCIPAL debe resolver (si no → null → 409, como siempre); los extras que no
  // resuelvan (servicio borrado/desactivado) se omiten sin bloquear el contrato.
  const principal = catalogo.find((x) => x.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
  if (!principal) return null;
  const extras = (Array.isArray(exp.serviciosExtra) ? exp.serviciosExtra : [])
    .filter((clave) => clave && clave !== principal.id)
    .map((clave) => catalogo.find((x) => x.id === clave))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const listaServicios = [principal, ...extras];

  // Medios de pago reales del despacho: IBAN activo + tarjeta si está configurada.
  // Formas de pago PROPIAS del despacho (Ajustes, una por línea): si existen, mandan
  // sobre la lista automática — petición de Juan 06/08, generalizada por workspace.
  const formasPropias = String((ws as { encargoFormasPago?: string | null }).encargoFormasPago ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);

  const medios: string[] = [...formasPropias];
  // La lista automática (IBAN + tarjeta) solo se construye si el despacho NO definió
  // las suyas: mezclar ambas duplicaría la transferencia con dos redacciones.
  if (!formasPropias.length) {
    try {
      const { cuentaParaOficina } = await import("./facturacion-oficina");
      const c = await cuentaParaOficina(admin, exp.workspaceId, exp.oficinaId ?? null);
      if (c?.iban) medios.push(`Transferencia bancaria a la cuenta ${c.iban} (titular: ${c.titular ?? s(ws.nombre)})`);
    } catch { /* tabla sin migrar */ }
    try {
      const { fetchStripeKeyDeWorkspace } = await import("./cobros-tarjeta");
      if (await fetchStripeKeyDeWorkspace(admin, exp.workspaceId, exp.oficinaId ?? null)) medios.push("Pago con tarjeta (enlace de pago seguro online)");
    } catch { /* sin tarjeta */ }
  }
  if (!medios.length) medios.push("Transferencia bancaria (datos facilitados en la factura)");

  // Familia heterogénea: nombres y nº de miembros para el §5 (solo si hay asignación).
  const asignacion = asignacionValida(exp.serviciosAsignacion);
  let miembrosNombres: Record<string, string> = {};
  let nMiembrosFam = 1;
  const conAsignacion = Boolean(exp.familiaId && asignacion);
  if (exp.familiaId) {
    try {
      const { data: fam } = await admin.from("Cliente").select("id, nombre, apellidos").eq("familiaId", exp.familiaId);
      const filas = (fam ?? []) as { id: string; nombre: string | null; apellidos: string | null }[];
      nMiembrosFam = Math.max(1, filas.length);
      miembrosNombres = Object.fromEntries(filas.map((m) => [m.id, `${m.nombre ?? ""} ${m.apellidos ?? ""}`.trim()]));
    } catch { /* sin nombres: se muestra el conteo */ }
  }

  // multi-oficina: si la sede del expediente es otra EMPRESA (razón social/NIF propios),
  // la hoja de encargo debe emitirse a su nombre — el contrato lo firma la empresa real.
  // DOMICILIO: en este documento manda el de ACTIVIDAD (donde se presta el servicio) si el
  // despacho lo ha declarado distinto del fiscal; si no, el fiscal de siempre. La FACTURA no
  // pasa por aquí: sigue llevando el fiscal (petición de Asenjo Global, 08/09/2026).
  let despachoDoc: DatosEncargo["despacho"] = { nombre: s(ws.nombre), nif: s(ws.nif), domicilio: s(ws.domicilioActividad) || s(ws.domicilio), email: s(ws.emailFacturacion), logo: s(ws.logoUrl) || null };
  if (exp.oficinaId) {
    try {
      const { emisorParaOficina } = await import("./facturacion-oficina");
      const em = await emisorParaOficina(admin, exp.workspaceId, exp.oficinaId);
      // El logo sigue a la sede aunque el bloque fiscal no cambie (emisorParaOficina ya lo resuelve).
      despachoDoc = { ...despachoDoc, logo: s(em.logo) || despachoDoc.logo };
      if (em.deOficina) despachoDoc = { ...despachoDoc, nombre: em.nombre, nif: s(em.nif), domicilio: s(em.domicilioActividad) || s(em.domicilio), email: s(em.email) };
    } catch { /* migración fase 6 ausente → datos del despacho */ }
  }

  const c = exp.cliente ?? {};
  // Cliente-EMPRESA (columna opcional, lectura tolerante): la hoja y el presupuesto se
  // emiten a la empresa; la persona del expediente figura como trabajador/beneficiario.
  const empresa = await (async (): Promise<EmpresaFiscal | null> => {
    try {
      const { data: x } = await admin.from("Expediente").select("empresaId").eq("id", exp.id).maybeSingle();
      const eid = (x as { empresaId?: string | null } | null)?.empresaId; if (!eid) return null;
      const { data: em } = await admin.from("Empresa").select("razonSocial, nif, domicilio, codigoPostal, municipio, provincia, contactoNombre, contactoEmail, contactoTelefono").eq("id", eid).maybeSingle();
      return (em as EmpresaFiscal | null) ?? null;
    } catch { return null; }
  })();
  const clientePersona = {
    nombre: s(c.nombre), apellidos: s(c.apellidos), nie: s(c.numeroDocumento), pasaporte: s(c.pasaporte), nacionalidad: s(c.nacionalidad),
    domicilio: [s(c.via), s(c.numeroVia), s(c.piso)].filter(Boolean).join(", "),
    municipio: s(c.municipio), cp: s(c.codigoPostal), provincia: s(c.provincia),
    telefono: s(c.telefono), email: s(c.email),
  };
  const trabajadorTxt = [`${clientePersona.nombre} ${clientePersona.apellidos}`.trim(), clientePersona.nie || clientePersona.pasaporte].filter(Boolean).join(" · ");
  return {
    referencia: exp.referencia,
    fecha: new Date(),
    despacho: despachoDoc,
    mandatario: {
      nombre: s(ws.mandatarioNombre), dni: s(ws.mandatarioDni),
      colegiado: s(ws.mandatarioColegiado), colegio: s(ws.mandatarioColegio),
    },
    cliente: empresa ? clienteEncargoDeEmpresa(empresa) : clientePersona,
    ...(empresa ? { trabajador: trabajadorTxt, persona: clientePersona } : {}),
    servicios: listaServicios.map((sv) => {
      // Familia heterogénea: cada servicio ×SUS miembros asignados, con los nombres en el
      // label — el contrato dice quién lleva qué y los importes son ABSOLUTOS (no por
      // persona), así el §5 cuadra al céntimo con la factura (tarifaAsignada).
      const n = conAsignacion ? miembrosDeServicio(asignacion, sv.id, nMiembrosFam) : 1;
      const nombres = conAsignacion
        ? (asignacion?.[sv.id]?.map((id) => miembrosNombres[id]).filter(Boolean).join(", ") || `toda la familia (${n})`)
        : "";
      const r2n = (x: number) => Math.round(x * n * 100) / 100;
      return {
        label: sv.label + (conAsignacion ? ` (${nombres})` : ""), desc: sv.desc,
        anticipo: conAsignacion ? r2n(sv.anticipo) : sv.anticipo,
        resto: conAsignacion ? r2n(sv.resto) : sv.resto,
        noIncluye: s((sv as { noIncluye?: string }).noIncluye),
        // «Precio a consultar»: el presupuesto no puede imprimir un total (mentiría).
        precioOculto: Boolean((sv as { precioOculto?: boolean }).precioOculto) || undefined,
        suplidos: (sv.suplidos ?? []).filter((x) => x.concepto && x.importe > 0)
          .map((x) => (conAsignacion && n > 1 ? { concepto: `${x.concepto} (×${n})`, importe: r2n(x.importe) } : x)),
        // Honorarios variables (% sobre una base): van al contrato tal cual, el
        // importe se liquida al conocerse la base (no se multiplica por miembros).
        porcentaje: sv.porcentaje && sv.porcentaje > 0 ? sv.porcentaje : undefined,
        porcentajeSobre: (sv.porcentajeSobre ?? "").trim() || undefined,
      };
    }),
    descuento: descuentoValido(exp.descuento),
    esFamiliar: Boolean(exp.familiaId) && !conAsignacion,
    suplidosOverride: Array.isArray(exp.suplidosOverride)
      ? exp.suplidosOverride.filter((x) => x.concepto && Number(x.importe) > 0).map((x) => ({ concepto: x.concepto, importe: Number(x.importe) }))
      : null,
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
  logo: PDFImage | null = null;
  static async crear(logoUrl?: string | null): Promise<Maqueta> {
    const m = new Maqueta();
    m.doc = await PDFDocument.create();
    m.logo = await embeberLogo(m.doc, logoUrl);
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
    // Con logo, el nombre del despacho baja debajo de él (las páginas 2+ no lo llevan:
    // es una cabecera de continuación, no la portada).
    let yNombre = A4[1] - 34;
    if (this.logo) {
      const { ancho, alto } = medidasLogo(this.logo, 140, 34);
      this.page.drawImage(this.logo, { x: MARGEN, y: A4[1] - 22 - alto, width: ancho, height: alto });
      yNombre = A4[1] - 34 - alto;
    }
    this.page.drawText(limpiar(despacho), { x: MARGEN, y: yNombre, size: 11, font: this.bold, color: TINTA });
    const ref = limpiar(`Expediente ${referencia}`);
    this.page.drawText(ref, { x: A4[0] - MARGEN - this.font.widthOfTextAtSize(ref, 8), y: A4[1] - 34, size: 8, font: this.font, color: GRIS });
    this.y = yNombre - 24;
  }
  async bytes(): Promise<Uint8Array> { return this.doc.save(); }
}

// ── 1) HOJA DE ENCARGO ──────────────────────────────────────────────────────

// El PRESUPUESTO es este mismo documento antes de la firma: mismos servicios, mismos
// importes, mismos suplidos — una sola fuente de precios, para que lo presupuestado y lo
// facturado no puedan divergir. Cambia el título, añade validez y quita lo contractual
// (encargo, protección de datos y firmas). Pedido por un despacho el 08/09/2026.
export type ModoEncargo = "encargo" | "presupuesto";
const DIAS_VALIDEZ = 30;

export async function generarHojaEncargo(d: DatosEncargo, modo: ModoEncargo = "encargo"): Promise<Uint8Array> {
  const esPres = modo === "presupuesto";
  const alInicio = esPres ? "Al inicio" : "Al inicio (a la firma)";
  const m = await Maqueta.crear(d.despacho.logo);
  m.cabecera(d.despacho.nombre, d.referencia);
  m.titulo(esPres ? "PRESUPUESTO" : "HOJA DE ENCARGO PROFESIONAL");
  m.parrafo(`Fecha: ${fechaLarga(d.fecha)}`, { size: 8.5, color: GRIS });
  if (esPres) {
    const hasta = new Date(d.fecha.getTime() + DIAS_VALIDEZ * 86400000);
    m.parrafo(`Válido hasta el ${fechaLarga(hasta)}`, { size: 8.5, color: GRIS });
  }
  m.espacio(4);

  m.seccion("1. EL PROFESIONAL");
  m.fila("Despacho", d.despacho.nombre);
  m.fila("NIF/CIF", o(d.despacho.nif));
  m.fila("Domicilio profesional", o(d.despacho.domicilio, 40));
  if (d.mandatario.nombre) m.fila("Profesional responsable", d.mandatario.nombre + (d.mandatario.colegiado ? ` (colegiado n. ${d.mandatario.colegiado})` : ""));
  m.fila("Contacto", o(d.despacho.email, 30));

  m.seccion("2. EL CLIENTE");
  if (d.trabajador !== undefined) {
    // Cliente-empresa: quien contrata es la empresa; la persona extranjera es la beneficiaria.
    m.fila("Empresa", o(d.cliente.nombre, 30));
    m.fila("CIF/NIF", o(d.cliente.nie, 14));
    m.fila("Trabajador / beneficiario", o(d.trabajador, 30));
  } else m.fila("Nombre completo", o(`${d.cliente.nombre} ${d.cliente.apellidos}`.trim(), 30));
  if (d.trabajador !== undefined) { /* documento de la empresa ya impreso arriba */ } else if (d.cliente.nie && d.cliente.pasaporte) {
    m.fila("NIE", d.cliente.nie);
    m.fila("Pasaporte", d.cliente.pasaporte);
  } else {
    // Un solo documento → su etiqueta; ninguno → línea en blanco que acoge ambos.
    const docLabel = d.cliente.pasaporte ? "Pasaporte" : d.cliente.nie ? "NIE" : "NIE / Pasaporte";
    m.fila(docLabel, o(d.cliente.nie || d.cliente.pasaporte));
  }
  if (d.trabajador === undefined) m.fila("Nacionalidad", o(d.cliente.nacionalidad));
  m.fila(d.trabajador !== undefined ? "Domicilio fiscal" : "Domicilio", [d.cliente.domicilio, d.cliente.cp, d.cliente.municipio, d.cliente.provincia].filter(Boolean).join(", ") || o("", 40));
  m.fila("Contacto", [d.cliente.telefono, d.cliente.email].filter(Boolean).join(" / ") || o("", 30));

  m.seccion(esPres ? "3. SERVICIOS PRESUPUESTADOS" : "3. OBJETO DEL ENCARGO — SERVICIOS INCLUIDOS");
  m.parrafo(`${esPres ? "Servicios presupuestados" : "El cliente encarga al profesional la tramitación de"}: ${d.servicios.map((sv) => sv.label).join(" + ")}.`, { bold: true });
  for (const sv of d.servicios) {
    if (sv.desc) m.parrafo(d.servicios.length > 1 ? `${sv.label}: ${sv.desc}` : sv.desc);
  }
  m.parrafo(`${esPres ? "El servicio incluye" : "El encargo incluye"} la preparación y revisión de la documentación, la cumplimentación de los formularios oficiales ${d.servicios.length > 1 ? "de los trámites indicados" : "del trámite"}, su presentación ante el órgano competente y el seguimiento del expediente hasta su resolución.`);

  m.seccion("4. SERVICIOS NO INCLUIDOS");
  // Exclusiones ATRIBUIDAS a su servicio cuando hay varios: un «no incluye X» del
  // principal podría contradecir un extra X incluido en §3 — la atribución acota cada
  // exclusión a su trámite y evita un contrato autocontradictorio.
  const conExclusion = d.servicios.filter((sv) => sv.noIncluye);
  if (conExclusion.length) {
    const vistas = new Set<string>();
    for (const sv of conExclusion) {
      const texto = d.servicios.length > 1 ? `${sv.label}: ${sv.noIncluye}` : sv.noIncluye;
      if (vistas.has(texto)) continue;
      vistas.add(texto);
      m.parrafo(texto);
    }
  } else {
    m.parrafo(`Cualquier actuación no descrita en el apartado anterior. En particular, recursos administrativos o judiciales, trámites distintos ${d.servicios.length > 1 ? "de los indicados" : "del indicado"} y desplazamientos, que en su caso serán objeto de encargo y presupuesto aparte.`);
  }

  m.seccion("5. HONORARIOS");
  const anticipoTotal = d.servicios.reduce((a, sv) => a + sv.anticipo, 0);
  const restoTotal = d.servicios.reduce((a, sv) => a + sv.resto, 0);
  // Si algún servicio es «precio a consultar», un total sería falso: se listan los
  // servicios, el que no tiene precio dice «A consultar» y NO se imprime ningún total
  // (misma regla que el carrito del portal del cliente).
  const hayOculto = esPres && d.servicios.some((sv) => sv.precioOculto);
  if (hayOculto) {
    for (const sv of d.servicios) {
      m.fila(sv.label, sv.precioOculto ? "A consultar" : `${eur(sv.anticipo + sv.resto)} + IVA (21%)`);
    }
    m.parrafo("Alguno de los servicios tiene precio a consultar: el importe total se confirmará antes de iniciar el trámite.", { size: 8.5, color: GRIS });
  } else if (anticipoTotal > 0 || restoTotal > 0) {
    // Desglose por servicio cuando hay más de uno (el contrato debe cuadrar con la factura).
    if (d.servicios.length > 1) {
      for (const sv of d.servicios) {
        if (sv.anticipo > 0 || sv.resto > 0) m.fila(sv.label, `${eur(sv.anticipo + sv.resto)} + IVA (21%)`);
      }
    }
    // Descuento del expediente. Sin familia (N=1): plazos EXACTOS con el mismo helper que
    // la factura (aplicarDescuento) — lo que el cliente firma coincide al céntimo con lo
    // que se le facturará. Familiar: la hoja es POR PERSONA y no conoce N → PORCENTAJE se
    // aplica exacto por persona; IMPORTE fijo (definido sobre el total del expediente) se
    // muestra como línea informativa sin repartir.
    const dHoja = d.descuento;
    if (dHoja && !d.esFamiliar) {
      const reb = aplicarDescuento({ anticipo: anticipoTotal, resto: restoTotal }, 1, dHoja);
      m.fila("Total honorarios", `${eur(anticipoTotal + restoTotal)} + IVA (21%)`);
      m.fila(`Descuento${dHoja.motivo ? ` (${dHoja.motivo})` : ""}`, `${etiquetaDescuento(dHoja)}`);
      if (reb.anticipo > 0) m.fila(alInicio, `${eur(reb.anticipo)} + IVA (21%)`);
      if (reb.resto > 0) m.fila("Al finalizar el trámite", `${eur(reb.resto)} + IVA (21%)`);
      m.fila("Total con descuento", `${eur(Math.round((reb.anticipo + reb.resto) * 100) / 100)} + IVA (21%)`);
    } else if (dHoja?.tipo === "PORCENTAJE") {
      const f = 1 - dHoja.valor / 100;
      const antReb = Math.round(anticipoTotal * f * 100) / 100;
      const resReb = Math.round(restoTotal * f * 100) / 100;
      m.fila("Total honorarios", `${eur(anticipoTotal + restoTotal)} + IVA (21%)`);
      m.fila(`Descuento${dHoja.motivo ? ` (${dHoja.motivo})` : ""}`, `${etiquetaDescuento(dHoja)}`);
      if (antReb > 0) m.fila(alInicio, `${eur(antReb)} + IVA (21%)`);
      if (resReb > 0) m.fila("Al finalizar el trámite", `${eur(resReb)} + IVA (21%)`);
      m.fila("Total con descuento", `${eur(antReb + resReb)} + IVA (21%)`);
    } else {
      if (anticipoTotal > 0) m.fila(alInicio, `${eur(anticipoTotal)} + IVA (21%)`);
      if (restoTotal > 0) m.fila("Al finalizar el trámite", `${eur(restoTotal)} + IVA (21%)`);
      m.fila("Total honorarios", `${eur(anticipoTotal + restoTotal)} + IVA (21%)`);
      if (dHoja?.tipo === "IMPORTE") m.fila(`Descuento${dHoja.motivo ? ` (${dHoja.motivo})` : ""}`, `−${eur(dHoja.valor)} (sobre el total del expediente)`);
    }
  } else if (!d.servicios.some((sv) => sv.porcentaje)) {
    m.fila("Honorarios", "Según presupuesto");
  }
  // Honorarios variables (% sobre una base, p. ej. el precio de una compraventa):
  // el contrato deja constancia del porcentaje y de su base; el importe se
  // liquidará en factura al conocerse la base.
  const conPct = d.servicios.filter((sv) => sv.porcentaje);
  if (conPct.length) {
    for (const sv of conPct) {
      m.fila(
        d.servicios.length > 1 ? `Honorarios variables (${sv.label})` : "Honorarios variables",
        `${String(sv.porcentaje).replace(".", ",")} % sobre ${sv.porcentajeSobre ?? "la base pactada"} + IVA (21%)`,
      );
    }
    m.parrafo("Los honorarios variables se liquidarán al conocerse la base sobre la que se aplican, en la factura correspondiente.", { size: 8.5, color: GRIS });
  }
  // Tasas y suplidos previstos (SIN IVA): presupuesto ajustado — el contrato enseña lo que
  // la primera factura repercutirá. Si el gestor los ajustó para este expediente (override),
  // se usa esa lista PLANA; si no, los de cada servicio (atribuidos si hay varios).
  const suplidosContrato = d.suplidosOverride
    ? d.suplidosOverride
    : d.servicios.flatMap((sv) =>
        sv.suplidos.map((x) => ({ concepto: d.servicios.length > 1 ? `${sv.label}: ${x.concepto}` : x.concepto, importe: x.importe })),
      );
  if (suplidosContrato.length) {
    const totalSuplidos = suplidosContrato.reduce((a, x) => a + x.importe, 0);
    m.parrafo("Tasas y suplidos previstos (sin IVA, se repercuten por su importe exacto):", { size: 9 });
    for (const x of suplidosContrato) m.fila(x.concepto, eur(x.importe));
    m.fila("Total tasas y suplidos", eur(totalSuplidos));
  }
  m.parrafo(suplidosContrato.length
    ? "Las tasas y suplidos indicados son una previsión: se repercutirán al cliente por su importe exacto en la factura correspondiente, sin IVA y separados de los honorarios."
    : "Los honorarios no incluyen las tasas oficiales ni otros suplidos, que se repercutirán al cliente por su importe exacto en la factura correspondiente.", { size: 8.5, color: GRIS });

  m.seccion("6. FORMA Y MEDIOS DE PAGO");
  m.parrafo(
    anticipoTotal > 0 && restoTotal > 0
      ? "El pago se realiza en dos plazos: el anticipo al inicio del encargo y el resto a la finalización del trámite, previa emisión de la factura correspondiente."
      : anticipoTotal > 0
        ? "El pago se realiza en un único plazo al inicio del encargo, previa emisión de la factura correspondiente."
        : restoTotal > 0
          ? "El pago se realiza a la finalización del trámite, previa emisión de la factura correspondiente."
          : "El pago se acuerda según el presupuesto aceptado, previa emisión de la factura correspondiente.",
  );
  for (const medio of d.medios) m.parrafo(`- ${medio}`, { sangria: 8 });

  if (esPres) {
    m.espacio(8);
    m.parrafo("Este presupuesto es informativo y no supone encargo. Al aceptarlo se emite la hoja de encargo profesional, que recoge estas mismas condiciones.", { size: 9 });
    return m.bytes();
  }

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
  const m = await Maqueta.crear(d.despacho.logo);
  m.cabecera(d.despacho.nombre, d.referencia);
  m.titulo("MANDATO CON REPRESENTACIÓN");
  m.espacio(2);

  // Cliente-empresa: el mandante sigue siendo la PERSONA (es a ella a quien se representa).
  const pm = d.persona ?? d.cliente;
  const mandante = `${pm.nombre} ${pm.apellidos}`.trim();
  const notif = [pm.domicilio, pm.cp ? `CP ${pm.cp}` : "", pm.municipio, pm.provincia].filter(Boolean).join(", ");

  m.parrafo(`D./Dna. ${o(mandante, 40)}, con DNI/NIE/Pasaporte ${o(pm.nie || pm.pasaporte, 14)}, y domicilio a efectos de notificaciones en ${o(notif, 50)}, en concepto de MANDANTE, dice y otorga:`);
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
