import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { evidencia, sobrePorToken } from "@/lib/firma/servicio";
import { secretoFirma } from "@/lib/firma/publico";
import { enviarCodigoFirma } from "@/lib/firma/emails";
import { OTP_MAX_ENVIOS, OTP_MINUTOS, OTP_REENVIO_SEG, enmascararEmail, huellaCodigo, ipDe, nuevoCodigo, resumenDispositivo } from "@/lib/firma/sobre";

// EL CÓDIGO DE UN SOLO USO (6 cifras, 10 minutos) al email del firmante: confirma que quien
// firma es quien recibe los correos. Límites: un envío cada 30 s y 6 por sobre.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();
  const s = await sobrePorToken(admin, token);
  if (!s) return NextResponse.json({ error: "enlace" }, { status: 404 });
  if (s.estado !== "PENDIENTE") return NextResponse.json({ error: s.estado === "FIRMADO" ? "firmado" : "anulado" }, { status: 409 });
  if (s.expiraAt && Date.parse(s.expiraAt) < Date.now()) return NextResponse.json({ error: "caducado" }, { status: 410 });
  if (!s.firmanteEmail) return NextResponse.json({ error: "sin_email" }, { status: 409 });
  if (s.otpEnviados >= OTP_MAX_ENVIOS) return NextResponse.json({ error: "limite" }, { status: 429 });
  // Último envío = caducidad del código menos su validez.
  const ultimo = s.otpExpira ? Date.parse(s.otpExpira) - OTP_MINUTOS * 60_000 : 0;
  const espera = Math.ceil((ultimo + OTP_REENVIO_SEG * 1000 - Date.now()) / 1000);
  if (espera > 0) return NextResponse.json({ error: "espera", reenvioEn: espera }, { status: 429 });

  const codigo = nuevoCodigo();
  const ahora = new Date();
  await evidencia(admin, s, { evento: "codigo_enviado", ip: ipDe(req.headers), dispositivo: resumenDispositivo(req.headers.get("user-agent")), detalle: `A ${enmascararEmail(s.firmanteEmail)}` }, {
    otpHash: huellaCodigo(codigo, s.id, secretoFirma()),
    otpExpira: new Date(ahora.getTime() + OTP_MINUTOS * 60_000).toISOString(),
    otpIntentos: 0, otpEnviados: s.otpEnviados + 1,
  });
  // En local el código sale en la consola del servidor (los emails de prueba van al vacío).
  if (process.env.NODE_ENV !== "production") console.log(`[firma] código de ${s.id.slice(0, 8)}: ${codigo}`);
  const r = await enviarCodigoFirma(admin, s, codigo);
  if (!r.enviado && !r.simulado) return NextResponse.json({ error: "envio" }, { status: 502 });
  return NextResponse.json({ ok: true, destino: enmascararEmail(s.firmanteEmail), reenvioEn: OTP_REENVIO_SEG, minutos: OTP_MINUTOS });
}
