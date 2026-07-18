import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosFiscalesDeCliente, totalesFactura } from "@/lib/facturas";
import { facturacionAvanzada } from "@/lib/planes";
import { enviarSolicitudPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";
import { ordenParentesco } from "@/lib/familia";

export const runtime = "nodejs";
const uuid = () => crypto.randomUUID();

// POST → emite UNA factura familiar: una línea por miembro (facturada al titular), con
// posible línea de "Descuento familiar" (base negativa). Solo el gestor autenticado; la
// familia se valida bajo sesión/RLS. Totales SIEMPRE recalculados en el servidor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Familia + miembros + sus expedientes (bajo RLS → null si no es del workspace).
  // La jointure lleva los datos fiscales del titular para el snapshot de la factura;
  // repli a la versión mínima si alguna columna de la ficha faltara en una base antigua.
  let resFam = await supabase
    .from("Familia")
    .select("id, nombre, workspaceId, clientes:Cliente(id, nombre, apellidos, parentesco, numeroDocumento, pasaporte, via, numeroVia, piso, codigoPostal, municipio, provincia, expedientes:Expediente(id))")
    .eq("id", id)
    .maybeSingle();
  if (resFam.error) resFam = await supabase
    .from("Familia")
    .select("id, nombre, workspaceId, clientes:Cliente(id, nombre, apellidos, parentesco, expedientes:Expediente(id))")
    .eq("id", id)
    .maybeSingle() as typeof resFam;
  const { data: fam, error: eFam } = resFam;
  if (eFam) return NextResponse.json({ error: eFam.message }, { status: 500 });
  if (!fam) return NextResponse.json({ error: "Familia no encontrada." }, { status: 404 });

  // La facturación familiar (varias líneas + descuento) es una función Pro/Business. El gating
  // se valida EN EL SERVIDOR (no solo en el botón) para que un plan Starter no pueda emitirla
  // llamando directamente al endpoint.
  const { data: sub } = await supabase.from("Subscription").select("plan").eq("workspaceId", fam.workspaceId).maybeSingle();
  if (!facturacionAvanzada(sub?.plan)) return NextResponse.json({ error: "La facturación familiar está disponible en los planes Pro y Business." }, { status: 403 });

  let body: { numero?: string; clienteNombre?: string; concepto?: string; lineas?: { concepto: string; base: number }[]; suplidos?: { concepto: string; importe: number }[]; notas?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

  // Líneas: se conservan las que tienen concepto y base != 0 (la base negativa del descuento
  // SÍ se conserva; solo se descartan las líneas vacías). Suplidos: importe > 0.
  const lineas = (Array.isArray(body.lineas) ? body.lineas : []).filter((l) => l?.concepto?.trim() && Number(l.base) !== 0).map((l) => ({ concepto: l.concepto.trim(), base: Number(l.base) }));
  const suplidos = (Array.isArray(body.suplidos) ? body.suplidos : []).filter((s) => s?.concepto?.trim() && Number(s.importe) > 0).map((s) => ({ concepto: s.concepto.trim(), importe: Number(s.importe) }));
  if (!lineas.length) return NextResponse.json({ error: "La factura no tiene líneas." }, { status: 400 });

  const { base, iva, total } = totalesFactura(lineas, suplidos);
  if (base <= 0) return NextResponse.json({ error: "El descuento no puede superar el importe de la factura." }, { status: 400 });
  if (total <= 0) return NextResponse.json({ error: "El total debe ser mayor que 0." }, { status: 400 });

  // Ancla: el expediente del titular (para el email + trazabilidad); si no, el de cualquier
  // miembro. Puede no existir ninguno → factura sin envío automático (el gestor comparte el enlace).
  type Cli = { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; expedientes: { id: string }[] | null } & Parameters<typeof datosFiscalesDeCliente>[0];
  const miembros = ((fam.clientes ?? []) as unknown as Cli[]).slice().sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
  const titular = miembros.find((m) => m.parentesco === "TITULAR") ?? miembros[0] ?? null;
  // Snapshot fiscal del TITULAR (la factura familiar se emite a su nombre).
  const clienteDatos = datosFiscalesDeCliente(titular);
  const anchorExpedienteId = (titular?.expedientes?.[0]?.id) ?? miembros.find((m) => (m.expedientes?.length ?? 0) > 0)?.expedientes?.[0]?.id ?? null;

  const clienteAuto = titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() : "";
  const clienteNombre = body.clienteNombre?.trim() || clienteAuto || (fam.nombre as string);
  const concepto = body.concepto?.trim() || `Factura familiar — ${fam.nombre} (${lineas.filter((l) => l.base > 0).length} servicios)`.slice(0, 200);

  const admin = createSupabaseAdmin();
  const year = new Date().getFullYear();
  let numero = body.numero?.trim() || "";
  if (!numero) {
    // Máximo NUMÉRICO del año (no orden lexicográfico: "2026-9999" &lt; "2026-10000").
    const { data: nums } = await admin.from("Factura").select("numero").eq("workspaceId", fam.workspaceId).like("numero", `${year}-%`);
    const maxN = (nums ?? []).reduce((m, r) => { const n = Number(String(r.numero).split("-")[1]); return Number.isFinite(n) && n > m ? n : m; }, 0);
    numero = `${year}-${String(maxN + 1).padStart(4, "0")}`;
  }

  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + 14 * 864e5);
  const facturaId = uuid();
  const fila: Record<string, unknown> = {
    id: facturaId, workspaceId: fam.workspaceId, familiaId: fam.id, expedienteId: anchorExpedienteId,
    numero, clienteNombre, concepto, baseImponible: base, iva, total,
    estado: "EMITIDA", origen: "MANUAL", momento: null, metodoPago: "TRANSFERENCIA",
    fechaEmision: ahora.toISOString(), fechaVencimiento: vencimiento.toISOString(),
    lineas, suplidos, notas: body.notas?.trim() || null,
    ...(clienteDatos ? { clienteDatos } : {}),
  };
  let { error: eIns } = await admin.from("Factura").insert(fila);
  if (eIns && clienteDatos && /clienteDatos/i.test(eIns.message)) {
    // Repli si la migración factura-cliente-datos.sql no está aplicada: emite sin snapshot.
    delete fila.clienteDatos;
    ({ error: eIns } = await admin.from("Factura").insert(fila));
  }
  if (eIns && /familiaId|column|schema cache|does not exist/i.test(eIns.message)) {
    // Repli si la migración factura-familia.sql no está aplicada: emite sin el vínculo familia.
    delete fila.familiaId;
    delete fila.clienteDatos;
    ({ error: eIns } = await admin.from("Factura").insert(fila));
  }
  if (eIns) {
    const dup = /duplicate|unique/i.test(eIns.message);
    return NextResponse.json({ error: dup ? "Ese número de factura ya existe. Cámbialo." : eIns.message }, { status: dup ? 409 : 500 });
  }

  const baseUrl = baseUrlFromRequest(req);
  let enviado = false;
  if (anchorExpedienteId) {
    await admin.from("ExpedienteEvento").insert({ id: uuid(), expedienteId: anchorExpedienteId, tipo: "COMENTARIO", descripcion: `📄 Factura familiar ${numero} emitida (${clienteNombre}) · pendiente de pago` });
    try { await enviarSolicitudPago(admin, { expedienteId: anchorExpedienteId, facturaId, numero, total, concepto, baseUrl }); enviado = true; } catch { /* el gestor puede compartir el enlace manualmente */ }
  }
  return NextResponse.json({ ok: true, facturaId, numero, total, enviado });
}
