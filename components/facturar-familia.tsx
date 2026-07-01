"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { facturacionAvanzada } from "@/lib/planes";
import { eur } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";
import { FacturaFamiliaModal } from "@/components/factura-familia-modal";
import type { FacturaFamiliaPrefill, FacturaFamiliaResumen } from "@/lib/data/familias";

const PILL: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-500", EMITIDA: "bg-amber-100 text-amber-700",
  PAGADA: "bg-aproba-100 text-aproba-700", VENCIDA: "bg-red-100 text-red-700", ANULADA: "bg-slate-100 text-slate-400",
};

// Sección "Facturación familiar" de la vista Familia: botón (según plan) que abre el popup de
// factura familiar + lista de las facturas ya emitidas para la familia.
export function FacturarFamilia({ familiaId, prefill, facturas }: { familiaId: string; prefill: FacturaFamiliaPrefill | null; facturas: FacturaFamiliaResumen[] }) {
  const t = useT();
  const [plan, setPlan] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      try { const sb = createSupabaseBrowser(); const { data } = await sb.from("Subscription").select("plan").limit(1).maybeSingle(); setPlan((data?.plan as string) ?? "STARTER"); } catch { setPlan("STARTER"); }
    })();
  }, []);

  const avanzada = facturacionAvanzada(plan);

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-700">{t("Facturación familiar")}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t("Una sola factura para toda la familia (una línea por miembro), con descuento familiar opcional.")}</p>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        {facturas.length > 0 && (
          <ul className="mb-3 divide-y divide-slate-100">
            {facturas.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800"><span className="font-mono text-xs text-slate-500">{f.numero}</span> · {f.clienteNombre}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">{eur(f.total)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[f.estado] ?? PILL.BORRADOR}`}>{f.estado}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {plan === null ? (
          <div className="h-9 w-40 animate-pulse rounded-lg bg-slate-100" />
        ) : avanzada ? (
          <button onClick={() => setAbierto(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15h6M9 11h2" /></svg>
            {t("Facturar a la familia")}
          </button>
        ) : (
          <p className="text-xs text-slate-500">{t("La facturación familiar (varias líneas + descuento) está disponible en los planes Pro y Business.")}</p>
        )}
      </div>

      {abierto && prefill && <FacturaFamiliaModal familiaId={familiaId} prefill={prefill} onClose={() => setAbierto(false)} />}
    </section>
  );
}
