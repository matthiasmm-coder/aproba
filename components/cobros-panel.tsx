"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eur, totalDe } from "@/lib/facturas";
import type { FacturaPago } from "@/lib/data/expedientes";

// Panneau Cobros du détail d'expediente : état de l'anticipo et du pago final,
// et déclenchement du pago final par le gestor (→ /api/pagos → factura auto).

export function CobrosPanel({
  referencia,
  anticipo,
  resto,
  facturas,
}: {
  referencia: string;
  anticipo: number;
  resto: number;
  facturas: FacturaPago[];
}) {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagoAnticipo = facturas.find((f) => f.momento === "ANTICIPO");
  const pagoFinal = facturas.find((f) => f.momento === "FINAL");
  if (anticipo <= 0 && resto <= 0 && facturas.length === 0) return null;

  async function solicitarFinal() {
    setPidiendo(true);
    setError(null);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia, momento: "FINAL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo solicitar el pago.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo solicitar el pago.");
    } finally {
      setPidiendo(false);
    }
  }

  const Fila = ({ label, monto, pago }: { label: string; monto: number; pago?: FacturaPago }) => (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{eur(totalDe(monto))} IVA inc.</p>
      </div>
      {pago ? (
        <span className="shrink-0 rounded-full bg-aproba-100 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">
          Pagado ✓ · {pago.numero}
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Pendiente</span>
      )}
    </div>
  );

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Cobros</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="divide-y divide-slate-100">
          {anticipo > 0 && <Fila label="Pago inicial (al firmar)" monto={anticipo} pago={pagoAnticipo} />}
          {resto > 0 && <Fila label="Pago final (al terminar)" monto={resto} pago={pagoFinal} />}
        </div>

        {resto > 0 && !pagoFinal && (
          <>
            <button
              onClick={solicitarFinal}
              disabled={pidiendo}
              className="mt-3 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {pidiendo ? "Solicitando…" : `Solicitar pago final · ${eur(totalDe(resto))}`}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              El cliente recibe el enlace de pago y la factura se genera sola. (Demo: se confirma al instante.)
            </p>
          </>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          ¿Cobro fuera de la plataforma? <Link href="/app/facturas/nueva" className="font-semibold text-aproba-700 hover:underline">Crea la factura manualmente</Link>.
        </p>
      </div>
    </div>
  );
}
