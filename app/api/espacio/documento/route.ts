import { NextResponse, after } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { fichaDesdeCampos } from "@/lib/ficha-extraccion";
import { completarFichaDesdeExtraccion } from "@/lib/ficha-sync";
import { clasificarDeteccion } from "@/lib/tramites";
import { sembrarVencimiento, fechaCaducidadISO, tipoVencimientoDeDocumento } from "@/lib/vencimientos";
import { avisarDocumentoRecibido } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";
export const maxDuration = 60; // Vision

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS_OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = () => crypto.randomUUID();

// ESPACIO DEL CLIENTE — sube el documento renovado que le pidió su gestoría (11/09/2026).
// Autorización = espacioToken + el vencimiento SOLICITADO debe ser suyo. El documento va
// a su ficha (DocumentoCliente); si la IA reconoce el tipo pedido con una caducidad
// posterior, el vencimiento se actualiza solo (sembrarVencimiento → PENDIENTE, fecha
// nueva, recibidoAt) y el nº de pasaporte nuevo sustituye al antiguo en la ficha.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  const vencimientoId = String(form?.get("vencimientoId") ?? "").trim();
  const file = form?.get("file");
  if (!token || token.length < 8 || !vencimientoId || !(file instanceof File)) return NextResponse.json({ error: "token, vencimientoId y file requeridos" }, { status: 400 });
  const ext = TIPOS_OK[file.type];
  if (!ext) return NextResponse.json({ error: "Formato no soportado (JPG, PNG, WebP o PDF)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: cli } = await admin.from("Cliente").select("id, workspaceId, nombre, apellidos, pasaporte").eq("espacioToken", token).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const { data: venc } = await admin.from("Vencimiento").select("id, tipo, fecha, estado").eq("id", vencimientoId).eq("clienteId", cli.id).maybeSingle();
  if (!venc) return NextResponse.json({ error: "Petición no encontrada." }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const nombreArchivo = (file.name || `documento.${ext}`).replace(/[^\w.\-() ]+/g, "_").slice(0, 120);

  // Lectura IA (mejor esfuerzo: sin IA el documento se guarda igual como «Otro documento»).
  let det: Awaited<ReturnType<typeof extraerDocumento>> | null = null;
  try { det = await extraerDocumento(buffer, file.type); } catch (e) { console.error("[espacio documento] IA:", e instanceof Error ? e.message : e); }
  const tipoDoc = det ? clasificarDeteccion(det.tipoDetectado, []).label : "Otro documento";

  const docId = uuid();
  const storagePath = `clientes/${cli.id}/${docId}.${ext}`;
  const up = await admin.storage.from("documentos").upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: `Storage: ${up.error.message}` }, { status: 500 });
  const ins = await admin.from("DocumentoCliente").insert({ id: docId, clienteId: cli.id, workspaceId: cli.workspaceId, tipo: tipoDoc, nombreArchivo, storagePath, mimeType: file.type, sizeBytes: buffer.length });
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

  // ¿Es el documento pedido, renovado (caducidad posterior a la vigilada)?
  const fechaNueva = det?.estado === "VALIDADO" ? fechaCaducidadISO(det.fechaCaducidad) : null;
  const esElPedido = Boolean(det) && tipoVencimientoDeDocumento(det!.tipoDetectado) === String(venc.tipo);
  const posterior = Boolean(fechaNueva) && new Date(fechaNueva!).getTime() > new Date(venc.fecha as string).getTime();
  const reconocido = esElPedido && posterior;
  if (det) {
    // Huecos de la ficha (nunca pisa lo escrito a mano)…
    try { await completarFichaDesdeExtraccion(admin, cli.id, det); } catch { /* mejor esfuerzo */ }
    // …salvo el nº de pasaporte cuando ES el pasaporte nuevo: el antiguo ya no vale.
    if (reconocido && String(venc.tipo) === "PASAPORTE") {
      const nuevoNum = fichaDesdeCampos(det.campos).pasaporte?.trim();
      if (nuevoNum && nuevoNum !== cli.pasaporte) await admin.from("Cliente").update({ pasaporte: nuevoNum, updatedAt: new Date().toISOString() }).eq("id", cli.id);
    }
  }
  if (reconocido) {
    await sembrarVencimiento(admin, { workspaceId: cli.workspaceId, clienteId: cli.id, fecha: fechaNueva!, tipo: String(venc.tipo), fuente: "REAL" });
  }
  const clienteNombre = `${cli.nombre ?? ""} ${cli.apellidos ?? ""}`.trim() || "Un cliente";
  const baseUrl = baseUrlFromRequest(req);
  after(async () => { await avisarDocumentoRecibido(admin, { workspaceId: cli.workspaceId, clienteId: cli.id, clienteNombre, tipoVencimiento: String(venc.tipo), reconocido, fechaNueva: reconocido ? fechaNueva : null, baseUrl }); });
  return NextResponse.json({ ok: true, reconocido, fechaNueva: reconocido ? fechaNueva : null, tipo: tipoDoc });
}
