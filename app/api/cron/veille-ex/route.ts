import { NextResponse } from "next/server";
import { Resend } from "resend";
import { snapshot, diff, type Snap } from "@/lib/veille-ex";
import fingerprints from "@/forms/ex/fingerprints.json";
import baseline from "@/scripts/veille-ex-official.json";

// Cron de Vercel (ver vercel.json): cada lunes comprueba los modelos EX oficiales del
// Ministerio y, si alguno cambió (contenido, enlace retirado/añadido), AVISA POR EMAIL.
// Sustituye al workflow de GitHub Actions (que requería el scope `workflow` del token).
// Para regenerar el baseline tras revisar un cambio: `node scripts/veille-ex.mjs --init`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEST = process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com";

// Vercel Cron añade `Authorization: Bearer <CRON_SECRET>` cuando CRON_SECRET está
// configurada. Si no lo está, el endpoint queda accesible (configúrala en Vercel para
// protegerlo). SOLO header: nada de `?key=` (una clave en la URL acaba en logs/historial).
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function avisar(subject: string, cuerpo: string): Promise<string> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[veille-ex] (sin RESEND, simulado) ${subject}\n${cuerpo}`);
    return "SIMULADO";
  }
  const from = `Aproba Veille <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
  const html = `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap">${cuerpo.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to: DEST, subject, html, text: cuerpo });
  if (error) { console.error("[veille-ex email]", error); return "ERROR"; }
  return "ENVIADO";
}

export async function GET(req: Request) {
  if (!autorizado(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const codes = Object.keys(fingerprints as Record<string, unknown>).sort();
    const cur = await snapshot(codes);
    const { lines, changes } = diff(baseline as unknown as Snap, cur);
    const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");

    if (changes > 0) {
      const cuerpo =
        `Veille modelos EX — ${changes} modelo(s) cambiaron en el Ministerio (${fecha} UTC)\n\n` +
        lines.join("\n") +
        `\n\nAcción: re-descarga el PDF, revisa/rehaz el mapeo en lib/ex-forms.ts, regenera ` +
        `forms/ex/fingerprints.json y luego ejecuta \`node scripts/veille-ex.mjs --init\` para ` +
        `actualizar el baseline (scripts/veille-ex-official.json).`;
      const estado = await avisar(`⚠️ Veille EX: ${changes} modelo(s) oficiales cambiaron`, cuerpo);
      return NextResponse.json({ ok: true, changes, estado, lines });
    }

    return NextResponse.json({ ok: true, changes: 0, fecha, modelos: codes.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[veille-ex] fallo:", msg);
    await avisar("⚠️ Veille EX: el chequeo automático falló", `La veille EX no pudo completarse (${new Date().toISOString()}):\n${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
