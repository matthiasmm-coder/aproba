import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";
import { ivaDe, totalDe } from "@/lib/facturas";
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
const SELECT_EXP = "id, workspaceId, tipo, servicioClave, referencia, cliente:Cliente(nombre, apellidos)";
type ExpRow = { id: string; workspaceId: string; tipo: string; servicioClave?: string | null; referencia: string; cliente: { nombre?: string; apellidos?: string } | null };

export async function POST(req: Request) {
  let body: { token?: string; expedienteId?: string; momento?: string };
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
  if (body.token?.trim()) {
    // Portal del cliente: el token es único.
    const { data, error } = await admin.from("Expediente").select(SELECT_EXP).eq("portalToken", body.token.trim()).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    exp = data as ExpRow | null;
  } else if (body.expedienteId?.trim()) {
    // Gestor: lectura bajo RLS → solo resuelve si el usuario es miembro de su workspace.
    const supa = await createSupabaseServer();
    const { data: auth } = await supa.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const { data, error } = await supa.from("Expediente").select(SELECT_EXP).eq("id", body.expedienteId.trim()).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    exp = data as ExpRow | null;
  } else {
    return NextResponse.json({ error: "token o expedienteId requerido" }, { status: 400 });
  }
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

  // Tarifa del servicio — config réelle du workspace (table ServicioConfig).
  const servicios = await fetchServiciosDeWorkspace(admin, exp.workspaceId);
  // Service retrouvé par sa clave mémorisée (gère les services custom / tipo OTRO),
  // avec repli sur le mapping par type pour les anciens expedientes.
  const servicio = servicios.find((s) => s.id === ((exp as { servicioClave?: string | null }).servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
  const base = momento === "ANTICIPO" ? servicio?.anticipo ?? 0 : servicio?.resto ?? 0;
  if (base <= 0) {
    return NextResponse.json({ error: "Este servicio no tiene pago configurado en este momento" }, { status: 400 });
  }

  // Idempotence : un seul paiement par (expediente, momento).
  const { data: previa, error: e2 } = await admin
    .from("Factura")
    .select("numero, total")
    .eq("expedienteId", exp.id)
    .eq("momento", momento)
    .maybeSingle();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  if (previa) {
    return NextResponse.json({ ok: true, yaExistia: true, numero: previa.numero, total: Number(previa.total) });
  }

  // Numérotation séquentielle de l'année.
  const year = new Date().getFullYear();
  const { data: last, error: e3 } = await admin
    .from("Factura")
    .select("numero")
    .eq("workspaceId", exp.workspaceId)
    .like("numero", `${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  const numero = `${year}-${String((last ? Number(last.numero.split("-")[1]) : 0) + 1).padStart(4, "0")}`;

  const cliente = exp.cliente as { nombre?: string; apellidos?: string } | null;
  const clienteNombre = `${cliente?.nombre ?? ""} ${cliente?.apellidos ?? ""}`.trim() || "Cliente";
  const etiqueta = momento === "ANTICIPO" ? "Anticipo" : "Liquidación final";
  const concepto = `${etiqueta} — ${TIPO_LABEL[exp.tipo] ?? exp.tipo} (${exp.referencia})`;
  const total = totalDe(base);

  // La facture est ÉMISE (pas payée) : le client paie par virement. Échéance à 14 jours.
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + 14 * 864e5);
  const facturaId = uuid();
  const { error: e4 } = await admin.from("Factura").insert({
    id: facturaId,
    workspaceId: exp.workspaceId,
    expedienteId: exp.id,
    numero,
    clienteNombre,
    concepto,
    baseImponible: base,
    iva: ivaDe(base),
    total,
    estado: "EMITIDA",
    origen: "AUTOMATICA",
    momento,
    metodoPago: "TRANSFERENCIA",
    fechaEmision: ahora.toISOString(),
    fechaVencimiento: vencimiento.toISOString(),
  });
  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });

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

  return NextResponse.json({ ok: true, numero, total, estado: "EMITIDA" });
}
