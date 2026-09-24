import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ivaDe, totalDe, totalesFactura, datosFiscalesManuales, datosFiscalesDeCliente, type ClienteDatosFactura } from "@/lib/facturas";
import { datosFiscalesDeEmpresa } from "@/lib/empresa";
import { siguienteNumero } from "@/lib/factura-numero";
import { fmtFechaCorta } from "@/lib/tramites";
import { registrarAltaSiActivo } from "@/lib/verifactu-envio";

// Factura MANUAL («+ Nueva factura»). Hasta el 17/09/2026 el navegador insertaba en
// Factura directamente; ahora nace aquí: numeración, totales recalculados y registro
// VERI*FACTU en un único sitio. El workspace sale de la sesión; la oficina se valida
// contra ese workspace (anti-IDOR) — nadie factura en la serie del vecino.
export const dynamic = "force-dynamic";

type Linea = { concepto: string; base: number };
type Suplido = { concepto: string; importe: number };
type Body = {
  numero?: string; oficinaId?: string | null; cliente?: string; concepto?: string; baseImponible?: number;
  avanzada?: boolean; lineas?: Linea[]; suplidos?: Suplido[]; notas?: string | null;
  // Datos fiscales del cliente (24/09/2026): lo escrito manda; si no hay nada escrito y se
  // eligió un cliente o una empresa de la lista, los de su ficha.
  documento?: string; direccion?: string; clienteId?: string | null; empresaId?: string | null;
};

export async function POST(req: Request) {
  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 403 });
  const workspaceId = (mem as { workspaceId: string }).workspaceId;

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const cliente = String(body.cliente ?? "").trim();
  const concepto = String(body.concepto ?? "").trim();
  if (!cliente || !concepto) return NextResponse.json({ error: "Faltan el cliente o el concepto." }, { status: 400 });

  // Oficina: validada contra MI despacho; null = serie común.
  let oficinaId: string | null = String(body.oficinaId ?? "").trim() || null;
  let prefijo = "";
  if (oficinaId) {
    const { data: ofi } = await admin.from("Oficina").select("id, prefijoSerie").eq("id", oficinaId).eq("workspaceId", workspaceId).maybeSingle();
    if (!ofi) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });
    prefijo = (((ofi as { prefijoSerie?: string | null }).prefijoSerie) ?? "").trim();
    oficinaId = (ofi as { id: string }).id;
  }

  // Totales recalculados en el servidor (los suplidos van sin IVA), como en la edición.
  const ls = body.avanzada && Array.isArray(body.lineas) ? body.lineas.filter((l) => l?.concepto?.trim() && Number(l.base) > 0).map((l) => ({ concepto: l.concepto.trim(), base: Number(l.base) })) : [];
  const ss = body.avanzada && Array.isArray(body.suplidos) ? body.suplidos.filter((s) => s?.concepto?.trim() && Number(s.importe) > 0).map((s) => ({ concepto: s.concepto.trim(), importe: Number(s.importe) })) : [];
  let baseImponible: number, iva: number, total: number;
  if (ls.length) { const tt = totalesFactura(ls, ss); baseImponible = tt.base; iva = tt.iva; total = tt.total; }
  else { baseImponible = Number(body.baseImponible) || 0; iva = ivaDe(baseImponible); total = totalDe(baseImponible); }
  if (total <= 0) return NextResponse.json({ error: "El importe de la factura debe ser mayor que 0" }, { status: 400 });

  // A quién se factura: el cliente o la empresa elegidos se validan contra MI despacho
  // (anti-IDOR: un id ajeno no se enlaza ni presta sus datos fiscales).
  let clienteId: string | null = null, empresaId: string | null = null;
  let deFicha: ClienteDatosFactura | null = null;
  const idCli = typeof body.clienteId === "string" ? body.clienteId.slice(0, 64) : "";
  const idEmp = typeof body.empresaId === "string" ? body.empresaId.slice(0, 64) : "";
  if (idCli) {
    const { data: c } = await admin.from("Cliente").select("*").eq("id", idCli).eq("workspaceId", workspaceId).maybeSingle();
    if (c) { clienteId = idCli; deFicha = datosFiscalesDeCliente(c as Record<string, string | null>); }
  } else if (idEmp) {
    const { data: e } = await admin.from("Empresa").select("id, razonSocial, nif, domicilio, codigoPostal, municipio, provincia").eq("id", idEmp).eq("workspaceId", workspaceId).maybeSingle();
    if (e) { empresaId = idEmp; deFicha = datosFiscalesDeEmpresa(e as Record<string, string | null>); }
  }
  const escrito = datosFiscalesManuales(body.documento, body.direccion);
  const clienteDatos = escrito ?? deFicha;

  const hoy = new Date();
  const vence = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
  // Avanzada: respeta el nº editado. Simple: numera secuencialmente (legal).
  const numero = String(body.numero ?? "").trim() || (await siguienteNumero(admin, workspaceId, hoy.getFullYear(), prefijo));
  const id = crypto.randomUUID();
  const row: Record<string, unknown> = {
    id, workspaceId, numero, ...(oficinaId ? { oficinaId } : {}),
    clienteNombre: cliente, concepto, baseImponible, iva, total, estado: "EMITIDA", origen: "MANUAL",
    fechaEmision: hoy.toISOString(), fechaVencimiento: vence.toISOString(),
    ...(body.avanzada ? { lineas: ls, suplidos: ss, notas: body.notas?.trim() || null } : {}),
    ...(clienteDatos ? { clienteDatos } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(empresaId ? { empresaId } : {}),
  };
  let { error } = await admin.from("Factura").insert(row);
  if (error && row.oficinaId && /oficinaId/i.test(error.message)) { delete row.oficinaId; ({ error } = await admin.from("Factura").insert(row)); }
  // Repli si falta alguna columna opcional (clienteDatos, clienteId, empresaId): la factura nace igual.
  if (error && /clienteDatos|clienteId|empresaId/i.test(error.message)) {
    delete row.clienteDatos; delete row.clienteId; delete row.empresaId;
    ({ error } = await admin.from("Factura").insert(row));
  }
  if (error && body.avanzada && /lineas|suplidos|notas/i.test(error.message)) {
    return NextResponse.json({ error: "Falta la migración de facturas avanzadas: ejecuta supabase/factura-lineas.sql." }, { status: 500 });
  }
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: dup ? "Ese número de factura ya existe. Cámbialo." : error.message }, { status: dup ? 409 : 500 });
  }
  // VERI*FACTU: registro de alta (si el NIF emisor lo tiene activo). Nunca frena la emisión.
  const verifactu = await registrarAltaSiActivo(admin, id);
  return NextResponse.json({ ok: true, id, numero, fecha: fmtFechaCorta(hoy.toISOString()) ?? "", vence: fmtFechaCorta(vence.toISOString()), clienteDatos: row.clienteDatos ?? null, ...(verifactu ? { verifactu } : {}) });
}
