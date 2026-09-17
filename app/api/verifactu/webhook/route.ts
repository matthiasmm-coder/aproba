import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { aplicarEstadoVerifacti, type FilaRegistro } from "@/lib/verifactu-envio";
import { normalizarNif } from "@/lib/verifactu";

// Webhook de Verifacti: el resultado de la AEAT para un registro de facturación. PÚBLICO,
// autenticado por firma HMAC-SHA256 del cuerpo con el secreto del webhook (header
// X-Webhook-Signature, secreto en VERIFACTI_WEBHOOK_SECRET — se registra en Verifacti con
// POST /webhooks {url, entorno, secret, nifs}). Idempotente: aplicar dos veces el mismo
// estado no cambia nada. Sin secreto configurado → 503 (nunca se aceptan avisos sin firma).
export const runtime = "nodejs";

type Aviso = {
  uuid?: string; estado?: string; nif?: string; serie?: string; numero?: string; fecha_expedicion?: string; operacion?: string;
  url?: string; codigo_error?: string; mensaje_error?: string;
};

function firmaValida(cuerpo: string, firma: string | null, secreto: string): boolean {
  if (!firma) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(firma.trim().toLowerCase().replace(/^sha256=/, ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secreto = process.env.VERIFACTI_WEBHOOK_SECRET;
  if (!secreto) return NextResponse.json({ error: "Webhook no configurado." }, { status: 503 });
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("x-webhook-signature"), secreto)) return NextResponse.json({ error: "Firma inválida." }, { status: 401 });

  let aviso: Aviso | Aviso[];
  try { aviso = JSON.parse(cuerpo); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const avisos = Array.isArray(aviso) ? aviso : [aviso];
  const admin = createSupabaseAdmin();
  let aplicados = 0;
  for (const a of avisos) {
    if (!a || typeof a !== "object") continue;
    let reg: FilaRegistro | null = null;
    if (a.uuid) {
      const { data } = await admin.from("VerifactuRegistro").select("id, estado").eq("uuid", a.uuid).maybeSingle();
      reg = (data as FilaRegistro | null) ?? null;
    }
    if (!reg && a.numero) {
      // Sin uuid: por (nif, serie+número, tipo). La fecha va DD-MM-YYYY → yyyy-mm-dd.
      const tipo = /anul/i.test(a.operacion ?? "") ? "ANULACION" : "ALTA";
      const numero = `${a.serie ?? ""}${a.numero}`;
      let q = admin.from("VerifactuRegistro").select("id, estado").eq("tipo", tipo).eq("numero", numero);
      if (a.nif) q = q.eq("nif", normalizarNif(a.nif));
      if (a.fecha_expedicion && /^\d{2}-\d{2}-\d{4}$/.test(a.fecha_expedicion)) {
        const [d, m, y] = a.fecha_expedicion.split("-");
        q = q.eq("fechaExpedicion", `${y}-${m}-${d}`);
      }
      const { data } = await q.limit(1).maybeSingle();
      reg = (data as FilaRegistro | null) ?? null;
    }
    if (!reg) { console.warn("[verifactu webhook] registro no encontrado", a.uuid ?? a.numero); continue; }
    try { await aplicarEstadoVerifacti(admin, reg, a); aplicados++; }
    catch (e) { console.error("[verifactu webhook]", reg.id, e instanceof Error ? e.message : e); }
  }
  return NextResponse.json({ ok: true, aplicados });
}
