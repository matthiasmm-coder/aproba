import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Cron diario (vercel.json): suma el gasto de IA de las últimas 24 h POR WORKSPACE a
// partir de los tokens ya journalizados (CentinelaRevision + Extraction) y avisa a
// Matthias por email si algún despacho pasa el umbral. El objetivo: que un uso intensivo
// se descubra por un email del producto, no por la factura de Anthropic (caso Gesadmbcn,
// 13/08: ~6 $ en 24 h de migración + 17 revisiones Centinela + 26 documentos).
//
// Lo que NO es: una factura. El coste es una ESTIMACIÓN a tarifa Opus sin distinguir
// lecturas de caché (baratas), y el mapeo IA del import y el asistente no journalizan
// tokens (2-3 llamadas puntuales). Para una alarma sobra; para contabilidad, no vale.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEST = process.env.VEILLE_ALERT_EMAIL || "matthias.merlemounier@gmail.com";
const UMBRAL_USD = Number(process.env.USO_IA_ALERTA_USD) || 3; // por workspace y día
// Tarifa familia Opus ($/M tokens). Si el modelo cambia de familia, ajustar aquí.
const USD_IN = 15, USD_OUT = 75;

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // solo lee y avisa: sin secreto configurado, corre igual (como veille-ex)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Uso = { in: number; out: number; centinela: number; docs: number };

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createSupabaseAdmin();
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const porWs = new Map<string, Uso>();
  const suma = (ws: string, inT: number, outT: number, k: "centinela" | "docs") => {
    const u = porWs.get(ws) ?? { in: 0, out: 0, centinela: 0, docs: 0 };
    u.in += inT; u.out += outT; u[k]++;
    porWs.set(ws, u);
  };

  // Centinela: workspaceId directo.
  try {
    const { data } = await admin.from("CentinelaRevision")
      .select("workspaceId, inputTokens, outputTokens").gte("createdAt", desde).limit(5000);
    for (const r of (data ?? []) as { workspaceId: string; inputTokens: number | null; outputTokens: number | null }[]) {
      suma(r.workspaceId, r.inputTokens ?? 0, r.outputTokens ?? 0, "centinela");
    }
  } catch { /* tabla sin migrar → solo Vision */ }

  // Vision: Extraction → Documento → Expediente → workspace (en lotes).
  try {
    const { data: exs } = await admin.from("Extraction")
      .select("documentoId, inputTokens, outputTokens").gte("createdAt", desde).limit(5000);
    const filas = (exs ?? []) as { documentoId: string; inputTokens: number | null; outputTokens: number | null }[];
    const docIds = [...new Set(filas.map((e) => e.documentoId).filter(Boolean))];
    const docAWs = new Map<string, string>();
    for (let i = 0; i < docIds.length; i += 200) {
      const lote = docIds.slice(i, i + 200);
      const { data: docs } = await admin.from("Documento").select("id, expedienteId").in("id", lote);
      const expIds = [...new Set((docs ?? []).map((d) => d.expedienteId as string).filter(Boolean))];
      const { data: exps } = expIds.length
        ? await admin.from("Expediente").select("id, workspaceId").in("id", expIds)
        : { data: [] };
      const expAWs = new Map((exps ?? []).map((e) => [e.id as string, e.workspaceId as string]));
      for (const d of docs ?? []) {
        const ws = expAWs.get(d.expedienteId as string);
        if (ws) docAWs.set(d.id as string, ws);
      }
    }
    for (const e of filas) {
      const ws = docAWs.get(e.documentoId);
      if (ws) suma(ws, e.inputTokens ?? 0, e.outputTokens ?? 0, "docs");
    }
  } catch { /* sin datos Vision */ }

  // Nombres de los workspaces con gasto.
  const ids = [...porWs.keys()];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: ws } = await admin.from("Workspace").select("id, nombre").in("id", ids);
    for (const w of ws ?? []) nombres.set(w.id as string, (w.nombre as string) ?? w.id);
  }

  const usd = (u: Uso) => (u.in / 1e6) * USD_IN + (u.out / 1e6) * USD_OUT;
  const filas = ids
    .map((id) => ({ id, nombre: nombres.get(id) ?? id, u: porWs.get(id)!, usd: usd(porWs.get(id)!) }))
    .sort((a, b) => b.usd - a.usd);
  const total = filas.reduce((s, f) => s + f.usd, 0);
  const alarma = filas.filter((f) => f.usd >= UMBRAL_USD);

  // Email SOLO si hay alarma (nada de ruido diario).
  let avisado = false;
  if (alarma.length && process.env.RESEND_API_KEY) {
    const lineas = filas.filter((f) => f.usd >= 0.1).map((f) =>
      `  · ${f.nombre}: ~$${f.usd.toFixed(2)} — ${f.u.docs} documentos, ${f.u.centinela} revisiones Centinela (${(f.u.in / 1000).toFixed(0)}k in / ${(f.u.out / 1000).toFixed(0)}k out)`).join("\n");
    const cuerpo = `Uso de IA en las últimas 24 h (estimación a tarifa Opus, umbral $${UMBRAL_USD}/workspace):\n\n${lineas}\n\n  TOTAL: ~$${total.toFixed(2)}\n\nNo es la factura: el import y el asistente no journalizan tokens, y las lecturas de caché cuestan ~10 %. Contrasta con el panel de Anthropic antes de sacar conclusiones.`;
    const from = `Aproba <${process.env.AVISOS_EMAIL_FROM || "onboarding@resend.dev"}>`;
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from, to: DEST,
      subject: `⚡ Uso de IA: ${alarma[0].nombre} ~$${alarma[0].usd.toFixed(2)} en 24 h${alarma.length > 1 ? ` (+${alarma.length - 1} más)` : ""}`,
      text: cuerpo,
    });
    avisado = !error;
  }

  return NextResponse.json({
    ok: true, desde, umbralUsd: UMBRAL_USD, totalUsd: Number(total.toFixed(2)), avisado,
    workspaces: filas.map((f) => ({ nombre: f.nombre, usd: Number(f.usd.toFixed(2)), documentos: f.u.docs, centinela: f.u.centinela })),
  });
}
