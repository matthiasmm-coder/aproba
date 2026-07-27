import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cobrarOverageSiProcede } from "@/lib/overage";
import { limiteExpedientes } from "@/lib/planes";

// Stripe fuera: aquí se prueba la DECISIÓN de cobro (contador monótono vs count vivo),
// no la factura. cobrarExpedienteExtra ya es idempotente aguas abajo (`ov_${id}`).
const { cobrarExpedienteExtra, stripeDisponible } = vi.hoisted(() => ({
  cobrarExpedienteExtra: vi.fn(async () => "ii_test"),
  stripeDisponible: vi.fn(() => true),
}));
vi.mock("@/lib/billing", () => ({ cobrarExpedienteExtra, stripeDisponible }));

const LIMITE = limiteExpedientes("STARTER");
// currentPeriodEnd = día 17 → la ventana de cuota va del 17 al 16 (no del 1 al 31).
const SUB_ACTIVA = { plan: "STARTER", estado: "ACTIVA", modoPrueba: false, stripeCustomerId: "cus_test", currentPeriodEnd: "2026-08-17T09:00:00.000Z", trialEndsAt: null };

// Doble mínimo del cliente admin: rpc() + los dos builders que usa la función
// (Subscription→maybeSingle, Expediente→count vivo awaiteado como thenable).
function fakeAdmin(opts: {
  sub: Record<string, unknown> | null;
  rpcResult?: { data: unknown; error: unknown };
  countVivo?: number;
}) {
  const llamadas: string[] = [];
  const rpcArgs: Record<string, unknown>[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push(`rpc:${fn}`);
      rpcArgs.push(args);
      return opts.rpcResult ?? { data: null, error: { message: "function incrementar_uso_mensual does not exist" } };
    },
    from: (tabla: string) => {
      llamadas.push(`from:${tabla}`);
      const q = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        maybeSingle: async () => ({ data: tabla === "Subscription" ? opts.sub : null }),
        then: (resolve: (v: { count: number }) => void) => resolve({ count: opts.countVivo ?? 0 }),
      };
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, llamadas, rpcArgs };
}

const OPTS = { workspaceId: "ws1", expedienteId: "exp1", referencia: "EXP-2026-0001" };

beforeEach(() => {
  cobrarExpedienteExtra.mockClear();
  stripeDisponible.mockClear();
});

describe("cobrarOverageSiProcede — contador monótono", () => {
  it("cobra por encima del límite según UsoMensual, sin tocar el count vivo", async () => {
    const { admin, llamadas, rpcArgs } = fakeAdmin({ sub: SUB_ACTIVA, rpcResult: { data: LIMITE + 1, error: null } });
    await expect(cobrarOverageSiProcede(admin, OPTS)).resolves.toBe(true);
    expect(cobrarExpedienteExtra).toHaveBeenCalledOnce();
    // La decisión sale del contador monótono: borrar expedientes ya no la puede bajar.
    expect(llamadas).toContain("rpc:incrementar_uso_mensual");
    expect(llamadas).not.toContain("from:Expediente");
    // La clave del contador es el INICIO DEL CICLO de facturación (día 17), no 'AAAA-MM'.
    expect(rpcArgs[0]).toMatchObject({ p_workspace_id: "ws1", p_mes: expect.stringMatching(/^\d{4}-\d{2}-17$/) });
  });

  it("no cobra mientras el contador no supera el límite del plan", async () => {
    const { admin } = fakeAdmin({ sub: SUB_ACTIVA, rpcResult: { data: LIMITE, error: null } });
    await expect(cobrarOverageSiProcede(admin, OPTS)).resolves.toBe(false);
    expect(cobrarExpedienteExtra).not.toHaveBeenCalled();
  });

  it("repli: sin la migración aplicada, decide con el count vivo (comportamiento anterior)", async () => {
    const { admin, llamadas } = fakeAdmin({ sub: SUB_ACTIVA, countVivo: LIMITE + 1 });
    await expect(cobrarOverageSiProcede(admin, OPTS)).resolves.toBe(true);
    expect(llamadas).toContain("from:Expediente");
    expect(cobrarExpedienteExtra).toHaveBeenCalledOnce();
  });

  it("en prueba gratuita incrementa el contador igualmente, pero no cobra", async () => {
    const { admin, llamadas } = fakeAdmin({
      sub: { ...SUB_ACTIVA, estado: "TRIAL" },
      rpcResult: { data: LIMITE + 5, error: null },
    });
    await expect(cobrarOverageSiProcede(admin, OPTS)).resolves.toBe(false);
    expect(llamadas).toContain("rpc:incrementar_uso_mensual"); // la cuota sigue siendo exacta si pasa a pago
    expect(cobrarExpedienteExtra).not.toHaveBeenCalled();
  });
});
