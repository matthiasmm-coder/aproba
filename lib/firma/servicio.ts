import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { datosEncargo, generarHojaEncargo, personaEncargo, type CajaFirma, type DatosEncargo } from "@/lib/encargo";
import { mandatoParaFirma } from "@/lib/mandato";
import { sellarDocumento } from "@/lib/firma/pdf";
import {
  PIEZA_FIRMADA, SOBRE_DIAS, TITULO_DOC, nuevoToken, sha256Hex,
  type DocFirmable, type DocSobre, type EstadoSobre, type EvidenciaFirma, type MetodoFirma,
} from "@/lib/firma/sobre";

// ORQUESTACIÓN de la firma en línea (lib/firma/sobre.ts): preparar los documentos de un
// expediente (el PDF exacto, guardado, con su huella y las casillas del firmante), crear el
// sobre, y al firmar sellar cada PDF, guardarlo como pieza VALIDADA del expediente y dejar
// constancia. Todo con service_role: las rutas comprueban antes quién llama (sesión + RLS
// para el despacho, enlace secreto para el cliente).

const BUCKET = "documentos";
const uuid = () => crypto.randomUUID();
type ExpEncargo = NonNullable<Parameters<typeof datosEncargo>[1]>;

export type SobreFila = {
  id: string; workspaceId: string; expedienteId: string; clienteId: string | null; token: string;
  estado: EstadoSobre; documentos: DocSobre[];
  firmanteNombre: string | null; firmanteEmail: string | null; firmanteDocumento: string | null; idioma: string | null;
  otpHash: string | null; otpExpira: string | null; otpIntentos: number; otpEnviados: number;
  evidencias: EvidenciaFirma[]; creadoPor: string | null;
  enviadoAt: string | null; abiertoAt: string | null; firmadoAt: string | null; anuladoAt: string | null;
  recordatorios: number; ultimoRecordatorio: string | null; expiraAt: string | null; createdAt: string; updatedAt: string;
};

export class ErrorFirma extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function cargarExpediente(admin: SupabaseClient, expedienteId: string): Promise<ExpEncargo | null> {
  let r = await admin.from("Expediente")
    .select("id, referencia, tipo, servicioClave, serviciosExtra, suplidosOverride, descuento, serviciosAsignacion, familiaId, workspaceId, oficinaId, cliente:Cliente(*)")
    .eq("id", expedienteId).maybeSingle();
  if (r.error) r = await admin.from("Expediente")
    .select("id, referencia, tipo, servicioClave, workspaceId, cliente:Cliente(*)")
    .eq("id", expedienteId).maybeSingle() as typeof r;
  return (r.data as unknown as ExpEncargo | null) ?? null;
}

// Quién firma cada documento. Cliente-EMPRESA: la hoja y el presupuesto los firma la empresa
// (es quien contrata, por su persona de contacto); el mandato, la persona representada.
export type Firmante = { clave: string; nombre: string; email: string; documento: string | null; clienteId: string | null; idioma: string };
export function firmanteDe(doc: DocFirmable, exp: ExpEncargo, datos: DatosEncargo, emailForzado?: string | null): Firmante | null {
  const c = exp.cliente as Record<string, string | null> | null;
  const persona = c ? {
    clave: `cliente:${c.id ?? ""}`,
    nombre: `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim(),
    email: (emailForzado || c.email || "").trim(),
    documento: (c.numeroDocumento || c.pasaporte || "").trim() || null,
    clienteId: c.id ?? null,
    idioma: (c.idioma ?? "es") || "es",
  } : null;
  const esEmpresa = datos.trabajador !== undefined;
  if (doc === "mandato") return persona; // la persona representada (sin titular: no hay un único mandante)
  if (!esEmpresa) return persona;
  // La empresa no tiene «persona» en la ficha: la página de firma pide el nombre de quien
  // firma por ella; aquí queda la razón social.
  const e = datos.cliente as { nombre?: string; email?: string };
  return {
    clave: "empresa",
    nombre: (e.nombre || "").trim(),
    email: (emailForzado || e.email || "").trim(),
    documento: null, clienteId: null, idioma: "es",
  };
}

// El PDF que se firma y las casillas del firmante.
async function documentoParaFirma(admin: SupabaseClient, exp: ExpEncargo, datos: DatosEncargo, doc: DocFirmable): Promise<{ bytes: Uint8Array; cajas: CajaFirma[] }> {
  if (doc === "mandato") {
    const persona = exp.cliente ? personaEncargo(exp.cliente as Record<string, string | null>) : undefined;
    const m = await mandatoParaFirma(admin, exp, datos, persona);
    return { bytes: m.bytes, cajas: m.cajas };
  }
  const salida = { cajas: [] as CajaFirma[] };
  const bytes = await generarHojaEncargo(datos, doc === "presupuesto" ? "presupuesto" : "encargo", { aceptacion: doc === "presupuesto", salida });
  const propias = salida.cajas.filter((c) => (doc === "presupuesto" ? c.etiqueta === "ACEPTADO POR EL CLIENTE" : /^EL CLIENTE/.test(c.etiqueta)));
  return { bytes, cajas: propias };
}

export async function evidencia(admin: SupabaseClient, sobre: Pick<SobreFila, "id" | "evidencias">, e: Omit<EvidenciaFirma, "en">, extra: Record<string, unknown> = {}) {
  const evidencias = [...(sobre.evidencias ?? []), { ...e, en: new Date().toISOString() }];
  await admin.from("FirmaSobre").update({ evidencias, updatedAt: new Date().toISOString(), ...extra }).eq("id", sobre.id);
  return evidencias;
}

// Prepara los sobres de un expediente: uno por FIRMANTE (cliente-empresa: la empresa y la
// persona). Un sobre pendiente anterior que lleve alguno de estos documentos se anula (el
// nuevo lo sustituye: si el despacho cambió algo, el cliente no firmará una versión vieja).
export async function crearSobres(admin: SupabaseClient, o: {
  expedienteId: string; docs: DocFirmable[]; email?: string | null; creadoPor: string | null;
}): Promise<SobreFila[]> {
  const exp = await cargarExpediente(admin, o.expedienteId);
  if (!exp) throw new ErrorFirma("Expediente no encontrado.", 404);
  const datos = await datosEncargo(admin, exp);
  if (!datos) throw new ErrorFirma("Configura primero el servicio del expediente.", 409);

  const grupos = new Map<string, { firmante: Firmante; docs: DocFirmable[] }>();
  for (const doc of o.docs) {
    const f = firmanteDe(doc, exp, datos, o.email);
    if (!f) throw new ErrorFirma(doc === "mandato" ? "En un expediente de empresa, el mandato de cada trabajador se firma desde su ficha." : "El expediente no tiene a quién pedir la firma.", 409);
    if (!f.email) throw new ErrorFirma(`Falta el email de ${f.nombre || "quien firma"}: añádelo para enviarle el código de firma.`, 400);
    if (!f.nombre) throw new ErrorFirma("Falta el nombre de quien firma.", 400);
    const g = grupos.get(f.clave) ?? { firmante: f, docs: [] };
    g.docs.push(doc);
    grupos.set(f.clave, g);
  }

  const ahora = new Date();
  const creados: SobreFila[] = [];
  for (const { firmante, docs } of grupos.values()) {
    const sobreId = uuid();
    const documentos: DocSobre[] = [];
    for (const doc of docs) {
      const { bytes, cajas } = await documentoParaFirma(admin, exp, datos, doc);
      const path = `firma-electronica/${exp.id}/${sobreId}/${doc}.pdf`;
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw new ErrorFirma(`No se pudo guardar el documento: ${error.message}`, 500);
      documentos.push({ doc, titulo: TITULO_DOC[doc], path, hash: sha256Hex(bytes), paginas: (await PDFDocument.load(bytes)).getPageCount(), cajas });
    }
    // Sustituye a los pendientes de ESTE firmante que lleven alguno de estos documentos.
    const { data: previos } = await admin.from("FirmaSobre").select("id, documentos, evidencias, firmanteEmail")
      .eq("expedienteId", exp.id).eq("estado", "PENDIENTE");
    for (const p of (previos ?? []) as Pick<SobreFila, "id" | "documentos" | "evidencias" | "firmanteEmail">[]) {
      if (!(p.documentos ?? []).some((d) => docs.includes(d.doc))) continue;
      await evidencia(admin, p, { evento: "anulado", detalle: "Sustituido por un envío nuevo" }, { estado: "ANULADO", anuladoAt: ahora.toISOString(), otpHash: null });
    }
    const fila = {
      id: sobreId, workspaceId: exp.workspaceId, expedienteId: exp.id, clienteId: firmante.clienteId,
      token: nuevoToken(), estado: "PENDIENTE", documentos,
      firmanteNombre: firmante.nombre, firmanteEmail: firmante.email, firmanteDocumento: firmante.documento, idioma: firmante.idioma,
      evidencias: [{ evento: "creado", en: ahora.toISOString() }],
      creadoPor: o.creadoPor, expiraAt: new Date(ahora.getTime() + SOBRE_DIAS * 86_400_000).toISOString(),
      updatedAt: ahora.toISOString(),
    };
    const { data, error } = await admin.from("FirmaSobre").insert(fila).select("*").single();
    if (error) throw new ErrorFirma(/FirmaSobre|relation|schema cache/i.test(error.message) ? "La firma electrónica aún no está activada (falta la migración)." : error.message, 500);
    creados.push(data as SobreFila);
  }
  return creados;
}

export async function sobrePorToken(admin: SupabaseClient, token: string): Promise<SobreFila | null> {
  if (!token || token.length < 20 || token.length > 64) return null;
  const { data } = await admin.from("FirmaSobre").select("*").eq("token", token).maybeSingle();
  return (data as SobreFila | null) ?? null;
}

export async function descargarOriginal(admin: SupabaseClient, d: DocSobre): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(d.path);
  if (error || !data) throw new ErrorFirma("No se encontró el documento.", 404);
  return new Uint8Array(await data.arrayBuffer());
}

// LA FIRMA: sella cada documento, lo guarda como pieza VALIDADA del expediente (la misma
// casilla que si el cliente lo hubiera subido firmado a mano), cierra el sobre y deja el rastro.
export async function firmarSobre(admin: SupabaseClient, sobre: SobreFila, o: {
  firmaPng: Uint8Array; metodo: MetodoFirma; nombre: string; ip: string | null; dispositivo: string;
}): Promise<SobreFila> {
  const ahora = new Date().toISOString();
  const { data: exp } = await admin.from("Expediente").select("id, referencia, workspaceId, Workspace(nombre)").eq("id", sobre.expedienteId).maybeSingle();
  const e = exp as { id: string; referencia: string; Workspace: { nombre: string } | { nombre: string }[] | null } | null;
  if (!e) throw new ErrorFirma("Expediente no encontrado.", 404);
  const despacho = (Array.isArray(e.Workspace) ? e.Workspace[0] : e.Workspace)?.nombre ?? "";
  const evidencias: EvidenciaFirma[] = [...(sobre.evidencias ?? []), { evento: "firmado", en: ahora, ip: o.ip, dispositivo: o.dispositivo, detalle: o.metodo === "dibujada" ? "Firma trazada en pantalla" : "Nombre escrito como firma" }];

  const documentos: DocSobre[] = [];
  for (const d of sobre.documentos) {
    const original = await descargarOriginal(admin, d);
    if (sha256Hex(original) !== d.hash) throw new ErrorFirma("El documento cambió desde que se preparó: pide al despacho que lo vuelva a enviar.", 409);
    const firmado = await sellarDocumento(original, d.cajas, o.firmaPng, {
      sobreId: sobre.id, titulo: d.titulo, despacho, referencia: e.referencia, hashOriginal: d.hash,
      firmante: { nombre: o.nombre, documento: sobre.firmanteDocumento, email: sobre.firmanteEmail ?? "" },
      metodo: o.metodo, firmadoEn: ahora, evidencias,
    });
    const pieza = PIEZA_FIRMADA[d.doc];
    const storagePath = `${e.id}/${pieza.tipo.toLowerCase()}-firmado-${Date.now()}.pdf`;
    const { error: eUp } = await admin.storage.from(BUCKET).upload(storagePath, firmado, { contentType: "application/pdf", upsert: true });
    if (eUp) throw new ErrorFirma(`No se pudo guardar el documento firmado: ${eUp.message}`, 500);
    // La pieza del expediente: se reutiliza la de esa casilla (p. ej. una versión firmada a
    // mano subida antes) o se crea.
    const { data: previa } = await admin.from("Documento").select("id, storagePath").eq("expedienteId", e.id).eq("tipo", pieza.tipo).eq("etiqueta", pieza.etiqueta).limit(1).maybeSingle();
    const docId = (previa as { id: string } | null)?.id ?? uuid();
    const fila = {
      expedienteId: e.id, tipo: pieza.tipo, etiqueta: pieza.etiqueta,
      nombreArchivo: `${d.titulo} firmado - ${e.referencia}.pdf`, storagePath, mimeType: "application/pdf",
      sizeBytes: firmado.length, uploadedAt: ahora, estado: "VALIDADO",
    };
    const w = previa ? await admin.from("Documento").update(fila).eq("id", docId) : await admin.from("Documento").insert({ id: docId, ...fila });
    if (w.error) throw new ErrorFirma(`No se pudo registrar el documento firmado: ${w.error.message}`, 500);
    const anterior = (previa as { storagePath?: string | null } | null)?.storagePath;
    if (anterior && anterior !== storagePath) await admin.storage.from(BUCKET).remove([anterior]);
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: e.id, tipo: "DOC_VALIDADO", descripcion: `✍️ Firmado en línea por ${o.nombre}: ${d.titulo} (código verificado en ${sobre.firmanteEmail})` });
    documentos.push({ ...d, firmadoPath: storagePath, firmadoHash: sha256Hex(firmado), documentoId: docId });
  }

  const { data, error } = await admin.from("FirmaSobre").update({
    estado: "FIRMADO", firmadoAt: ahora, documentos, evidencias, firmanteNombre: o.nombre,
    otpHash: null, otpExpira: null, updatedAt: ahora,
  }).eq("id", sobre.id).eq("estado", "PENDIENTE").select("*").maybeSingle();
  if (error) throw new ErrorFirma(error.message, 500);
  if (!data) throw new ErrorFirma("Este envío ya no está pendiente de firma.", 409);
  return data as SobreFila;
}
