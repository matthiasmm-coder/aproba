import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchDespacho } from "@/lib/data/config";
import { COLS_RECIBIDA, mapFilaRecibida } from "@/lib/facturas-recibidas-guardar";
import { isoDeFecha, motivoNoPagable } from "@/lib/facturas-recibidas";
import { generarPain001, validarOrden, totalOrden, ibanValido, type OrdenSepa } from "@/lib/sepa";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

// POST {ids: string[], fechaEjecucion?: AAAA-MM-DD} → fichero SEPA pain.001 con una
// transferencia por factura (ordenante = cuenta bancaria activa del despacho, Ajustes ›
// Facturación) y las facturas pasan a PAGADA con esa fecha y la referencia de la orden.
// Aproba NO mueve dinero: el gestor importa el fichero en su banca online y lo valida.
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: "Elige al menos una factura pendiente." }, { status: 400 });
  const hoy = isoDeFecha(new Date());
  const fechaEjecucion = typeof body?.fechaEjecucion === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fechaEjecucion) && body.fechaEjecucion >= hoy ? body.fechaEjecucion : hoy;

  // Facturas bajo RLS (solo las del despacho del usuario).
  const { data: filas, error } = await supabase.from("FacturaRecibida").select(`${COLS_RECIBIDA}, workspaceId`).in("id", ids);
  if (error) return NextResponse.json({ error: /column|schema cache/i.test(error.message) ? "Falta la migración: ejecuta supabase/facturas-recibidas-pago.sql." : error.message }, { status: 500 });
  const facturas = ((filas ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...mapFilaRecibida(r), workspaceId: String(r.workspaceId) }));
  if (facturas.length !== ids.length) return NextResponse.json({ error: "Alguna factura no existe o no es de tu despacho." }, { status: 404 });
  const wsIds = new Set(facturas.map((f) => f.workspaceId));
  if (wsIds.size !== 1) return NextResponse.json({ error: "Las facturas deben ser del mismo despacho." }, { status: 400 });
  const workspaceId = facturas[0].workspaceId;
  const noPagables = facturas.map((f) => ({ f, motivo: motivoNoPagable(f) })).filter((x) => x.motivo);
  if (noPagables.length) return NextResponse.json({ error: `No se puede incluir: ${noPagables.map((x) => `${x.f.proveedorNombre || x.f.archivoNombre} (${x.motivo})`).join("; ")}.` }, { status: 400 });

  // Ordenante: la cuenta activa de la sede de las facturas, si no la de la gestoría.
  const admin = createSupabaseAdmin();
  const oficinas = [...new Set(facturas.map((f) => f.oficinaId).filter((x): x is string => !!x))];
  let cuenta: { iban: string; titular: string } | null = null;
  let cuentas = await admin.from("CuentaBancaria").select("iban, titular, oficinaId").eq("workspaceId", workspaceId).eq("activa", true);
  if (cuentas.error && /oficinaId/i.test(cuentas.error.message)) cuentas = await admin.from("CuentaBancaria").select("iban, titular").eq("workspaceId", workspaceId).eq("activa", true) as typeof cuentas;
  const lista = ((cuentas.data ?? []) as { iban: string; titular: string; oficinaId?: string | null }[]);
  cuenta = (oficinas.length === 1 ? lista.find((c) => c.oficinaId === oficinas[0]) : undefined) ?? lista.find((c) => !c.oficinaId) ?? lista[0] ?? null;
  if (!cuenta) return NextResponse.json({ error: "Añade la cuenta bancaria del despacho en Ajustes › Facturación y métodos de pago (será el ordenante de las transferencias).", code: "SIN_CUENTA" }, { status: 400 });
  if (!ibanValido(cuenta.iban)) return NextResponse.json({ error: `El IBAN de la cuenta activa del despacho (${cuenta.iban}) no es válido: corrígelo en Ajustes › Facturación y métodos de pago.`, code: "IBAN_DESPACHO" }, { status: 400 });

  const despacho = await fetchDespacho();
  const msgId = `APROBA-${hoy.replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const orden: OrdenSepa = {
    msgId, creado: new Date(),
    ordenante: { nombre: cuenta.titular || despacho.nombre, nif: despacho.nif ?? null, iban: cuenta.iban },
    fechaEjecucion,
    transferencias: facturas.map((f) => ({
      endToEndId: `FR-${(f.numero || f.id.slice(0, 8)).replace(/[^A-Za-z0-9-]+/g, "-")}`.slice(0, 35),
      importe: f.total as number,
      acreedor: f.proveedorNombre,
      iban: f.proveedorIban,
      concepto: `Factura ${f.numero || ""} ${f.proveedorNombre}`.trim(),
    })),
  };
  const errores = validarOrden(orden);
  if (errores.length) return NextResponse.json({ error: errores.join(" ") }, { status: 400 });
  const xml = generarPain001(orden);

  // El fichero ya está generado: las facturas quedan pagadas con la fecha de ejecución y la
  // referencia de la orden (reversible desde «Editar» si el banco la rechaza).
  const up = await admin.from("FacturaRecibida").update({ estado: "PAGADA", fechaPago: fechaEjecucion, ordenPago: msgId, updatedAt: new Date().toISOString() }).in("id", ids).eq("workspaceId", workspaceId);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, xml, nombre: `transferencias_${fechaEjecucion}_${msgId.slice(-6)}.xml`, n: orden.transferencias.length, total: totalOrden(orden), msgId, fechaEjecucion });
}
