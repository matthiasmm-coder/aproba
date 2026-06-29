"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eur, totalDe } from "@/lib/facturas";
import type { FacturaPago } from "@/lib/data/expedientes";
import { CobroFacturaModal } from "@/components/cobro-factura-modal";
import { useT } from "@/components/lang-provider";

// Panneau Cobros du détail d'expediente : état de l'anticipo et du pago final.
// • "Solicitar pago final" ouvre un popup de facture éditable (→ /api/pagos → émise + envoyée).
// • Chaque facture déjà générée (anticipo / final) se peut retoucher (→ /api/facturas/[id]).

export function CobrosPanel({
  expedienteId,
  anticipo,
  resto,
  facturas,
  clienteNombre,
  conceptoFinal,
}: {
  expedienteId: string;
  anticipo: number;
  resto: number;
  facturas: FacturaPago[];
  clienteNombre?: string;
  conceptoFinal?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [crearOpen, setCrearOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagoAnticipo = facturas.find((f) => f.momento === "ANTICIPO");
  const pagoFinal = facturas.find((f) => f.momento === "FINAL");
  if (anticipo <= 0 && resto <= 0 && facturas.length === 0) return null;

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
          <p className="text-xs text-slate-400">{eur(pago ? Number(pago.total) : totalDe(monto))} {t("IVA inc.")}</p>
          {pago?.estado === "PAGADA" && pago.metodoPago && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              {pago.metodoPago === "TARJETA" ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V7l9-4 9 4v14" /><path d="M9 21v-6h6v6M9 10h.01M15 10h.01" /></svg>
              )}
              {pago.metodoPago === "TARJETA" ? t("Pagado con tarjeta") : pago.metodoPago === "TRANSFERENCIA" ? t("Pagado por transferencia") : t("Pagado en efectivo")}
            </p>
          )}
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
      {pago && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {pago.estado !== "PAGADA" && (
            <button onClick={() => marcarPagada(pago.id)} disabled={confirmando} className="inline-flex items-center gap-1 text-xs font-semibold text-aproba-700 transition hover:underline disabled:opacity-60">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {confirmando ? t("Confirmando…") : t("Marcar como pagada (he recibido el pago)")}
            </button>
          )}
          {pago.estado !== "PAGADA" && (
            <button onClick={() => setEditId(pago.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-aproba-700 hover:underline">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              {t("Editar factura")}
            </button>
          )}
        </div>
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
              onClick={() => setCrearOpen(true)}
              className="mt-3 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700"
            >
              {`${t("Solicitar pago final ·")} ${eur(totalDe(resto))}`}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {t("Se abre la factura para que la revises y ajustes (tasas, líneas, importe…). Al validar, se envía automáticamente al cliente con los datos de pago.")}
            </p>
          </>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
          {t("¿Cobro fuera de la plataforma?")} <Link href="/app/facturas/nueva" className="font-semibold text-aproba-700 hover:underline">{t("Crea la factura manualmente")}</Link>.
        </p>
      </div>

      {crearOpen && (
        <CobroFacturaModal modo="crear" expedienteId={expedienteId} clienteNombre={clienteNombre} conceptoFinal={conceptoFinal} baseFinal={resto} onClose={() => setCrearOpen(false)} />
      )}
      {editId && (
        <CobroFacturaModal modo="editar" expedienteId={expedienteId} facturaId={editId} onClose={() => setEditId(null)} />
      )}
    </div>
  );
}
