import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// FIRMA (Y SELLO) DEL PROFESIONAL — Luis (Asenjo), 02/10/2026: «insertar esta firma en AGC.
// Y en Marta». Una imagen por ámbito de la hoja de encargo: la del despacho y la de cada sede
// con bloque propio (lib/encargo resuelve cuál manda). Se imprime sobre la línea del
// profesional: hoja de encargo («EL PROFESIONAL»), presupuesto («POR EL DESPACHO») y mandato
// de Aproba («EL MANDATARIO»).
//
// Bucket PRIVADO «documentos», en una carpeta que no es la de ningún despacho: solo el
// servidor (service role) la lee y la escribe. Una firma manuscrita en un enlace público se
// copiaría; aquí solo sale dentro de los PDF de ese despacho.
export const BUCKET_FIRMAS = "documentos";
export const MAX_FIRMA_SUBIDA = 5 * 1024 * 1024; // lo que se acepta del navegador
const MAX_ANCHO = 1200, MAX_ALTO = 600;            // lo que se guarda: sobra para 200 pt de ancho

// Un NOMBRE NUEVO por versión (`<ámbito>-<ms>.png`), nunca el mismo: la descarga de Storage
// pasa por una caché que seguía sirviendo una firma ya borrada o cambiada (visto el
// 02/10/2026: borrada, la lista vacía, y la descarga devolvía aún la imagen). La lista no
// tiene caché: la versión vigente es la más reciente que aparece en ella.
const carpeta = (workspaceId: string) => `firmas/${workspaceId}`;
const prefijo = (oficinaId: string | null) => `${oficinaId ?? "despacho"}-`;

async function versiones(admin: SupabaseClient, workspaceId: string, oficinaId: string | null): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET_FIRMAS).list(carpeta(workspaceId), { limit: 1000 });
  if (error || !data) return [];
  const p = prefijo(oficinaId);
  return data.map((o) => o.name).filter((n) => n.startsWith(p) && /^\d{13}\.png$/.test(n.slice(p.length)))
    .sort().reverse(); // la más reciente primero (milisegundos de 13 cifras)
}

// null si no hay firma (o si algo falla: el documento sale sin ella, nunca un 500).
export async function leerFirma(admin: SupabaseClient, workspaceId: string, oficinaId: string | null): Promise<Uint8Array | null> {
  try {
    const [vigente] = await versiones(admin, workspaceId, oficinaId);
    if (!vigente) return null;
    const { data, error } = await admin.storage.from(BUCKET_FIRMAS).download(`${carpeta(workspaceId)}/${vigente}`);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

// Cualquier PNG/JPEG/WebP → PNG sin los márgenes vacíos (que encogerían la firma en su
// recuadro), como mucho 1200×600. Si el recorte falla (imagen de un solo color), sin él.
export async function normalizarFirma(bytes: Uint8Array): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  const base = () => sharp(Buffer.from(bytes)).rotate();
  const encajar = (img: ReturnType<typeof base>) => img.resize({ width: MAX_ANCHO, height: MAX_ALTO, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  try {
    return new Uint8Array(await encajar(base().trim()));
  } catch {
    return new Uint8Array(await encajar(base()));
  }
}

export async function guardarFirma(admin: SupabaseClient, workspaceId: string, oficinaId: string | null, png: Uint8Array): Promise<void> {
  const anteriores = await versiones(admin, workspaceId, oficinaId);
  const { error } = await admin.storage.from(BUCKET_FIRMAS)
    .upload(`${carpeta(workspaceId)}/${prefijo(oficinaId)}${Date.now()}.png`, png, { contentType: "image/png", upsert: false, cacheControl: "0" });
  if (error) throw new Error(error.message);
  // Las versiones anteriores sobran (si no se pudieran borrar, la nueva ya manda por fecha).
  if (anteriores.length) await admin.storage.from(BUCKET_FIRMAS).remove(anteriores.map((n) => `${carpeta(workspaceId)}/${n}`)).catch(() => {});
}

export async function borrarFirma(admin: SupabaseClient, workspaceId: string, oficinaId: string | null): Promise<void> {
  const todas = await versiones(admin, workspaceId, oficinaId);
  if (!todas.length) return;
  const { error } = await admin.storage.from(BUCKET_FIRMAS).remove(todas.map((n) => `${carpeta(workspaceId)}/${n}`));
  if (error) throw new Error(error.message);
}
