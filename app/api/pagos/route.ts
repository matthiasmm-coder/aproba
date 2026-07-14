import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_LABEL } from "@/lib/tramites";
import { serviciosDeExpediente, tarifaDeServicios, labelServicios, suplidosDeExpediente } from "@/lib/multi-servicio";
import { ivaDe, totalDe, totalesFactura, r2 } from "@/lib/facturas";
import { enviarSeguimiento, enviarSolicitudPago } from "@/lib/notificaciones";
import { baseUrlFromRequest } from "@/lib/base-url";

// Paiement du client (portail) → factura générée automatiquement.
//  • momento ANTICIPO : à l'onboarding, après l'envoi des documents.
//  • momento FINAL    : à la clôture du trámite.
// Le montant vient de la config tarifaire du service (anticipo / resto) ;
// 0 € à un moment donné = pas de paiement demandé à ce moment-là.
//
// El expediente se identifica de forma INEQUÍVOCA: por token (portal del cliente)
// o por id + sesión del gestor (RLS). NUNCA por referencia (que NO es única entre
// workspaces → cobraría/facturaría desde otro despacho). El cobro real por tarjeta
// (webhook PSP) queda como evolución; hoy se emite factura para pago por transferencia.

const uuid = () => crypto.randomUUID();
const SELECT_EXP = "id, workspaceId, tipo, servicioClave, serviciosExtra, suplidosOverride, referencia, familiaId, cliente:Cliente(nombre, apellidos)";
type ExpRow = { id: string; workspaceId: string; tipo: string; servicioClave?: string | null; serviciosExtra?: string[] | null; suplidosOverride?: { concepto: string; importe: number }[] | null; referencia: string; familiaId?: string | null; cliente: { nombre?: string; apellidos?: string } | null };

export async function POST(req: Request) {
  let body: {
    token?: string; expedienteId?: string; momento?: string;
    // Factura editada desde el popup del gestor (opcional). Si falta → automática por tarifa.
    factura?: { numero?: string; clienteNombre?: string; concepto?: string; baseImponible?: number; lineas?: { concepto: string; base: number }[]; suplidos?: { concepto: string; importe: number }[]; notas?: string | null };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const momento = body.momento === "FINAL" ? "FINAL" : body.momento === "ANTICIPO" ? "ANTICIPO" : null;
  if (!momento) {
    return NextResponse.json({ error: "momento (ANTICIPO|FINAL) requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  let exp: ExpRow | null = null;
  let viaGestor = false; // solo el gestor autenticado puede editar la factura
  // Repli sin familiaId si la migración expediente-familia.sql no está aplicada:
  // la emisión de facturas NUNCA debe romperse por una columna opcional.
  const SELECT_EXP_SIN_SUP = SELECT_EXP.replace(", suplidosOverride", "");
  const SELECT_EXP_SIN_EXTRAS = SELECT_EXP_SIN_SUP.replace(", serviciosExtra", "");
  const SELECT_EXP_SIN_FAMILIA = SELECT_EXP_SIN_EXTRAS.replace(", familiaId", "");
  if (body.token?.trim()) {
    // Portal del cliente: el token es único.
    let res = await admin.from("Expediente").select(SELECT_EXP).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_SUP).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_EXTRAS).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_FAMILIA).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    exp = res.data as unknown as ExpRow | null;
  } else if (body.expedienteId?.trim()) {
    // Gestor: lectura bajo RLS → solo resuelve si el usuario es miembro de su workspace.
    const supa = await createSupabaseServer();
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    let res = await supa.from("Expediente").select(SELECT_EXP).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_SUP).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_EXTRAS).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_FAMILIA).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    exp = res.data as unknown as ExpRow | null;
    viaGestor = true;
  } else {
    return NextResponse.json({ error: "token o expedienteId requerido" }, { status: 400 });
  }
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

  // Importe de la factura. Por defecto sale de la tarifa del servicio; si el gestor envía
  // una factura editada desde el popup (body.factura), se usa ÉSA — recalculando los totales
  // en el SERVIDOR (no nos fiamos del cliente) con la regla suplidos-sin-IVA.
  // SEGURIDAD: la factura editable solo se acepta del gestor autenticado, NUNCA del portal
  // del cliente (token) — si no, un cliente podría fijarse su propio importe.
  const fac = viaGestor ? body.factura : undefined;

  // Expediente FAMILIAR: la tarifa del servicio es POR MIEMBRO → la factura
  // automática multiplica por el nº de miembros. (La factura editada por el
  // gestor NO se multiplica: él fija el importe que quiere.)
  let nMiembros = 1;
  if (exp.familiaId) {
    const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", exp.familiaId);
    nMiembros = Math.max(1, count ?? 1);
  }

  let baseImponible: number, iva: number, total: number;
  let etiquetaServicios = TIPO_LABEL[exp.tipo] ?? exp.tipo; // composite si multi-servicio
  let lineas: { concepto: string; base: number }[] | null = null;
  let suplidos: { concepto: string; importe: number }[] | null = null;
  let notas: string | null = null;

  if (fac) {
    const ls = Array.isArray(fac.lineas) ? fac.lineas.filter((l) => l?.concepto?.trim() && Number(l.base) > 0) : [];
    if (ls.length) {
      const ss = Array.isArray(fac.suplidos) ? fac.suplidos.filter((s) => s?.concepto?.trim() && Number(s.importe) > 0) : [];
      const tt = totalesFactura(ls, ss);
      baseImponible = tt.base; iva = tt.iva; total = tt.total;
      lineas = ls; suplidos = ss; notas = fac.notas?.trim() || null;
    } else {
      baseImponible = Number(fac.baseImponible) || 0; iva = ivaDe(baseImponible); total = totalDe(baseImponible);
    }
    if (total <= 0) return NextResponse.json({ error: "El importe de la factura debe ser mayor que 0" }, { status: 400 });
  } else {
    // Tarifa — config real del workspace (ServicioConfig). Multi-servicio: la factura
    // automática cobra la SUMA de las tarifas (principal + extras), después ×N miembros.
    const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
    const serviciosExp = serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipo }, catalogo);
    const tarifa = tarifaDeServicios(serviciosExp);
    const b = (momento === "ANTICIPO" ? tarifa.anticipo : tarifa.resto) * nMiembros;
    if (b <= 0) return NextResponse.json({ error: "Este servicio no tiene pago configurado en este momento" }, { status: 400 });
    // Tasas y suplidos del servicio (SIN IVA, art. 78.Tres.3º LIVA): van en la PRIMERA
    // factura del expediente — el anticipo si lo hay (provisión de fondos), si no el
    // pago final. ×N miembros en familia (cada solicitante paga su tasa).
    const esPrimera = momento === "ANTICIPO" || tarifa.anticipo <= 0;
    if (esPrimera) {
      const sup = suplidosDeExpediente(exp.suplidosOverride, serviciosExp).map((x) => ({
        concepto: nMiembros > 1 ? `${x.concepto} (×${nMiembros})` : x.concepto,
        importe: r2(x.importe * nMiembros),
      }));
      if (sup.length) suplidos = sup;
    }
    baseImponible = b; iva = ivaDe(b);
    const suplidosTotal = (suplidos ?? []).reduce((a, x) => a + x.importe, 0);
    total = r2(totalDe(b) + suplidosTotal);
    etiquetaServicios = labelServicios(serviciosExp, TIPO_LABEL[exp.tipo] ?? exp.tipo);
  }

  const etiqueta = momento === "ANTICIPO" ? "Anticipo" : "Liquidación final";
  const familiaSufijo = exp.familiaId && nMiembros > 1 && !fac ? ` · familia, ${nMiembros} miembros` : "";
  const concepto = fac?.concepto?.trim() || `${etiqueta} — ${etiquetaServicios} (${exp.referencia})${familiaSufijo}`;

  // Guarda simétrica al fraccionado: con un plan de cuotas activo, el pago FINAL sería un
  // doble cobro del mismo resto (fraccionar ya bloquea en sentido inverso).
  if (momento === "FINAL") {
    const { data: cuota } = await admin.from("Factura").select("id, estado").eq("expedienteId", exp.id)
      .like("momento", "CUOTA_%").neq("estado", "ANULADA").limit(1).maybeSingle();
    if (cuota) return NextResponse.json({ error: "Este expediente tiene un plan de cuotas activo; el pago final duplicaría el cobro." }, { status: 409 });
  }

  // Idempotence : un seul paiement par (expediente, momento). Para reeditar una factura ya
  // emitida, el gestor usa el endpoint de edición (PUT /api/facturas/[id]), no éste.
  const { data: previa, error: e2 } = await admin.from("Factura").select("id, numero, total, estado, origen").eq("expedienteId", exp.id).eq("momento", momento).maybeSingle();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  if (previa) {
    // La familia O LOS SERVICIOS pueden haber cambiado ENTRE la emisión y este reintento
    // (quitar/añadir miembro o servicio y volver al pago): si la factura automática sigue
    // EMITIDA y su total ya no corresponde a la tarifa actual, la REALINEAMOS antes de
    // devolverla — si no, Stripe cobraría un importe distinto del que el portal muestra.
    const editadaPorGestor = previa.origen !== "AUTOMATICA";
    if (!fac && !editadaPorGestor && previa.estado === "EMITIDA" && Number(previa.total) !== total) {
      const { error: eUp } = await admin.from("Factura").update({ baseImponible, iva, total, concepto, suplidos: suplidos ?? null }).eq("id", previa.id).eq("estado", "EMITIDA");
      if (!eUp) {
        await admin.from("ExpedienteEvento").insert({
          id: uuid(),
          expedienteId: exp.id,
          tipo: "COMENTARIO",
          descripcion: `📄 Factura ${previa.numero} actualizada: ${Number(previa.total).toFixed(2)} € → ${total.toFixed(2)} € (cambio de miembros o de servicios)`,
        });
        return NextResponse.json({ ok: true, yaExistia: true, facturaId: previa.id, numero: previa.numero, total, estado: "EMITIDA" });
      }
    }
    return NextResponse.json({ ok: true, yaExistia: true, facturaId: previa.id, numero: previa.numero, total: Number(previa.total), estado: previa.estado });
  }

  // Numérotation séquentielle de l'année (salvo nº personalizado del popup).
  const year = new Date().getFullYear();
  let numero = fac?.numero?.trim() || "";
  if (!numero) {
    const { data: last, error: e3 } = await admin.from("Factura").select("numero").eq("workspaceId", exp.workspaceId).like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle();
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
    numero = `${year}-${String((last ? Number(last.numero.split("-")[1]) : 0) + 1).padStart(4, "0")}`;
  }

  const cliente = exp.cliente as { nombre?: string; apellidos?: string } | null;
  const clienteAuto = `${cliente?.nombre ?? ""} ${cliente?.apellidos ?? ""}`.trim() || "Cliente";
  const clienteNombre = fac?.clienteNombre?.trim() || clienteAuto;

  // La facture est ÉMISE (pas payée) : le client paie par virement. Échéance à 14 jours.
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + 14 * 864e5);
  const facturaId = uuid();
  let { error: e4 } = await admin.from("Factura").insert({
    id: facturaId,
    workspaceId: exp.workspaceId,
    expedienteId: exp.id,
    numero,
    clienteNombre,
    concepto,
    baseImponible,
    iva,
    total,
    estado: "EMITIDA",
    origen: "AUTOMATICA",
    momento,
    metodoPago: "TRANSFERENCIA",
    fechaEmision: ahora.toISOString(),
    fechaVencimiento: vencimiento.toISOString(),
    ...(lineas || suplidos?.length ? { lineas, suplidos, notas } : {}),
    ...(exp.familiaId ? { familiaId: exp.familiaId } : {}),
  });
  // Repli: si la migración factura-familia.sql no está ejecutada (columna
  // familiaId ausente), reintenta sin el vínculo — la factura no puede perderse.
  if (e4 && exp.familiaId && /familiaId/i.test(e4.message)) {
    const retry = await admin.from("Factura").insert({
      id: facturaId, workspaceId: exp.workspaceId, expedienteId: exp.id, numero,
      clienteNombre, concepto, baseImponible, iva, total,
      estado: "EMITIDA", origen: "AUTOMATICA", momento, metodoPago: "TRANSFERENCIA",
      fechaEmision: ahora.toISOString(), fechaVencimiento: vencimiento.toISOString(),
      ...(lineas || suplidos?.length ? { lineas, suplidos, notas } : {}),
    });
    e4 = retry.error;
  }
  if (e4) {
    // Carrera de doble emisión: si el índice único opcional (expediente, momento) salta,
    // la factura ya existía → devolvemos esa, no un error.
    if (/Factura_expediente_momento_key/i.test(e4.message)) {
      const { data: ya } = await admin.from("Factura").select("id, numero, total").eq("expedienteId", exp.id).eq("momento", momento).maybeSingle();
      if (ya) return NextResponse.json({ ok: true, yaExistia: true, facturaId: ya.id, numero: ya.numero, total: Number(ya.total) });
    }
    const dup = /duplicate|unique/i.test(e4.message);
    return NextResponse.json({ error: dup ? "Ese número de factura ya existe. Cámbialo." : e4.message }, { status: dup ? 409 : 500 });
  }

  // Trace dans l'historial de l'expediente.
  await admin.from("ExpedienteEvento").insert({
    id: uuid(),
    expedienteId: exp.id,
    tipo: "COMENTARIO",
    descripcion: `📄 Factura ${numero} emitida (${momento === "ANTICIPO" ? "anticipo" : "pago final"}) · pendiente de pago por transferencia`,
  });

  const baseUrl = baseUrlFromRequest(req);
  // Email au client : facture + coordonnées bancaires (IBAN) pour payer par virement.
  await enviarSolicitudPago(admin, { expedienteId: exp.id, facturaId, numero, total, concepto, baseUrl });
  // Au premier paiement demandé, on (re)donne aussi le lien de suivi.
  if (momento === "ANTICIPO") {
    await enviarSeguimiento(admin, { expedienteId: exp.id, baseUrl });
  }

  return NextResponse.json({ ok: true, facturaId, numero, total, estado: "EMITIDA" });
}
