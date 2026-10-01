import "server-only";
import { ivaDe, totalDe, totalesFactura, datosFiscalesManuales, datosFiscalesDeCliente, pctRetencion, retencionDe, aCobrar, motivoNoSimplificada, prefijoSimplificada, lineasDeCuerpo, type ClienteDatosFactura, type Factura, type LineaFactura, type Suplido } from "@/lib/facturas";
import { emisorParaFijar, emisorParaOficina, cuentaParaOficina } from "@/lib/facturacion-oficina";
import { datosFiscalesDeEmpresa } from "@/lib/empresa";
import { siguienteNumero } from "@/lib/factura-numero";
import { fmtFechaCorta } from "@/lib/tramites";
import { registrarAltaSiActivo } from "@/lib/verifactu-envio";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";

// FACTURA MANUAL — un único sitio donde nace (numeración, totales, receptor, emisor
// congelado y registro VERI*FACTU). Lo usan «+ Nueva factura» (app/api/facturas) y la
// conversión de una proforma en factura (app/api/proformas/[id]/convertir, 29/09/2026):
// una proforma convertida es exactamente la factura que se habría hecho a mano.
// Las proformas usan además importesDeCuerpo / receptorDeCuerpo / oficinaDeCuerpo, para
// que sus importes salgan con los mismos cálculos que los de la factura en que se convierten.

type Admin = ReturnType<typeof createSupabaseAdmin>;

export type CuerpoDocumento = {
  numero?: string; oficinaId?: string | null; cliente?: string; concepto?: string; baseImponible?: number;
  avanzada?: boolean; lineas?: LineaFactura[]; suplidos?: Suplido[]; notas?: string | null;
  // Datos fiscales del cliente (24/09/2026): lo escrito manda; si no hay nada escrito y se
  // eligió un cliente o una empresa de la lista, los de su ficha.
  documento?: string; direccion?: string; clienteId?: string | null; empresaId?: string | null;
  // Retención de IRPF (28/09/2026, Asenjo): tipo en % sobre la base de honorarios.
  retencionPct?: number | string | null;
  // Factura SIMPLIFICADA (01/10/2026, Juan): hasta 400 € IVA incluido, serie S, sin datos
  // fiscales del cliente (el nombre es opcional) y sin retención.
  simplificada?: boolean;
};
export type Fallo = { ok: false; status: number; error: string };

// Oficina: validada contra MI despacho (anti-IDOR: nadie factura en la serie del vecino);
// null = serie común.
export async function oficinaDeCuerpo(admin: Admin, workspaceId: string, oficinaIdCrudo: unknown): Promise<{ ok: true; oficinaId: string | null; prefijo: string } | Fallo> {
  const oficinaId = String(oficinaIdCrudo ?? "").trim() || null;
  if (!oficinaId) return { ok: true, oficinaId: null, prefijo: "" };
  const { data: ofi } = await admin.from("Oficina").select("id, prefijoSerie").eq("id", oficinaId).eq("workspaceId", workspaceId).maybeSingle();
  if (!ofi) return { ok: false, status: 404, error: "Oficina no encontrada." };
  return { ok: true, oficinaId: (ofi as { id: string }).id, prefijo: (((ofi as { prefijoSerie?: string | null }).prefijoSerie) ?? "").trim() };
}

export type Importes = { lineas: LineaFactura[]; suplidos: Suplido[]; baseImponible: number; iva: number; total: number; retencionPct: number | null; retencion: number };

// Totales recalculados en el servidor (los suplidos van sin IVA), como en la edición.
export function importesDeCuerpo(body: CuerpoDocumento): ({ ok: true } & Importes) | Fallo {
  // Las líneas admiten un DESCUENTO (línea negativa) sobre honorarios: lib/facturas lineasDeCuerpo.
  const lineas = body.avanzada ? lineasDeCuerpo(body.lineas) : [];
  const suplidos = body.avanzada && Array.isArray(body.suplidos) ? body.suplidos.filter((s) => s?.concepto?.trim() && Number(s.importe) > 0).map((s) => ({ concepto: s.concepto.trim(), importe: Number(s.importe) })) : [];
  let baseImponible: number, iva: number, total: number;
  if (lineas.length) { const tt = totalesFactura(lineas, suplidos); baseImponible = tt.base; iva = tt.iva; total = tt.total; }
  else { baseImponible = Number(body.baseImponible) || 0; iva = ivaDe(baseImponible); total = totalDe(baseImponible); }
  if (total <= 0) return { ok: false, status: 400, error: "El importe de la factura debe ser mayor que 0" };
  // Retención de IRPF: solo sobre la base de honorarios; el total NO la resta (aCobrar sí).
  const retencionPct = pctRetencion(body.retencionPct);
  const retencion = retencionPct ? retencionDe(baseImponible, retencionPct) : 0;
  return { ok: true, lineas, suplidos, baseImponible, iva, total, retencionPct, retencion };
}

// A quién se factura: el cliente o la empresa elegidos se validan contra MI despacho
// (anti-IDOR: un id ajeno no se enlaza ni presta sus datos fiscales).
export async function receptorDeCuerpo(admin: Admin, workspaceId: string, body: CuerpoDocumento): Promise<{ clienteId: string | null; empresaId: string | null; clienteDatos: ClienteDatosFactura | null }> {
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
  return { clienteId, empresaId, clienteDatos: escrito ?? deFicha };
}

// Lo COMÚN a crear la factura y a su VISTA PREVIA (01/10/2026, Luis): validación, oficina,
// importes, receptor y número salen de aquí, así la vista previa es la factura que nacerá.
type Preparada = {
  ok: true; simplificada: boolean; cliente: string; concepto: string; oficinaId: string | null;
  imp: Importes; clienteId: string | null; empresaId: string | null; clienteDatos: ClienteDatosFactura | null;
  numero: string; hoy: Date; vence: Date;
};
async function prepararFacturaManual(admin: Admin, workspaceId: string, body: CuerpoDocumento): Promise<Preparada | Fallo> {
  const simplificada = body.simplificada === true;
  const cliente = String(body.cliente ?? "").trim();
  const concepto = String(body.concepto ?? "").trim();
  if ((!cliente && !simplificada) || !concepto) return { ok: false, status: 400, error: simplificada ? "Falta el concepto." : "Faltan el cliente o el concepto." };

  const ofi = await oficinaDeCuerpo(admin, workspaceId, body.oficinaId);
  if (!ofi.ok) return ofi;
  const { oficinaId, prefijo } = ofi;

  const imp = importesDeCuerpo(body);
  if (!imp.ok) return imp;
  if (simplificada) {
    const motivo = motivoNoSimplificada(imp.total, imp.retencionPct);
    if (motivo) return { ok: false, status: 400, error: motivo };
  }

  // Simplificada: el vínculo con la ficha se conserva (historial, cobros), pero sus datos
  // fiscales NO se imprimen: es lo que la distingue de una factura completa.
  const receptor = await receptorDeCuerpo(admin, workspaceId, body);
  const clienteDatos = simplificada ? null : receptor.clienteDatos;

  const hoy = new Date();
  const vence = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
  // Avanzada: respeta el nº editado. Simple: numera secuencialmente (legal). Solo LEE la serie.
  const numero = String(body.numero ?? "").trim() || (await siguienteNumero(admin, workspaceId, hoy.getFullYear(), simplificada ? prefijoSimplificada(prefijo) : prefijo));
  return { ok: true, simplificada, cliente, concepto, oficinaId, imp, clienteId: receptor.clienteId, empresaId: receptor.empresaId, clienteDatos, numero, hoy, vence };
}

// VISTA PREVIA: la factura tal como saldrá —mismos importes, receptor, número y el emisor de
// la oficina que factura, con su IBAN en el pie—, sin escribir nada ni gastar número.
export type EmisorVistaPrevia = { nombre: string; nif: string | null; domicilio: string | null; email: string | null; logo: string | null; iban: string | null };
export async function vistaPreviaFacturaManual(admin: Admin, workspaceId: string, body: CuerpoDocumento): Promise<{ ok: true; factura: Factura; emisor: EmisorVistaPrevia } | Fallo> {
  const pr = await prepararFacturaManual(admin, workspaceId, body);
  if (!pr.ok) return pr;
  const { imp } = pr;
  const e = await emisorParaOficina(admin, workspaceId, pr.oficinaId);
  const cuenta = await cuentaParaOficina(admin, workspaceId, pr.oficinaId).catch(() => null);
  const factura: Factura = {
    id: "vista-previa", numero: pr.numero, cliente: pr.cliente, concepto: pr.concepto, base: imp.baseImponible, iva: imp.iva, total: imp.total,
    estado: "EMITIDA", fecha: fmtFechaCorta(pr.hoy.toISOString()) ?? "", vence: fmtFechaCorta(pr.vence.toISOString()) ?? undefined,
    // Como al crearla: líneas, suplidos y notas solo en la factura avanzada.
    ...(body.avanzada ? { lineas: imp.lineas, suplidos: imp.suplidos, notas: body.notas?.trim() || null } : {}),
    clienteDatos: pr.clienteDatos,
    ...(imp.retencionPct ? { retencionPct: imp.retencionPct, retencion: imp.retencion } : {}),
    ...(pr.simplificada ? { simplificada: true } : {}),
  };
  return { ok: true, factura, emisor: { nombre: e.nombre || "Mi despacho", nif: e.nif ?? null, domicilio: e.domicilio ?? null, email: e.email ?? null, logo: e.logo ?? null, iban: cuenta?.iban ?? null } };
}

// La factura manual completa. Devuelve lo mismo que respondía la ruta antes de extraerla.
export async function crearFacturaManual(admin: Admin, workspaceId: string, body: CuerpoDocumento): Promise<{ ok: true; id: string; numero: string; respuesta: Record<string, unknown> } | Fallo> {
  const pr = await prepararFacturaManual(admin, workspaceId, body);
  if (!pr.ok) return pr;
  const { simplificada, cliente, concepto, oficinaId, clienteId, empresaId, clienteDatos, numero, hoy, vence } = pr;
  const { lineas: ls, suplidos: ss, baseImponible, iva, total, retencionPct, retencion } = pr.imp;
  const id = crypto.randomUUID();
  const row: Record<string, unknown> = {
    id, workspaceId, numero, ...(oficinaId ? { oficinaId } : {}),
    clienteNombre: cliente, concepto, baseImponible, iva, total, estado: "EMITIDA", origen: "MANUAL",
    fechaEmision: hoy.toISOString(), fechaVencimiento: vence.toISOString(),
    ...(body.avanzada ? { lineas: ls, suplidos: ss, notas: body.notas?.trim() || null } : {}),
    ...(clienteDatos ? { clienteDatos } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(empresaId ? { empresaId } : {}),
    ...(retencionPct ? { retencionPct, retencion } : {}),
    ...(simplificada ? { simplificada: true } : {}),
    // Emisor congelado: la identidad fiscal de la oficina elegida (o del despacho) tal como es hoy.
    emisorDatos: await emisorParaFijar(admin, workspaceId, oficinaId),
  };
  let { error } = await admin.from("Factura").insert(row);
  // Sin la columna, una simplificada NO nace como completa: se avisa de la migración.
  if (error && simplificada && /simplificada/i.test(error.message)) {
    return { ok: false, status: 500, error: "Falta la migración de facturas simplificadas: ejecuta supabase/factura-simplificada.sql." };
  }
  if (error && row.oficinaId && /oficinaId/i.test(error.message)) { delete row.oficinaId; ({ error } = await admin.from("Factura").insert(row)); }
  // Repli si falta alguna columna opcional (clienteDatos, clienteId, empresaId): la factura nace igual.
  if (error && /clienteDatos|clienteId|empresaId/i.test(error.message)) {
    delete row.clienteDatos; delete row.clienteId; delete row.empresaId;
    ({ error } = await admin.from("Factura").insert(row));
  }
  if (error && body.avanzada && /lineas|suplidos|notas/i.test(error.message)) {
    return { ok: false, status: 500, error: "Falta la migración de facturas avanzadas: ejecuta supabase/factura-lineas.sql." };
  }
  if (error) {
    const dup = /duplicate|unique/i.test(error.message);
    return { ok: false, status: dup ? 409 : 500, error: dup ? "Ese número de factura ya existe. Cámbialo." : error.message };
  }
  // VERI*FACTU: registro de alta (si el NIF emisor lo tiene activo). Nunca frena la emisión.
  const verifactu = await registrarAltaSiActivo(admin, id);
  return {
    ok: true, id, numero,
    respuesta: { ok: true, id, numero, fecha: fmtFechaCorta(hoy.toISOString()) ?? "", vence: fmtFechaCorta(vence.toISOString()), clienteDatos: row.clienteDatos ?? null, emisor: row.emisorDatos, retencionPct: retencionPct ?? null, retencion: retencion || null, aCobrar: aCobrar({ total, retencion }), simplificada, ...(verifactu ? { verifactu } : {}) },
  };
}
