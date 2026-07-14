"use client";

import { useMemo, useState } from "react";
import { eur } from "@/lib/facturas";
import type { CobroPendiente } from "@/lib/data/facturas";
import { useT } from "@/components/lang-provider";

// Vista de cobros pendientes (morosos): facturas EMITIDA/VENCIDA agrupadas por
// cliente deudor, con los días de retraso y un botón «Recordar» que reenvía el
// email de pago (IBAN + tarjeta). El gesto diario del despacho para perseguir cobros.

const diasRetraso = (venceISO: string | null): number | null =>
  venceISO ? Math.floor((Date.now() - Date.parse(venceISO)) / 864e5) : null;

function BotonRecordar({ cobro }: { cobro: CobroPendiente }) {
  const t = useT();
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function recordar() {
    if (estado === "enviando" || estado === "ok") return;
    setEstado("enviando");
    setError(null);
    try {
      const res = await fetch(`/api/facturas/${cobro.id}/recordar`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo enviar el recordatorio."));
      setEstado("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo enviar el recordatorio."));
      setEstado("error");
    }
  }

  // Sin expediente vinculado no hay forma de contactar al cliente (factura manual):
  // mostrar una nota atenuada en vez de un botón que siempre fallaría.
  if (!cobro.expedienteId) {
    return <span className="shrink-0 text-[11px] text-slate-400" title={t("Factura sin expediente: recuérdaselo tú al cliente.")}>{t("Factura manual")}</span>;
  }
  if (estado === "ok") return <span className="shrink-0 text-xs font-semibold text-aproba-700">{t("Recordado")} ✓</span>;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        onClick={recordar}
        disabled={estado === "enviando"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
      >
        {estado === "enviando" ? (
          "…"
        ) : (
          <>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {t("Recordar")}
          </>
        )}
      </button>
      {estado === "error" && error && <span className="max-w-[180px] text-right text-[11px] leading-tight text-red-600">{error}</span>}
    </div>
  );
}

export function CobrosPendientes({ cobros }: { cobros: CobroPendiente[] }) {
  const t = useT();

  // Agrupar por cliente; ordenar los grupos por la deuda más antigua primero.
  const grupos = useMemo(() => {
    const m = new Map<string, CobroPendiente[]>();
    for (const c of cobros) {
      const k = c.cliente || "—";
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return [...m.entries()]
      .map(([cliente, items]) => ({
        cliente,
        items: items.slice().sort((a, b) => (a.venceISO ?? "").localeCompare(b.venceISO ?? "")),
        total: items.reduce((s, c) => s + c.total, 0),
        peorDia: Math.max(...items.map((c) => diasRetraso(c.venceISO) ?? -9999)),
      }))
      .sort((a, b) => b.peorDia - a.peorDia);
  }, [cobros]);

  const totalPendiente = cobros.reduce((s, c) => s + c.total, 0);
  const [abierto, setAbierto] = useState(true);
  const plegable = cobros.length > 0;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => plegable && setAbierto((o) => !o)}
        aria-expanded={plegable ? abierto : undefined}
        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 text-left ${plegable ? "cursor-pointer hover:bg-cream-50/60" : "cursor-default"}`}
      >
        <div className="flex items-center gap-2">
          {plegable && (
            <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          )}
          <div>
            <span className="text-sm font-semibold text-slate-800">{t("Cobros pendientes")}</span>
            {cobros.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {grupos.length} {grupos.length === 1 ? t("cliente") : t("clientes")} · {cobros.length} {cobros.length === 1 ? t("factura") : t("facturas")}
              </p>
            )}
          </div>
        </div>
        {cobros.length > 0 && (
          <p className="shrink-0 text-lg font-bold tracking-tightest text-amber-600">{eur(totalPendiente)}</p>
        )}
      </button>

      {cobros.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-400">✓ {t("Estás al día. No hay cobros pendientes.")}</p>
      ) : abierto && (
        <div className="divide-y divide-slate-100">
          {grupos.map((g) => (
            <div key={g.cliente} className="px-5 py-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-800">{g.cliente}</p>
                <p className="shrink-0 text-sm font-semibold text-slate-700">{eur(g.total)}</p>
              </div>
              <div className="space-y-2">
                {g.items.map((c) => {
                  const dias = diasRetraso(c.venceISO);
                  const vencida = c.estado === "VENCIDA" || (dias !== null && dias > 0);
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-cream-50/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400">{c.numero}</span>
                          <span className="font-semibold text-slate-800">{eur(c.total)}</span>
                          {vencida ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              {dias !== null && dias > 0 ? t("Vencida hace {n} d.").replace("{n}", String(dias)) : t("Vencida")}
                            </span>
                          ) : dias !== null && dias >= 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {dias === 0 ? t("Vence hoy") : t("Vence en {n} d.").replace("{n}", String(dias))}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-400">{c.concepto}</p>
                      </div>
                      <BotonRecordar cobro={c} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
