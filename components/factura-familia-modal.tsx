"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { eur, totalesFactura, IVA, type LineaFactura, type Suplido } from "@/lib/facturas";
import { TASA_790 } from "@/components/factura-editor";
import { useT } from "@/components/lang-provider";

type Prefill = { clienteNombre: string; lineas: { concepto: string; base: number }[]; servicios: { id: string; label: string }[] };

// Popup de factura FAMILIAR: una línea por miembro (base = resto del servicio) + descuento
// familiar (%/€) como línea negativa. Al validar → POST /api/familias/[id]/factura (emite y
// envía al titular). Totales en vivo; el servidor los recalcula.
export function FacturaFamiliaModal({ familiaId, prefill, onClose }: { familiaId: string; prefill: Prefill; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [cliente, setCliente] = useState(prefill.clienteNombre);
  const [numero, setNumero] = useState("");
  const [lineas, setLineas] = useState<LineaFactura[]>(prefill.lineas.length ? prefill.lineas.map((l) => ({ ...l })) : [{ concepto: "", base: 0 }]);
  const [suplidos, setSuplidos] = useState<Suplido[]>([]);
  const [notas, setNotas] = useState("");
  const [descModo, setDescModo] = useState<"pct" | "eur">("pct");
  const [descValor, setDescValor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = createSupabaseBrowser();
        const year = new Date().getFullYear();
        const { data: nums } = await sb.from("Factura").select("numero").like("numero", `${year}-%`);
        const maxN = (nums ?? []).reduce((m, r) => { const n = Number(String(r.numero).split("-")[1]); return Number.isFinite(n) && n > m ? n : m; }, 0);
        setNumero(`${year}-${String(maxN + 1).padStart(4, "0")}`);
      } catch { /* el servidor numera */ }
    })();
  }, []);

  const setLinea = (i: number, patch: Partial<LineaFactura>) => setLineas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setSup = (i: number, patch: Partial<Suplido>) => setSuplidos((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // Subtotal de honorarios (líneas positivas) → base del descuento.
  const subtotal = useMemo(() => lineas.reduce((a, l) => a + (Number(l.base) > 0 ? Number(l.base) : 0), 0), [lineas]);
  const descImporte = useMemo(() => {
    const v = Number(descValor) || 0;
    if (v <= 0) return 0;
    const bruto = descModo === "pct" ? (subtotal * v) / 100 : v;
    return Math.min(Math.round(bruto * 100) / 100, subtotal); // nunca supera el subtotal
  }, [descValor, descModo, subtotal]);

  const lineasFinales = useMemo<LineaFactura[]>(() => {
    const base = lineas.filter((l) => l.concepto.trim() && Number(l.base) !== 0).map((l) => ({ concepto: l.concepto.trim(), base: Number(l.base) }));
    if (descImporte > 0) base.push({ concepto: descModo === "pct" ? `Descuento familiar (${Number(descValor)}%)` : "Descuento familiar", base: -descImporte });
    return base;
  }, [lineas, descImporte, descModo, descValor]);

  const supFinales = useMemo(() => suplidos.filter((s) => s.concepto.trim() && Number(s.importe) > 0), [suplidos]);
  const tot = useMemo(() => totalesFactura(lineasFinales, supFinales), [lineasFinales, supFinales]);
  const canSubmit = Boolean(cliente.trim()) && Boolean(numero.trim()) && tot.base > 0 && !busy;

  async function validar() {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/familias/${familiaId}/factura`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: numero.trim(), clienteNombre: cliente.trim(), lineas: lineasFinales, suplidos: supFinales, notas: notas.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo emitir la factura."));
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo emitir la factura."));
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t("Facturar a la familia")}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{t("Una sola factura para toda la familia (una línea por miembro, solo el resto). Al validar, se emite y se envía al titular con los datos de pago.")}</p>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">{t("Cliente (titular)")}</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del titular")} className={`mt-1.5 ${inp}`} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("Nº de factura")}</label>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} className={`mt-1.5 ${inp} font-mono`} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Servicios de la familia (con IVA)")}</p>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input list="conceptos-fam" value={l.concepto} onChange={(e) => setLinea(i, { concepto: e.target.value })} placeholder={t("Concepto")} className={`${inp} flex-1`} />
                  <div className="relative w-32 shrink-0">
                    <input type="number" value={l.base || ""} onChange={(e) => setLinea(i, { base: Number(e.target.value) || 0 })} placeholder="0" className={`${inp} pr-7 text-right tabular-nums`} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  </div>
                  <button onClick={() => setLineas((x) => x.filter((_, j) => j !== i))} disabled={lineas.length === 1} aria-label={t("Quitar")} className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <datalist id="conceptos-fam">{prefill.servicios.map((s) => <option key={s.id} value={s.label} />)}</datalist>
            <button onClick={() => setLineas((x) => [...x, { concepto: "", base: 0 }])} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">+ {t("Añadir línea")}</button>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Descuento familiar")}</p>
            <div className="flex items-center gap-2">
              <div className="relative w-36 shrink-0">
                <input type="number" value={descValor} onChange={(e) => setDescValor(e.target.value)} placeholder="0" className={`${inp} pr-9 text-right tabular-nums`} />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{descModo === "pct" ? "%" : "€"}</span>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                <button onClick={() => setDescModo("pct")} className={`px-3 py-2 text-sm font-medium ${descModo === "pct" ? "bg-aproba-600 text-white" : "bg-white text-slate-600"}`}>%</button>
                <button onClick={() => setDescModo("eur")} className={`px-3 py-2 text-sm font-medium ${descModo === "eur" ? "bg-aproba-600 text-white" : "bg-white text-slate-600"}`}>€</button>
              </div>
              {descImporte > 0 && <span className="text-sm text-aproba-700">− {eur(descImporte)}</span>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Suplidos (sin IVA: tasas, gastos…)")}</p>
              <button onClick={() => setSuplidos((x) => [...x, { concepto: "Tasa 790-012", importe: TASA_790 }])} className="text-xs font-semibold text-aproba-700 hover:underline">+ {t("Tasa 790")}</button>
            </div>
            {suplidos.length === 0 ? (
              <p className="text-xs text-slate-400">{t("Sin suplidos.")}</p>
            ) : (
              <div className="space-y-2">
                {suplidos.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={s.concepto} onChange={(e) => setSup(i, { concepto: e.target.value })} placeholder={t("Concepto (tasa, registro…)")} className={`${inp} flex-1`} />
                    <div className="relative w-32 shrink-0">
                      <input type="number" value={s.importe || ""} onChange={(e) => setSup(i, { importe: Number(e.target.value) || 0 })} placeholder="0" className={`${inp} pr-7 text-right tabular-nums`} />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                    </div>
                    <button onClick={() => setSuplidos((x) => x.filter((_, j) => j !== i))} aria-label={t("Quitar")} className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("Notas (opcional)")}</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder={t("Condiciones, forma de pago, observaciones…")} className={`mt-1.5 ${inp} resize-none`} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm">
            {descImporte > 0 && <div className="flex justify-between text-slate-400"><span>{t("Subtotal")}</span><span>{eur(subtotal)}</span></div>}
            {descImporte > 0 && <div className="flex justify-between text-aproba-700"><span>{t("Descuento familiar")}</span><span>− {eur(descImporte)}</span></div>}
            <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(tot.base)}</span></div>
            <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(tot.iva)}</span></div>
            {tot.suplidosTotal > 0 && <div className="flex justify-between text-slate-500"><span>{t("Suplidos (sin IVA)")}</span><span>{eur(tot.suplidosTotal)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(tot.total)}</span></div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button onClick={validar} disabled={!canSubmit} className="w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
            {busy ? t("Procesando…") : t("Validar y enviar al titular")}
          </button>
        </div>
      </div>
    </div>
  );
}
