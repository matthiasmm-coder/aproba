import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { mapEstadoStripe, patchDesdeStripe } from "./billing";

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
