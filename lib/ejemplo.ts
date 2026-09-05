import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { REFERENCIA_EJEMPLO, EMAIL_CLIENTE_EJEMPLO } from "@/lib/ejemplo-marca";

// EXPEDIENTE DE EJEMPLO — el «ajá» de los primeros diez minutos (05/09/2026).
//
// Medido sobre 75 días de altas: entrar cuesta minutos, pero el valor de Aproba está al
// otro lado de un gesto que en una prueba en solitario no existe — que un cliente real
// suba su pasaporte. Cinco de nueve prospectos crearon un expediente el día 1, vieron una
// lista de documentos vacía esperando a alguien, y no volvieron. Este módulo siembra en
// cada despacho nuevo un expediente ya trabajado: cuatro documentos validados por la IA
// con sus datos extraídos, y la ficha completa para que «Generar formularios» funcione
// al primer clic. Los archivos son muestras marcadas «EJEMPLO» (bucket documentos/
// muestra/), copiadas a la carpeta del expediente como cualquier subida real, así que la
// ficha, la descarga y el borrado funcionan por los caminos de siempre.
//
// Idempotente: si el despacho ya tiene su ejemplo, devuelve el existente.

const MUESTRAS = "muestra";
type Admin = SupabaseClient;

const FICHA_JULIA = {
  nombre: "Julia", apellidos: "Mendoza Restrepo", nacionalidad: "Colombia",
  email: EMAIL_CLIENTE_EJEMPLO, telefono: "600112233",
  numeroDocumento: "Y0429317K", pasaporte: "AY0429317", sexo: "M", fechaNacimiento: "1992-03-14",
  lugarNacimiento: "Bogotá", paisNacimiento: "Colombia", estadoCivil: "S",
  via: "Calle Mallorca", numeroVia: "245", piso: "3º 2ª", codigoPostal: "08036",
  municipio: "Barcelona", provincia: "Barcelona", nombrePadre: "Carlos Mendoza", nombreMadre: "Ana Restrepo",
};

const DOCS = [
  { archivo: "pasaporte.jpg", tipo: "PASAPORTE", etiqueta: "Pasaporte", tipoDetectado: "pasaporte", confianza: 0.97,
    datos: [
      { label: "Nombre completo", value: "JULIA MENDOZA RESTREPO" },
      { label: "Nº pasaporte", value: "AY0429317" },
      { label: "Nacionalidad", value: "COLOMBIA" },
      { label: "Fecha de nacimiento", value: "14/03/1992" },
      { label: "Caducidad", value: "02/11/2031" },
    ] },
  { archivo: "tie.jpg", tipo: "TARJETA_RESIDENCIA_TIE", etiqueta: "TIE actual", tipoDetectado: "tarjeta_residencia_tie", confianza: 0.96,
    datos: [
      { label: "NIE", value: "Y0429317K" },
      { label: "Tipo de permiso", value: "Residencia temporal y trabajo" },
      { label: "Válido hasta", value: "18/11/2026" },
      { label: "Lugar de expedición", value: "Barcelona" },
    ] },
  { archivo: "empadronamiento.jpg", tipo: "EMPADRONAMIENTO", etiqueta: "Certificado de empadronamiento", tipoDetectado: "empadronamiento", confianza: 0.93,
    datos: [
      { label: "Dirección", value: "C/ Mallorca 245, 3º 2ª" },
      { label: "Municipio", value: "Barcelona" },
      { label: "Fecha de alta", value: "12/01/2023" },
      { label: "Fecha de expedición", value: "03/09/2026" },
    ] },
  { archivo: "certificado-bancario.jpg", tipo: "CERTIFICADO_BANCARIO", etiqueta: "Justificante de medios económicos", tipoDetectado: "certificado_bancario", confianza: 0.94,
    datos: [
      { label: "Titular", value: "JULIA MENDOZA RESTREPO" },
      { label: "Saldo disponible", value: "9.860,42 €" },
      { label: "Ingresos recurrentes", value: "Nómina 1.640 €/mes (4 meses)" },
      { label: "Fecha de expedición", value: "02/09/2026" },
    ] },
] as const;

const faltaColumna = (msg: string) => /column|schema cache|does not exist/i.test(msg);

export async function buscarEjemplo(admin: Admin, workspaceId: string): Promise<{ id: string; formulariosGenerados: string[] } | null> {
  let r = await admin.from("Expediente").select("id, formulariosGenerados").eq("workspaceId", workspaceId).eq("referencia", REFERENCIA_EJEMPLO).maybeSingle();
  if (r.error && faltaColumna(r.error.message)) r = await admin.from("Expediente").select("id").eq("workspaceId", workspaceId).eq("referencia", REFERENCIA_EJEMPLO).maybeSingle() as typeof r;
  const d = r.data as { id: string; formulariosGenerados?: string[] | null } | null;
  return d ? { id: d.id, formulariosGenerados: d.formulariosGenerados ?? [] } : null;
}

export async function sembrarEjemplo(admin: Admin, workspaceId: string, userId: string | null): Promise<{ id: string; creado: boolean }> {
  const ya = await buscarEjemplo(admin, workspaceId);
  if (ya) return { id: ya.id, creado: false };

  // Sede inicial (la crea el trigger oficina-inicial.sql); sin ella, el ejemplo va sin sede.
  let oficinaId: string | null = null;
  try {
    const { data: ofi } = await admin.from("Oficina").select("id").eq("workspaceId", workspaceId).order("orden", { ascending: true }).limit(1).maybeSingle();
    oficinaId = (ofi as { id: string } | null)?.id ?? null;
  } catch { /* sin multi-oficina */ }
  const ahora = new Date().toISOString();

  // 1) Cliente con la ficha completa — es lo que rellena los EX y la tasa.
  const clienteId = randomUUID();
  const clienteBase: Record<string, unknown> = { id: clienteId, workspaceId, ...FICHA_JULIA, updatedAt: ahora };
  let c = await admin.from("Cliente").insert({ ...clienteBase, ...(oficinaId ? { oficinaId } : {}) });
  if (c.error && faltaColumna(c.error.message)) c = await admin.from("Cliente").insert({ id: clienteId, workspaceId, nombre: FICHA_JULIA.nombre, apellidos: FICHA_JULIA.apellidos, nacionalidad: FICHA_JULIA.nacionalidad, email: FICHA_JULIA.email, updatedAt: ahora });
  if (c.error) throw new Error(`Cliente de ejemplo: ${c.error.message}`);

  // 2) Expediente: renovación de TIE, con el pasaporte como documento extra pedido.
  const id = randomUUID();
  const expBase: Record<string, unknown> = {
    id, workspaceId, clienteId, referencia: REFERENCIA_EJEMPLO, portalToken: randomUUID().replace(/-/g, ""),
    tipo: "RENOVACION", estado: "EN_PREPARACION", asignadoAId: userId, createdAt: ahora, updatedAt: ahora,
  };
  let e = await admin.from("Expediente").insert({ ...expBase, servicioClave: "renovacion_tie", docsExtra: ["Pasaporte"], ...(oficinaId ? { oficinaId } : {}) });
  if (e.error && faltaColumna(e.error.message)) e = await admin.from("Expediente").insert(expBase);
  if (e.error) { await admin.from("Cliente").delete().eq("id", clienteId); throw new Error(`Expediente de ejemplo: ${e.error.message}`); }

  // 3) Documentos: copia de las muestras a la carpeta del expediente + fila VALIDADO + extracción.
  const eventos: Record<string, unknown>[] = [
    { id: randomUUID(), expedienteId: id, tipo: "CREADO", descripcion: "Expediente de ejemplo creado", userId, createdAt: ahora },
  ];
  for (const [i, d] of DOCS.entries()) {
    const storagePath = `${id}/${d.tipo.toLowerCase()}-ejemplo.jpg`;
    let copia = await admin.storage.from("documentos").copy(`${MUESTRAS}/${d.archivo}`, storagePath);
    if (copia.error) {
      // Repli: descargar y subir (algún proyecto sin copy() en el bucket).
      const { data: blob } = await admin.storage.from("documentos").download(`${MUESTRAS}/${d.archivo}`);
      if (blob) copia = await admin.storage.from("documentos").upload(storagePath, Buffer.from(await blob.arrayBuffer()), { contentType: "image/jpeg", upsert: true }) as typeof copia;
    }
    const docId = randomUUID();
    const docBase: Record<string, unknown> = {
      id: docId, expedienteId: id, tipo: d.tipo, estado: "VALIDADO", nombreArchivo: d.archivo,
      storagePath: copia.error ? null : storagePath, mimeType: "image/jpeg", sizeBytes: 120_000,
      uploadedAt: new Date(Date.now() - (DOCS.length - i) * 60_000).toISOString(),
    };
    let w = await admin.from("Documento").insert({ ...docBase, etiqueta: d.etiqueta, clienteId });
    if (w.error && faltaColumna(w.error.message)) w = await admin.from("Documento").insert(docBase);
    if (w.error) continue;
    await admin.from("Extraction").insert({
      id: randomUUID(), documentoId: docId, tipoDetectado: d.tipoDetectado, confianzaGlobal: d.confianza,
      legibilidad: "legible", datos: d.datos, alertas: [], modelo: "ejemplo",
    });
    const t = new Date(Date.now() - (DOCS.length - i) * 60_000);
    eventos.push({ id: randomUUID(), expedienteId: id, tipo: "DOC_SUBIDO", descripcion: `El despacho subió: ${d.etiqueta}`, userId, createdAt: t.toISOString() });
    eventos.push({ id: randomUUID(), expedienteId: id, tipo: "DOC_VALIDADO", descripcion: `IA validó: ${d.etiqueta}`, userId: null, createdAt: new Date(t.getTime() + 20_000).toISOString() });
  }
  await admin.from("ExpedienteEvento").insert(eventos);
  return { id, creado: true };
}

// Borra el ejemplo por los mismos caminos que un expediente real (archivos, extracción,
// documentos, diario) y después su cliente ficticio.
export async function borrarEjemplo(admin: Admin, workspaceId: string): Promise<boolean> {
  const ej = await buscarEjemplo(admin, workspaceId);
  if (!ej) return false;
  const id = ej.id;
  try {
    for (let i = 0; i < 20; i++) {
      const { data: files } = await admin.storage.from("documentos").list(id, { limit: 200 });
      if (!files?.length) break;
      const { error } = await admin.storage.from("documentos").remove(files.map((f) => `${id}/${f.name}`));
      if (error) break;
    }
  } catch { /* sin archivos */ }
  const { data: docs } = await admin.from("Documento").select("id").eq("expedienteId", id);
  const docIds = (docs ?? []).map((d) => d.id as string);
  if (docIds.length) await admin.from("Extraction").delete().in("documentoId", docIds);
  await admin.from("Documento").delete().eq("expedienteId", id);
  await admin.from("ExpedienteEvento").delete().eq("expedienteId", id);
  await admin.from("Factura").update({ expedienteId: null }).eq("expedienteId", id);
  const { error } = await admin.from("Expediente").delete().eq("id", id);
  if (error) throw new Error(error.message);
  // El cliente ficticio: solo si no cuelga nada más de él.
  const { data: cli } = await admin.from("Cliente").select("id").eq("workspaceId", workspaceId).eq("email", EMAIL_CLIENTE_EJEMPLO).maybeSingle();
  if (cli) {
    const { count } = await admin.from("Expediente").select("id", { count: "exact", head: true }).eq("clienteId", cli.id as string);
    if (!count) await admin.from("Cliente").delete().eq("id", cli.id as string);
  }
  return true;
}
