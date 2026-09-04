import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { mapEstadoStripe, patchDesdeStripe, lookupDePlan, LOOKUP_PLAN, TODOS_LOOKUPS } from "./billing";

// Blindaje del paso essai-testeur → pago. El 29/08/2026, Juan (primer cliente) llevaba
// DOS meses cobrados con modoPrueba=true heredado de su essai de junio: lib/overage.ts
// trata ese flag como prueba y el excedente de 3 €/expediente no se facturaba nunca.
// patchDesdeStripe debe limpiar el flag cuando la suscripción es ACTIVA — y SOLO entonces
// (en TRIAL el candado del layout depende de él para no cortar a los testers).

function subStripe(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  return {
    id: "sub_test", status: "active", customer: "cus_test",
    cancel_at_period_end: false, trial_end: null,
    items: { data: [{ price: { lookup_key: "aproba_pro_mensual" }, current_period_end: 1_790_000_000 }] },
    metadata: {},
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("patchDesdeStripe · modoPrueba", () => {
  it("ACTIVA limpia modoPrueba (el tester que paga deja de ser tester)", () => {
    const patch = patchDesdeStripe(subStripe({ status: "active" }));
    expect(patch.estado).toBe("ACTIVA");
    expect(patch.modoPrueba).toBe(false);
  });

  for (const status of ["trialing", "past_due", "canceled"] as const) {
    it(`${status} NO toca modoPrueba (los testers en TRIAL dependen de él para el acceso)`, () => {
      const patch = patchDesdeStripe(subStripe({ status }));
      expect("modoPrueba" in patch).toBe(false);
    });
  }
});

describe("patchDesdeStripe · campos existentes (sin regresión)", () => {
  it("anulada → estado CANCELADA y stripeSubscriptionId a null", () => {
    const patch = patchDesdeStripe(subStripe({ status: "canceled" }));
    expect(patch.estado).toBe("CANCELADA");
    expect(patch.stripeSubscriptionId).toBeNull();
  });
  it("mapea el plan desde el lookup_key y conserva el customer", () => {
    const patch = patchDesdeStripe(subStripe());
    expect(patch.plan).toBe("PRO");
    expect(patch.stripeCustomerId).toBe("cus_test");
    expect(patch.cancelAtPeriodEnd).toBe(false);
  });
});

describe("mapEstadoStripe", () => {
  it("cubre los estados de Stripe", () => {
    expect(mapEstadoStripe("trialing")).toBe("TRIAL");
    expect(mapEstadoStripe("active")).toBe("ACTIVA");
    expect(mapEstadoStripe("past_due")).toBe("PAST_DUE");
    expect(mapEstadoStripe("unpaid")).toBe("PAST_DUE");
    expect(mapEstadoStripe("canceled")).toBe("CANCELADA");
    expect(mapEstadoStripe("paused")).toBe("CANCELADA");
  });
});

// ── Precio heredado (04/09/2026) ────────────────────────────────────────────────
// Al subir tarifas, Juan y Jennifer siguen en la suya. La regla vive en lookupDePlan:
// si el workspace está en la lista, se factura contra la etiqueta «_v1», que en Stripe
// sigue apuntando al precio ANTIGUO. Un fallo aquí les sube el precio sin avisar.
describe("precio heredado", () => {
  const JUAN = "f8b46f76-d577-435f-b49b-76e1747838a8";
  const JENNIFER = "65bc1e7e-1477-4ced-aace-ec9fecc1c5cf";
  const OTRO = "ws-cualquiera";

  it("los despachos heredados se facturan contra la etiqueta antigua", () => {
    expect(lookupDePlan("PRO", "mensual", JUAN)).toBe("aproba_pro_mensual_v1");
    expect(lookupDePlan("BUSINESS", "mensual", JENNIFER)).toBe("aproba_business_mensual_v1");
    expect(lookupDePlan("BUSINESS", "anual", JUAN)).toBe("aproba_business_anual_v1");
  });

  it("un despacho nuevo paga la tarifa nueva", () => {
    expect(lookupDePlan("PRO", "mensual", OTRO)).toBe("aproba_pro_mensual");
    expect(lookupDePlan("BUSINESS", "anual", OTRO)).toBe("aproba_business_anual");
    expect(lookupDePlan("STARTER")).toBe("aproba_starter_mensual");
    expect(lookupDePlan("STARTER", "mensual", null)).toBe("aproba_starter_mensual");
  });

  it("cambiar de plan NO saca a un heredado de su tarifa", () => {
    // app/api/equipo/route.ts es el único punto que reprecia una suscripción viva.
    expect(lookupDePlan("BUSINESS", "mensual", JUAN)).toBe("aproba_business_mensual_v1");
  });

  it("el webhook sigue reconociendo el plan de una etiqueta heredada", () => {
    expect(LOOKUP_PLAN["aproba_pro_mensual_v1"]).toBe("PRO");
    expect(LOOKUP_PLAN["aproba_business_anual_v1"]).toBe("BUSINESS");
    expect(patchDesdeStripe(subStripe({
      items: { data: [{ price: { lookup_key: "aproba_pro_mensual_v1" }, current_period_end: 1_790_000_000 }] },
    } as never)).plan).toBe("PRO");
  });

  it("Stripe se consulta con las etiquetas nuevas Y las heredadas", () => {
    expect(TODOS_LOOKUPS).toContain("aproba_pro_mensual");
    expect(TODOS_LOOKUPS).toContain("aproba_pro_mensual_v1");
    expect(TODOS_LOOKUPS).toHaveLength(12);
  });
});
