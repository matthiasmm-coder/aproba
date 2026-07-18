import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_LABEL } from "@/lib/tramites";
import { serviciosDeExpediente, labelServicios, aplicarDescuento, asignacionValida, descuentoValido, restoPendiente, suplidosAsignados, tarifaAsignada } from "@/lib/multi-servicio";
import { anticipoPagado, datosFiscalesDeCliente, ivaDe, totalDe, totalesFactura, r2 } from "@/lib/facturas";
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
// La jointure cliente lleva también los datos fiscales (documento + dirección) para el
// snapshot de la factura; el último repli (CLI_MIN) vuelve al par nombre/apellidos si
// alguna columna de la ficha faltara en una base antigua.
const JOIN_CLI = "cliente:Cliente(nombre, apellidos, numeroDocumento, pasaporte, via, numeroVia, piso, codigoPostal, municipio, provincia)";
const JOIN_CLI_MIN = "cliente:Cliente(nombre, apellidos)";
const SELECT_EXP = `id, workspaceId, tipo, servicioClave, serviciosExtra, suplidosOverride, descuento, serviciosAsignacion, referencia, familiaId, ${JOIN_CLI}`;
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
  const SELECT_EXP_SIN_ASIG = SELECT_EXP.replace(", serviciosAsignacion", "");
  const SELECT_EXP_SIN_DESC = SELECT_EXP_SIN_ASIG.replace(", descuento", "");
  const SELECT_EXP_SIN_SUP = SELECT_EXP_SIN_DESC.replace(", suplidosOverride", "");
  const SELECT_EXP_SIN_EXTRAS = SELECT_EXP_SIN_SUP.replace(", serviciosExtra", "");
  const SELECT_EXP_SIN_FAMILIA = SELECT_EXP_SIN_EXTRAS.replace(", familiaId", "");
  const SELECT_EXP_CLI_MIN = SELECT_EXP_SIN_FAMILIA.replace(JOIN_CLI, JOIN_CLI_MIN);
  if (body.token?.trim()) {
    // Portal del cliente: el token es único.
    let res = await admin.from("Expediente").select(SELECT_EXP).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_ASIG).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_DESC).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_SUP).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_EXTRAS).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_SIN_FAMILIA).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select(SELECT_EXP_CLI_MIN).eq("portalToken", body.token.trim()).maybeSingle();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    exp = res.data as unknown as ExpRow | null;
  } else if (body.expedienteId?.trim()) {
    // Gestor: lectura bajo RLS → solo resuelve si el usuario es miembro de su workspace.
    const supa = await createSupabaseServer();
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    let res = await supa.from("Expediente").select(SELECT_EXP).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_ASIG).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_DESC).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_SUP).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_EXTRAS).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_SIN_FAMILIA).eq("id", body.expedienteId.trim()).maybeSingle();
    if (res.error) res = await supa.from("Expediente").select(SELECT_EXP_CLI_MIN).eq("id", body.expedienteId.trim()).maybeSingle();
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
    // Tarifa — config real del workspace (ServicioConfig). Multi-servicio: cada servicio
    // × SUS miembros asignados (familia heterogénea, pedido de Juan); sin asignación,
    // todos los servicios ×N — el comportamiento clásico, garantizado por tarifaAsignada.
    const catalogo = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
    const serviciosExp = serviciosDeExpediente({ servicioClave: exp.servicioClave, serviciosExtra: exp.serviciosExtra, tipo: exp.tipo }, catalogo);
    const asignacion = asignacionValida((exp as { serviciosAsignacion?: unknown }).serviciosAsignacion);
    const tarifa = tarifaAsignada(serviciosExp, asignacion, nMiembros);
    // Descuento del expediente (pedido por Juan): rebaja los honorarios sobre la tarifa
    // YA multiplicada (nMiembros=1 aquí); reparto proporcional anticipo/resto con
    // coherencia al céntimo (mismo helper que la ficha, el portal y la hoja de encargo).
    const conDescuento = aplicarDescuento(tarifa, 1, descuentoValido((exp as { descuento?: unknown }).descuento));
    let b: number;
    if (momento === "ANTICIPO") {
      b = conDescuento.anticipo;
    } else {
      // Pago final: si el anticipo YA está pagado, su factura no se puede reescribir —
      // el descuento que le tocaba cae entero aquí para que el cliente acabe pagando
      // exactamente el total rebajado (restoPendiente). Si aún no está pagado, es su
      // parte proporcional y la factura del anticipo se realinea sola más abajo.
      const { data: fPagadas } = await admin.from("Factura")
        .select("momento, estado, baseImponible")
        .eq("expedienteId", exp.id).eq("momento", "ANTICIPO").eq("estado", "PAGADA");
      b = restoPendiente(conDescuento, anticipoPagado((fPagadas ?? []) as { momento: string | null; estado: string; baseImponible: number | string | null }[]));
    }
    // b <= 0 por el DESCUENTO (la tarifa sí está configurada) no es lo mismo que un
    // servicio sin pago en este momento: decirlo mal manda al gestor a Ajustes a buscar
    // una tarifa que está bien. Fail-closed en ambos casos: nunca se cobra de más.
    if (b <= 0) {
      const porDescuento = conDescuento.bruto > 0 && conDescuento.rebaja > 0;
      return NextResponse.json({
        error: porDescuento
          ? "Con el descuento no queda nada por cobrar en este momento (el cliente ya ha pagado el total rebajado o más). Revisa el descuento del expediente."
          : "Este servicio no tiene pago configurado en este momento",
      }, { status: 400 });
    }
    // Tasas y suplidos del servicio (SIN IVA, art. 78.Tres.3º LIVA): van en la PRIMERA
    // factura del expediente — el anticipo si lo hay (provisión de fondos), si no el
    // pago final. Cada tasa ×(miembros de SU servicio); el override manual, global ×N.
    const esPrimera = momento === "ANTICIPO" || tarifa.anticipo <= 0;
    if (esPrimera) {
      const sup = suplidosAsignados(exp.suplidosOverride, serviciosExp, asignacion, nMiembros);
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
      // El realineado también refresca el snapshot fiscal: la factura sigue sin pagar,
      // y así una emitida antes de la migración recoge los datos del cliente.
      const clienteDatos = datosFiscalesDeCliente(exp.cliente as Parameters<typeof datosFiscalesDeCliente>[0]);
      let { error: eUp } = await admin.from("Factura").update({ baseImponible, iva, total, concepto, suplidos: suplidos ?? null, ...(clienteDatos ? { clienteDatos } : {}) }).eq("id", previa.id).eq("estado", "EMITIDA");
      if (eUp && clienteDatos && /clienteDatos/i.test(eUp.message)) {
        // Columna sin migrar: el realineado (dinero) no puede fallar por el snapshot.
        eUp = (await admin.from("Factura").update({ baseImponible, iva, total, concepto, suplidos: suplidos ?? null }).eq("id", previa.id).eq("estado", "EMITIDA")).error;
      }
      if (!eUp) {
        await admin.from("ExpedienteEvento").insert({
          id: uuid(),
          expedienteId: exp.id,
          tipo: "COMENTARIO",
          descripcion: `📄 Factura ${previa.numero} actualizada: ${Number(previa.total).toFixed(2)} € → ${total.toFixed(2)} € (cambio de miembros, de servicios o de descuento)`,
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
  // Snapshot fiscal del cliente (documento + dirección), congelado al emitir.
  const clienteDatos = datosFiscalesDeCliente(exp.cliente as Parameters<typeof datosFiscalesDeCliente>[0]);
  const payloadBase = {
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
  };
  let { error: e4 } = await admin.from("Factura").insert({
    ...payloadBase,
    ...(clienteDatos ? { clienteDatos } : {}),
    ...(exp.familiaId ? { familiaId: exp.familiaId } : {}),
  });
  // Repli: si la migración factura-cliente-datos.sql no está ejecutada, reintenta sin
  // el snapshot — la emisión NUNCA debe romperse por una columna opcional.
  if (e4 && clienteDatos && /clienteDatos/i.test(e4.message)) {
    const retry = await admin.from("Factura").insert({ ...payloadBase, ...(exp.familiaId ? { familiaId: exp.familiaId } : {}) });
    e4 = retry.error;
  }
  // Repli: si la migración factura-familia.sql no está ejecutada (columna
  // familiaId ausente), reintenta sin el vínculo — la factura no puede perderse.
  if (e4 && exp.familiaId && /familiaId/i.test(e4.message)) {
    const retry = await admin.from("Factura").insert(payloadBase);
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
