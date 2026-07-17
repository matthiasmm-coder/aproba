import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosConfig } from "@/lib/data/config";
import { honorariosCobrados, tieneCuotas } from "@/lib/facturas";
import { aplicarDescuento, descuentoValido, etiquetaDescuento, serviciosDeExpediente, suplidosDeExpediente, tarifaDeServicios } from "@/lib/multi-servicio";

// El gestor aplica un descuento a ESTE expediente (packs familiares, varios servicios) —
// pedido por Juan. Se guarda en Expediente.descuento y alimenta la ficha, la primera
// factura, la hoja de encargo y el presupuesto del portal. Sesión + RLS (anti-IDOR).
//   body.descuento = { tipo: "PORCENTAJE"|"IMPORTE", valor, motivo? } → aplicar
//   body.descuento = null                                             → quitar
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { descuento?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }

  // null explícito = quitar; si no, DEBE ser un descuento válido (no vaciar por un body malformado).
  let valor: ReturnType<typeof descuentoValido> = null;
  if (body.descuento !== null) {
    valor = descuentoValido(body.descuento);
    if (!valor) return NextResponse.json({ error: "Descuento inválido: usa un porcentaje (1-100) o un importe en euros mayor que 0." }, { status: 400 });
    if (valor.motivo && valor.motivo.length > 120) return NextResponse.json({ error: "El motivo es demasiado largo." }, { status: 400 });
  }

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Bajo RLS: solo resuelve si el expediente es del workspace del gestor.
  const { data: exp, error: eSel } = await supa.from("Expediente").select("id, descuento").eq("id", id).maybeSingle();
  if (eSel) {
    const falta = /descuento|schema cache|column/i.test(eSel.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/expediente-descuento.sql en Supabase." : eSel.message }, { status: falta ? 409 : 500 });
  }
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();

  // Contexto de tarifa (best-effort: si algo falla, el descuento se guarda igual —
  // estos datos solo alimentan la guarda de tasas y el aviso de facturas pagadas).
  let tarifaCtx: { tarifa: { anticipo: number; resto: number }; nMiembros: number; conSuplidos: boolean } | null = null;
  try {
    const [{ data: full }, { servicios }] = await Promise.all([
      admin.from("Expediente").select("tipo, servicioClave, serviciosExtra, suplidosOverride, familiaId").eq("id", id).maybeSingle(),
      fetchServiciosConfig(),
    ]);
    if (full) {
      const f = full as { tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null; suplidosOverride?: { concepto: string; importe: number }[] | null; familiaId: string | null };
      const svs = serviciosDeExpediente(f, servicios);
      let nMiembros = 1;
      if (f.familiaId) {
        const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", f.familiaId);
        nMiembros = Math.max(1, count ?? 1);
      }
      tarifaCtx = { tarifa: tarifaDeServicios(svs), nMiembros, conSuplidos: suplidosDeExpediente(f.suplidosOverride, svs).length > 0 };
    }
  } catch { /* sin contexto: se omiten guarda y aviso */ }

  // Guarda: un descuento que deja los honorarios en 0 € haría infacturables las
  // tasas/suplidos (viajan en la primera factura automática y el portal saltaría el
  // paso de pago). Solo se bloquea si HAY suplidos; un «gratis» sin tasas es legítimo.
  if (valor && tarifaCtx?.conSuplidos) {
    const previa = aplicarDescuento(tarifaCtx.tarifa, tarifaCtx.nMiembros, valor);
    if (previa.bruto > 0 && previa.anticipo + previa.resto <= 0) {
      return NextResponse.json({ error: "Con este descuento los honorarios quedan en 0 € y las tasas/suplidos del expediente no se podrían facturar (van en la primera factura). Deja al menos 0,01 € de honorarios o quita los suplidos." }, { status: 400 });
    }
  }

  const { error } = await admin.from("Expediente").update({ descuento: valor, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) {
    const falta = /descuento|schema cache|column/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la migración: ejecuta supabase/expediente-descuento.sql en Supabase." : error.message }, { status: falta ? 409 : 500 });
  }

  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
    descripcion: valor
      ? `Descuento aplicado: ${etiquetaDescuento(valor)}${valor.motivo ? ` (${valor.motivo})` : ""}`
      : "Descuento retirado",
    userId: user.id,
  });

  // Si el anticipo ya está cobrado, el descuento que le tocaba cae ENTERO en el pago
  // final (restoPendiente): el cliente acaba pagando el total rebajado sin que nadie
  // toque una factura pagada. Solo queda un caso que ninguna factura de cobro puede
  // expresar: que YA haya pagado más que el total rebajado (descuento muy grande, o
  // expediente enteramente cobrado). Eso es una DEVOLUCIÓN → aviso en el historial.
  try {
    if (tarifaCtx) {
      const conDesc = aplicarDescuento(tarifaCtx.tarifa, tarifaCtx.nMiembros, valor);
      const total = Math.round((conDesc.anticipo + conDesc.resto) * 100) / 100;
      const { data: fRows } = await admin.from("Factura")
        .select("momento, estado, baseImponible")
        .eq("expedienteId", id);
      const facturas = (fRows ?? []) as { momento: string | null; estado: string; baseImponible: number | string | null }[];
      const cobrado = honorariosCobrados(facturas);
      // conDesc.bruto > 0: sin tarifa configurada no hay total con el que comparar.
      if (conDesc.bruto > 0 && cobrado - total > 0.005) {
        const devolver = Math.round((cobrado - total) * 100) / 100;
        await admin.from("ExpedienteEvento").insert({
          id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
          descripcion: `⚠️ El cliente ya ha pagado ${cobrado.toFixed(2)} € de honorarios y con el descuento el total es ${total.toFixed(2)} € — no queda pago final donde aplicarlo: devuélvele ${devolver.toFixed(2)} € (+ IVA) o compénsalo en otro expediente.`,
        });
      } else if (valor && conDesc.bruto > 0 && tieneCuotas(facturas)) {
        // Las cuotas ya emitidas NO se realinean (a diferencia del pago final): si no lo
        // decimos, el descuento simplemente no llega al cliente y nadie se entera.
        const pendiente = Math.round((total - cobrado) * 100) / 100;
        await admin.from("ExpedienteEvento").insert({
          id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
          descripcion: `⚠️ Este expediente se cobra en cuotas y el descuento NO las modifica: quedan ${pendiente.toFixed(2)} € de honorarios por cobrar (total con descuento ${total.toFixed(2)} €, ya pagados ${cobrado.toFixed(2)} €). Ajusta las cuotas pendientes a mano desde Cobros.`,
        });
      }
    }
  } catch { /* el aviso es best-effort, nunca bloquea el cambio */ }

  return NextResponse.json({ ok: true });
}
