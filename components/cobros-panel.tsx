"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eur, totalDe } from "@/lib/facturas";
import type { FacturaPago } from "@/lib/data/expedientes";
import { useT } from "@/components/lang-provider";

// Panneau Cobros du détail d'expediente : état de l'anticipo et du pago final,
// et déclenchement du pago final par le gestor (→ /api/pagos → factura auto).

export function CobrosPanel({
  expedienteId,
  anticipo,
  resto,
  facturas,
}: {
  expedienteId: string;
  anticipo: number;
  resto: number;
  facturas: FacturaPago[];
}) {
  const t = useT();
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
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
        body: JSON.stringify({ expedienteId, momento: "FINAL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("No se pudo solicitar el pago."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo solicitar el pago."));
    } finally {
      setPidiendo(false);
    }
  }

  // Le gestor confirme avoir reçu le virement → la facture passe à PAGADA.
  async function marcarPagada(id: string) {
    if (!window.confirm(t("¿Confirmas que has recibido el pago de esta factura?"))) return;
    setConfirmando(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/pagada`, { method: "POST" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo confirmar el pago.")); }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo confirmar el pago."));
    } finally {
      setConfirmando(false);
    }
  }

  const Fila = ({ label, monto, pago }: { label: string; monto: number; pago?: FacturaPago }) => (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-700">{label}</p>
          <p className="text-xs text-slate-400">{eur(totalDe(monto))} {t("IVA inc.")}</p>
        </div>
        {pago?.estado === "PAGADA" ? (
          <span className="shrink-0 rounded-full bg-aproba-100 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">
            {t("Pagado ✓ ·")} {pago.numero}
          </span>
        ) : pago ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {t("Enviada · pendiente")} · {pago.numero}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{t("Pendiente")}</span>
        )}
      </div>
      {pago && pago.estado !== "PAGADA" && (
        <button onClick={() => marcarPagada(pago.id)} disabled={confirmando} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-aproba-700 transition hover:underline disabled:opacity-60">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {confirmando ? t("Confirmando…") : t("Marcar como pagada (he recibido el pago)")}
        </button>
      )}
    </div>
  );

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{t("Cobro del expediente")}</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="divide-y divide-slate-100">
          {anticipo > 0 && <Fila label={t("Pago inicial (al firmar)")} monto={anticipo} pago={pagoAnticipo} />}
          {resto > 0 && <Fila label={t("Pago final (al terminar)")} monto={resto} pago={pagoFinal} />}
        </div>

        {resto > 0 && !pagoFinal && (
          <>
            <button
              onClick={solicitarFinal}
              disabled={pidiendo}
              className="mt-3 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {pidiendo ? t("Solicitando…") : `${t("Solicitar pago final ·")} ${eur(totalDe(resto))}`}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {t("El cliente recibe un email con la factura y los datos bancarios para pagar por transferencia. Marca la factura como pagada cuando recibas el pago.")}
            </p>
          </>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          {t("¿Cobro fuera de la plataforma?")} <Link href="/app/facturas/nueva" className="font-semibold text-aproba-700 hover:underline">{t("Crea la factura manualmente")}</Link>.
        </p>
      </div>
    </div>
  );
}
