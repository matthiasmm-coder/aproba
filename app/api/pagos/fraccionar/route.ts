import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { r2, ivaDe } from "@/lib/facturas";
import { TIPO_LABEL } from "@/lib/tramites";
import { enviarSolicitudPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// FRACCIONAR los honorarios de un expediente en N cuotas (pedido por Juan: ofrecer al
// cliente pagar en 3 o más plazos). Emite N facturas EMITIDAS ordinarias — cada una con
// su email de pago (IBAN + tarjeta), su «Recordar» en Cobros pendientes y su vencimiento
// mensual escalonado. momento = "CUOTA_i": único por expediente (índice parcial
// (expedienteId, momento) WHERE momento IS NOT NULL) e identificable por el panel.
// Sesión + el expediente se resuelve BAJO RLS (anti-IDOR); totales SIEMPRE del servidor.
export async function POST(req: Request) {
  let body: { expedienteId?: string; base?: number; nCuotas?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const expedienteId = (body.expedienteId ?? "").trim();
  const baseTotal = r2(Number(body.base));
  const n = Math.round(Number(body.nCuotas));
  if (!expedienteId) return NextResponse.json({ error: "Falta el expediente." }, { status: 400 });
  if (!Number.isFinite(baseTotal) || baseTotal <= 0) return NextResponse.json({ error: "El importe debe ser mayor que 0." }, { status: 400 });
  if (!Number.isFinite(n) || n < 2 || n > 12) return NextResponse.json({ error: "Entre 2 y 12 cuotas." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: exp } = await supa
    .from("Expediente")
    .select("id, referencia, tipo, workspaceId, cliente:Cliente(nombre, apellidos), facturas:Factura(id, momento, estado)")
    .eq("id", expedienteId)
    .maybeSingle();
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  // Un solo plan de cuotas por expediente, y nunca sobre un pago final ya emitido.
  const facturas = (exp.facturas ?? []) as { id: string; momento: string | null; estado: string }[];
  if (facturas.some((f) => String(f.momento ?? "").startsWith("CUOTA_") && f.estado !== "ANULADA")) {
    return NextResponse.json({ error: "Este expediente ya tiene un plan de cuotas." }, { status: 409 });
  }
  if (facturas.some((f) => f.momento === "FINAL" && f.estado !== "ANULADA")) {
    return NextResponse.json({ error: "Ya existe una factura de pago final. Anúlala antes de fraccionar." }, { status: 409 });
  }

  const cliRaw = exp.cliente as { nombre?: string | null; apellidos?: string | null } | { nombre?: string | null; apellidos?: string | null }[] | null;
  const cli = Array.isArray(cliRaw) ? cliRaw[0] : cliRaw;
  const clienteNombre = `${cli?.nombre ?? ""} ${cli?.apellidos ?? ""}`.trim() || "Cliente";
  const tramiteLabel = TIPO_LABEL[exp.tipo as string] ?? String(exp.tipo);

  // Reparto: n-1 cuotas iguales redondeadas; la última absorbe el resto (Σ bases = baseTotal).
  const cuotaBase = r2(baseTotal / n);
  const bases = Array.from({ length: n }, (_, i) => (i < n - 1 ? cuotaBase : r2(baseTotal - cuotaBase * (n - 1))));
  if (bases[n - 1] <= 0) return NextResponse.json({ error: "Importe demasiado pequeño para tantas cuotas." }, { status: 400 });

  const admin = createSupabaseAdmin();
  // Numeración: máximo NUMÉRICO del año una sola vez, luego correlativo.
  const year = new Date().getFullYear();
  const { data: nums } = await admin.from("Factura").select("numero").eq("workspaceId", exp.workspaceId).like("numero", `${year}-%`);
  const maxN = (nums ?? []).reduce((m, r) => { const x = Number(String(r.numero).split("-")[1]); return Number.isFinite(x) && x > m ? x : m; }, 0);

  const ahora = new Date();
  const filas: Record<string, unknown>[] = [];
  const emitidas: { facturaId: string; numero: string; total: number; vence: string }[] = [];
  for (let i = 0; i < n; i++) {
    const numero = `${year}-${String(maxN + 1 + i).padStart(4, "0")}`;
    // Cuota 1 vence en 14 días; las siguientes, un mes más cada una.
    const vence = new Date(ahora.getTime() + 14 * 864e5);
    vence.setUTCMonth(vence.getUTCMonth() + i);
    const base = bases[i];
    const iva = ivaDe(base);
    const total = r2(base + iva);
    const facturaId = uuid();
    filas.push({
      id: facturaId, workspaceId: exp.workspaceId, expedienteId: exp.id,
      numero, clienteNombre,
      concepto: `Cuota ${i + 1} de ${n} — ${tramiteLabel} (${exp.referencia})`,
      baseImponible: base, iva, total,
      estado: "EMITIDA", origen: "MANUAL", momento: `CUOTA_${i + 1}`, metodoPago: "TRANSFERENCIA",
      fechaEmision: ahora.toISOString(), fechaVencimiento: vence.toISOString(),
    });
    emitidas.push({ facturaId, numero, total, vence: vence.toISOString() });
  }
  // Inserción ATÓMICA (un solo INSERT): si otra emisión concurrente pisa un número, no se
  // escribe NADA — sin planes de cuotas parciales — y el «reintenta» es veraz.
  const { error } = await admin.from("Factura").insert(filas);
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: dup ? "Conflicto de numeración; reintenta (no se emitió ninguna cuota)." : error.message }, { status: dup ? 409 : 500 });
  }

  await admin.from("ExpedienteEvento").insert({
    id: uuid(), expedienteId: exp.id, tipo: "COMENTARIO",
    descripcion: `📄 Honorarios fraccionados en ${n} cuotas (${emitidas.map((e) => e.numero).join(", ")})`,
  });

  // Email de pago de la PRIMERA cuota; las siguientes se reclaman con «Recordar» en
  // Cobros pendientes cuando venzan (fail-soft: sin email el plan sigue emitido).
  let enviado = false;
  try {
    await enviarSolicitudPago(admin, {
      expedienteId: exp.id, facturaId: emitidas[0].facturaId, numero: emitidas[0].numero,
      total: emitidas[0].total, concepto: `Cuota 1 de ${n} — ${tramiteLabel}`, baseUrl: baseUrlFromRequest(req),
    });
    enviado = true;
  } catch { /* */ }

  return NextResponse.json({ ok: true, cuotas: emitidas, enviado });
}
