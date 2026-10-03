import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { baseUrlFromRequest } from "@/lib/base-url";
import { emailDeRespuesta } from "@/lib/notificaciones";
import { ErrorFirma, evidencia, firmarSobre, sobrePorToken } from "@/lib/firma/servicio";
import { secretoFirma } from "@/lib/firma/publico";
import { avisarFirmaAlDespacho, enviarCopiaFirmada } from "@/lib/firma/emails";
import { OTP_MAX_INTENTOS, codigoCoincide, ipDe, pngDeDataUrl, resumenDispositivo, type MetodoFirma } from "@/lib/firma/sobre";

// LA FIRMA: código de un solo uso + imagen de la firma + nombre + aceptación → cada documento
// sellado y guardado en el expediente, copia al firmante, aviso al despacho.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: { codigo?: unknown; firma?: unknown; metodo?: unknown; nombre?: unknown; acepta?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "peticion" }, { status: 400 }); }
  const nombre = typeof body.nombre === "string" ? body.nombre.replace(/\s+/g, " ").trim() : "";
  const metodo: MetodoFirma = body.metodo === "escrita" ? "escrita" : "dibujada";
  const firmaPng = pngDeDataUrl(body.firma);
  if (body.acepta !== true) return NextResponse.json({ error: "acepta" }, { status: 400 });
  if (nombre.length < 3 || nombre.length > 120) return NextResponse.json({ error: "nombre" }, { status: 400 });
  if (!firmaPng) return NextResponse.json({ error: "firma" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const s = await sobrePorToken(admin, token);
  if (!s) return NextResponse.json({ error: "enlace" }, { status: 404 });
  if (s.estado !== "PENDIENTE") return NextResponse.json({ error: s.estado === "FIRMADO" ? "firmado" : "anulado" }, { status: 409 });
  if (s.expiraAt && Date.parse(s.expiraAt) < Date.now()) return NextResponse.json({ error: "caducado" }, { status: 410 });
  const ip = ipDe(req.headers);
  const dispositivo = resumenDispositivo(req.headers.get("user-agent"));

  // El código: vigente, con intentos y correcto.
  if (!s.otpHash || !s.otpExpira || Date.parse(s.otpExpira) < Date.now()) return NextResponse.json({ error: "codigo_caducado" }, { status: 410 });
  if (s.otpIntentos >= OTP_MAX_INTENTOS) return NextResponse.json({ error: "intentos" }, { status: 429 });
  if (!codigoCoincide(String(body.codigo ?? ""), s.id, s.otpHash, secretoFirma())) {
    const intentos = s.otpIntentos + 1;
    await evidencia(admin, s, { evento: "codigo_fallido", ip, dispositivo }, { otpIntentos: intentos });
    return NextResponse.json({ error: intentos >= OTP_MAX_INTENTOS ? "intentos" : "codigo", restantes: Math.max(0, OTP_MAX_INTENTOS - intentos) }, { status: 400 });
  }
  s.evidencias = await evidencia(admin, s, { evento: "codigo_ok", ip, dispositivo }, { otpHash: null });

  // Por una EMPRESA firma una persona: su nombre, en nombre de la razón social.
  const firmante = s.clienteId ? nombre : `${nombre} (en nombre de ${s.firmanteNombre ?? "la empresa"})`;
  let firmado;
  try {
    firmado = await firmarSobre(admin, s, { firmaPng, metodo, nombre: firmante, ip, dispositivo });
  } catch (e) {
    if (e instanceof ErrorFirma) return NextResponse.json({ error: "firmar", detalle: e.message }, { status: e.status });
    console.error("[firma firmar]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "firmar" }, { status: 500 });
  }

  // Copia al firmante (los PDF firmados adjuntos) y aviso al despacho. Fallos aquí no deshacen
  // la firma: el documento ya está firmado y guardado.
  const base = baseUrlFromRequest(req);
  try {
    const adjuntos = [];
    for (const d of firmado.documentos) {
      if (!d.firmadoPath) continue;
      const { data } = await admin.storage.from("documentos").download(d.firmadoPath);
      if (data) adjuntos.push({ filename: `${d.titulo} firmado.pdf`, content: Buffer.from(await data.arrayBuffer()) });
    }
    await enviarCopiaFirmada(admin, firmado, adjuntos, { baseUrl: base, replyTo: await emailDeRespuesta(admin, firmado.workspaceId) });
    await avisarFirmaAlDespacho(admin, firmado, { baseUrl: base });
  } catch (e) { console.error("[firma avisos]", e instanceof Error ? e.message : e); }

  return NextResponse.json({ ok: true, firmadoAt: firmado.firmadoAt, documentos: firmado.documentos.map((d) => ({ doc: d.doc })) });
}
