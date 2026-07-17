import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosConfig } from "@/lib/data/config";
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

  // ⚠️ Dinero silencioso (mismo precedente que la ruta de cambio de servicio): una
  // factura automática YA PAGADA no se realinea (las EMITIDA sí, al siguiente paso
  // por /api/pagos). Si con el nuevo descuento lo cobrado ya no coincide con la
  // tarifa teórica, avisamos en el historial para que el gestor ajuste a mano.
  try {
    if (tarifaCtx) {
      const conDesc = aplicarDescuento(tarifaCtx.tarifa, tarifaCtx.nMiembros, valor);
      const teorica = { ANTICIPO: conDesc.anticipo, FINAL: conDesc.resto };
      const { data: pagadas } = await admin.from("Factura")
        .select("numero, baseImponible, momento")
        .eq("expedienteId", id).in("momento", ["ANTICIPO", "FINAL"]).eq("estado", "PAGADA").eq("origen", "AUTOMATICA");
      for (const f of (pagadas ?? []) as { numero: string; baseImponible: number | string; momento: "ANTICIPO" | "FINAL" }[]) {
        const base = Number(f.baseImponible) || 0;
        const debe = teorica[f.momento];
        // conDesc.bruto > 0: con tarifa sin configurar no hay teórica que comparar
        // (a diferencia de la ruta servicio, aquí un «debe» de 0 € por descuento sí es real).
        if (conDesc.bruto > 0 && Math.abs(debe - base) >= 0.01) {
          const etiqueta = f.momento === "ANTICIPO" ? "anticipo" : "liquidación final";
          await admin.from("ExpedienteEvento").insert({
            id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
            descripcion: `⚠️ La factura de ${etiqueta} (${f.numero}) ya está pagada sobre una base de ${base.toFixed(2)} € y con el descuento la tarifa teórica es ${debe.toFixed(2)} € — ajusta la diferencia manualmente desde Cobros.`,
          });
        }
      }
    }
  } catch { /* el aviso es best-effort, nunca bloquea el cambio */ }

  return NextResponse.json({ ok: true });
}
