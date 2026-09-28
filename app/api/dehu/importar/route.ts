import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { IaNoDisponible } from "@/lib/extraction";
import { esZip, leerZip } from "@/lib/zip-leer";
import { MAX_ENTRADAS_ZIP, MAX_PDF_BYTES } from "@/lib/notificaciones-dehu";
import { BUCKET_ENTRADA, ERROR_MIGRACION_DEHU, importarNotificacion, nombreArchivoSeguro } from "@/lib/notificaciones-dehu-guardar";

export const runtime = "nodejs";
export const maxDuration = 60; // una lectura IA por llamada

// DEHú · paso 2: el archivo está en el bucket de entrada (<despacho>/<uuid>.<ext>).
//  · ZIP  → se abre aquí, cada PDF va a su propia entrada y se devuelve la lista: el
//           navegador pide la lectura de cada uno (de 3 en 3), sin pasarse de tiempo.
//  · PDF o foto → lectura IA + fila con su expediente propuesto; el archivo queda en
//           «documentos» y la entrada se borra (salvo si la IA no estaba: se reintenta).

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const esPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  let body: { path?: string; nombre?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No perteneces a ningún despacho." }, { status: 403 });
  const workspaceId = mem.workspaceId as string;

  // Solo entradas de SU despacho (anti-IDOR): nada de leer lo que subió otro.
  const path = String(body.path ?? "");
  const m = new RegExp(`^${workspaceId}/[0-9a-f-]{36}\\.(pdf|zip|jpg|png|webp)$`).exec(path);
  if (!m) return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
  const nombre = String(body.nombre ?? "").slice(0, 200) || `notificacion.${m[1]}`;
  const borrarEntrada = () => admin.storage.from(BUCKET_ENTRADA).remove([path]).catch(() => {});

  const { data: blob, error } = await admin.storage.from(BUCKET_ENTRADA).download(path);
  if (error || !blob) return NextResponse.json({ error: `${nombre}: no se encuentra el archivo subido.` }, { status: 404 });
  const buffer = Buffer.from(await blob.arrayBuffer());

  if (esZip(buffer)) {
    let entradas: { nombre: string; datos: Buffer }[];
    try { entradas = leerZip(buffer, { maxEntradas: MAX_ENTRADAS_ZIP * 3 }); }
    catch { await borrarEntrada(); return NextResponse.json({ error: `${nombre}: el ZIP está dañado o no se puede abrir.` }, { status: 400 }); }
    const utiles = entradas
      .filter((e) => !/(^|\/)(__MACOSX|\.)/.test(e.nombre))
      .map((e) => {
        const ext = /\.([a-z0-9]{2,5})$/i.exec(e.nombre)?.[1]?.toLowerCase() ?? "";
        const mime = esPdf(e.datos) ? "application/pdf" : MIME[ext] ?? "";
        return { ...e, ext: mime === "application/pdf" ? "pdf" : ext === "jpeg" ? "jpg" : ext, mime };
      })
      .filter((e) => e.mime && e.datos.length <= MAX_PDF_BYTES)
      .slice(0, MAX_ENTRADAS_ZIP);
    const salida: { path: string; nombre: string }[] = [];
    for (const e of utiles) {
      const destino = `${workspaceId}/${crypto.randomUUID()}.${e.ext}`;
      const up = await admin.storage.from(BUCKET_ENTRADA).upload(destino, e.datos, { contentType: e.mime, upsert: false });
      if (!up.error) salida.push({ path: destino, nombre: nombreArchivoSeguro(e.nombre.split("/").pop() ?? e.nombre) });
    }
    await borrarEntrada(); // abierto: sus PDF ya están cada uno en su entrada
    if (!salida.length) return NextResponse.json({ error: `${nombre}: el ZIP no contiene ningún PDF ni imagen.` }, { status: 400 });
    return NextResponse.json({ ok: true, zip: true, entradas: salida, omitidas: entradas.length - salida.length });
  }

  const mime = esPdf(buffer) ? "application/pdf" : MIME[m[1]] ?? "";
  if (!mime || m[1] === "zip") { await borrarEntrada(); return NextResponse.json({ error: `${nombre}: formato no admitido.` }, { status: 400 }); }
  try {
    const r = await importarNotificacion(admin, { workspaceId, buffer, mime, nombre, creadoPorId: user.id, siNoEs: "ignorar" });
    await borrarEntrada();
    return NextResponse.json({ ok: true, nombre, ...r });
  } catch (err) {
    if (err instanceof IaNoDisponible) return NextResponse.json({ error: `${nombre}: ${err.message}`, reintentar: true }, { status: 503 });
    await borrarEntrada();
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg === ERROR_MIGRACION_DEHU ? msg : `${nombre}: ${msg}` }, { status: 500 });
  }
}
