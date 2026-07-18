import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosConfig } from "@/lib/data/config";
import { aplicarDescuento, asignacionValida, descuentoValido, restoPendiente, tarifaAsignada } from "@/lib/multi-servicio";
import { SERVICIO_A_TIPO, TIPO_LABEL } from "@/lib/tramites";
import { reconciliarProgresoDocs } from "@/lib/documentos-upload";

// El GESTOR corrige los servicios de un expediente desde su ficha: el PRINCIPAL (clave —
// pilota el enum tipo, la hoja de encargo y Vigía) y/o los ADICIONALES (extras — suman
// docs requeridos, formularios y tarifa). Sesión + RLS (anti-IDOR). NO toca el estado
// directamente, pero la reconciliación posterior puede promover/degradar entre estados
// de recogida si la unión de documentos requeridos cambió.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clave?: string; label?: string; extras?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const clave = (body.clave ?? "").trim();
  const extrasIn = Array.isArray(body.extras)
    ? [...new Set(body.extras.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))]
    : null;
  if (!clave && extrasIn === null) return NextResponse.json({ error: "Falta el servicio." }, { status: 400 });

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Lectura defensiva: la columna serviciosExtra puede no existir (migración pendiente).
  // El repli está GATED por el mensaje (patrón de fetchExpedienteDetalle): un error
  // transitorio (503, timeout) NO debe pasar por «columna ausente» — aquí esa confusión
  // decidiría una ESCRITURA equivocada (falso 409, quitar extras perdido en silencio).
  let q = await supa.from("Expediente").select("id, familiaId, servicioClave, serviciosExtra, descuento, serviciosAsignacion").eq("id", id).maybeSingle();
  if (q.error && /serviciosAsignacion|column|schema cache/i.test(q.error.message)) {
    q = await supa.from("Expediente").select("id, familiaId, servicioClave, serviciosExtra, descuento").eq("id", id).maybeSingle() as typeof q;
  }
  if (q.error && /descuento|column|schema cache/i.test(q.error.message)) {
    q = await supa.from("Expediente").select("id, familiaId, servicioClave, serviciosExtra").eq("id", id).maybeSingle() as typeof q;
  }
  const faltaColumna = Boolean(q.error && /serviciosExtra|column|schema cache/i.test(q.error.message));
  if (q.error && !faltaColumna) return NextResponse.json({ error: q.error.message }, { status: 500 });
  if (faltaColumna) q = await supa.from("Expediente").select("id, familiaId, servicioClave").eq("id", id).maybeSingle() as typeof q;
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 500 });
  const columnaExtras = !faltaColumna;
  const exp = q.data as { id: string; familiaId: string | null; servicioClave: string | null; serviciosExtra?: string[] | null; descuento?: unknown } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });
  if (extrasIn !== null && extrasIn.length > 0 && !columnaExtras) {
    return NextResponse.json({ error: "Falta la migración: ejecuta supabase/servicios-extra.sql en Supabase." }, { status: 409 });
  }

  // Todos los servicios (principal y extras) deben ser de los configurados por el despacho.
  const { servicios } = await fetchServiciosConfig();
  if (clave && !servicios.some((s) => s.id === clave)) return NextResponse.json({ error: "Servicio no válido." }, { status: 400 });
  if (extrasIn?.some((x) => !servicios.some((s) => s.id === x))) return NextResponse.json({ error: "Servicio no válido." }, { status: 400 });

  // Estado final: el principal absorbe su propio duplicado en extras.
  const principalFinal = clave || exp.servicioClave || null;
  const extrasPrevios = Array.isArray(exp.serviciosExtra) ? exp.serviciosExtra.filter(Boolean) : [];
  const extrasFinal = (extrasIn ?? extrasPrevios).filter((x) => x !== principalFinal);

  // No-op: sin cambio real (ni principal ni extras), no se escribe ni se registra evento.
  const mismosExtras = extrasFinal.length === extrasPrevios.length && extrasFinal.every((x, i) => extrasPrevios[i] === x);
  const mismoPrincipal = !clave || exp.servicioClave === clave;
  if (mismoPrincipal && mismosExtras) return NextResponse.json({ ok: true });

  const admin = createSupabaseAdmin();
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (clave) { patch.tipo = SERVICIO_A_TIPO[clave] ?? "OTRO"; patch.servicioClave = clave; }
  if (columnaExtras && !mismosExtras) patch.serviciosExtra = extrasFinal;
  const { error } = await admin.from("Expediente").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Evento del historial: qué cambió exactamente.
  const labelDe = (c: string) => servicios.find((s) => s.id === c)?.label?.trim() || c;
  const partes: string[] = [];
  if (!mismoPrincipal) {
    const etiqueta = (body.label ?? "").trim() || labelDe(clave) || TIPO_LABEL[SERVICIO_A_TIPO[clave] ?? "OTRO"] || clave;
    partes.push(`Servicio cambiado a: ${etiqueta}`);
  }
  if (!mismosExtras) {
    partes.push(extrasFinal.length ? `Servicios adicionales: ${extrasFinal.map(labelDe).join(" + ")}` : "Servicios adicionales retirados");
  }
  await admin.from("ExpedienteEvento").insert({
    id: crypto.randomUUID(),
    expedienteId: id,
    tipo: "ESTADO_CAMBIADO",
    descripcion: partes.join(" · "),
  });

  // La unión de documentos requeridos pudo cambiar → el estado no debe mentir.
  await reconciliarProgresoDocs(admin, id, "servicios");

  // ⚠️ Dinero silencioso: una factura automática YA PAGADA no se puede realinear
  // (las EMITIDA se realinean solas al siguiente paso por /api/pagos). Si la tarifa
  // teórica del momento ya no coincide con lo cobrado, avisamos en el historial para
  // que el gestor facture la diferencia a mano — si no, el anticipo de un servicio
  // añadido a mitad de expediente no se cobraría NUNCA por ninguna vía.
  try {
    const serviciosFinales = [principalFinal, ...extrasFinal]
      .map((c) => servicios.find((s) => s.id === c))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    let nMiembros = 1;
    if (exp.familiaId) {
      const { count } = await admin.from("Cliente").select("id", { count: "exact", head: true }).eq("familiaId", exp.familiaId);
      nMiembros = Math.max(1, count ?? 1);
    }
    // La tarifa teórica pasa por la MISMA asignación por miembros y el MISMO descuento
    // que factura /api/pagos: sin ellos, el aviso invitaría a facturar la diferencia
    // sobre el bruto ×N y el gestor sobrefacturaría respecto a lo prometido.
    const conDesc = aplicarDescuento(
      tarifaAsignada(serviciosFinales, asignacionValida((exp as { serviciosAsignacion?: unknown }).serviciosAsignacion), nMiembros),
      1,
      descuentoValido(exp.descuento),
    );
    const teorica = { ANTICIPO: conDesc.anticipo, FINAL: conDesc.resto };
    const { data: pagadas } = await admin.from("Factura")
      .select("numero, baseImponible, momento, estado, origen")
      .eq("expedienteId", id).in("momento", ["ANTICIPO", "FINAL"]).eq("estado", "PAGADA").eq("origen", "AUTOMATICA");
    for (const f of (pagadas ?? []) as { numero: string; baseImponible: number | string; momento: "ANTICIPO" | "FINAL" }[]) {
      const base = Number(f.baseImponible) || 0;
      const debe = teorica[f.momento];
      if (debe <= 0) continue;
      const etiqueta = f.momento === "ANTICIPO" ? "anticipo" : "liquidación final";
      const r2 = (n: number) => Math.round(n * 100) / 100;
      if (debe - base >= 0.01) {
        // Infracobro: cobró menos de lo que ahora vale ese plazo (servicio añadido a
        // mitad de expediente) → nadie lo cobrará nunca si no lo hace a mano.
        await admin.from("ExpedienteEvento").insert({
          id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
          descripcion: `⚠️ La factura de ${etiqueta} (${f.numero}) ya está pagada sobre una base de ${base.toFixed(2)} € y la tarifa actual es ${debe.toFixed(2)} € — factura la diferencia manualmente desde Cobros.`,
        });
      } else if (base - debe >= 0.01) {
        // Sobrecobro: el pago final ya absorbe SOLO la parte que venga del descuento
        // (restoPendiente). Avisar de esa parte pediría facturar/devolver dos veces:
        // solo se avisa de lo que ninguna factura puede recuperar.
        const absorbeElFinal = f.momento === "ANTICIPO" ? r2(conDesc.resto - restoPendiente(conDesc, base)) : 0;
        const sinAbsorber = r2(base - debe - absorbeElFinal);
        if (sinAbsorber >= 0.01) {
          await admin.from("ExpedienteEvento").insert({
            id: crypto.randomUUID(), expedienteId: id, tipo: "COMENTARIO",
            descripcion: `⚠️ La factura de ${etiqueta} (${f.numero}) está pagada sobre una base de ${base.toFixed(2)} € y la tarifa actual es ${debe.toFixed(2)} € — el cliente ha pagado ${sinAbsorber.toFixed(2)} € (+ IVA) de más: devuélveselos o compénsalos en el pago final desde Cobros.`,
          });
        }
      }
    }
  } catch { /* el aviso es best-effort, nunca bloquea el cambio */ }

  return NextResponse.json({ ok: true });
}
