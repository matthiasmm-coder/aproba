"use client";

import { useState } from "react";
import { eur, ivaDe, totalDe, totalesFactura, IVA, type LineaFactura, type Suplido } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";

// Editor de factura REUTILIZABLE (formulario + estado + totales en vivo). Lo usan
// /facturas/nueva y el popup de cobro del expediente. No persiste nada: al validar emite
// el payload normalizado por onSubmit; el consumidor decide qué hacer (insert / POST / PUT).
//
// Dos modos según el plan: `avanzada` (Pro/Business → líneas + suplidos + nº + notas) o
// simple (Starter → concepto + base). El consumidor carga los datos iniciales (servicios,
// nº de serie, valores de una factura existente) y monta el editor UNA vez ya listos.

export const TASA_790 = 38.28; // tasa 790-012 (residencia temporal) — suplido típico
export const GENERICOS = ["Asesoramiento extranjería", "Otro concepto"];
export type ServicioTarifa = { id: string; label: string; precio: number };

export type FacturaEditorInicial = {
  cliente?: string;
  // avanzada
  numero?: string;
  lineas?: LineaFactura[];
  suplidos?: Suplido[];
  notas?: string;
  // simple
  concepto?: string;
  base?: number;
};

// Payload normalizado que emite el editor al validar.
export type FacturaPayload = {
  avanzada: boolean;
  cliente: string;
  numero?: string; // solo avanzada (simple: lo numera el consumidor)
  concepto: string; // resumen (avanzada: líneas unidas; simple: el concepto)
  baseImponible: number;
  iva: number;
  total: number;
  lineas?: LineaFactura[];
  suplidos?: Suplido[];
  notas?: string | null;
};

export function FacturaEditor({
  avanzada,
  servicios,
  inicial,
  onSubmit,
  submitLabel,
  busy = false,
  error,
  extra,
}: {
  avanzada: boolean;
  servicios: ServicioTarifa[];
  inicial?: FacturaEditorInicial;
  onSubmit: (p: FacturaPayload) => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  extra?: React.ReactNode; // p.ej. casilla "avisar al cliente" justo encima del botón
}) {
  const t = useT();
  const [cliente, setCliente] = useState(inicial?.cliente ?? "");

  // Simple (Starter)
  const [concepto, setConcepto] = useState(inicial?.concepto ?? (servicios[0]?.label || GENERICOS[0]));
  const [base, setBase] = useState(inicial?.base != null ? String(inicial.base) : (servicios[0]?.precio ? String(servicios[0].precio) : ""));
  const [autollenado, setAutollenado] = useState(inicial?.base == null && Boolean(servicios[0]?.precio));

  // Avanzada (Pro/Business)
  const [numero, setNumero] = useState(inicial?.numero ?? "");
  const [lineas, setLineas] = useState<LineaFactura[]>(inicial?.lineas?.length ? inicial.lineas : [{ concepto: inicial?.concepto || servicios[0]?.label || "", base: inicial?.base ?? servicios[0]?.precio ?? 0 }]);
  const [suplidos, setSuplidos] = useState<Suplido[]>(inicial?.suplidos ?? []);
  const [notas, setNotas] = useState(inicial?.notas ?? "");

  const baseNum = Number(base) || 0;
  const tot = totalesFactura(lineas, suplidos);
  const canSubmit = avanzada
    ? Boolean(cliente.trim()) && tot.base > 0 && Boolean(numero.trim()) && !busy
    : Boolean(cliente.trim()) && baseNum > 0 && !busy;

  function elegirConcepto(label: string) {
    setConcepto(label);
    const sv = servicios.find((s) => s.label === label);
    if (sv?.precio) { setBase(String(sv.precio)); setAutollenado(true); } else setAutollenado(false);
  }
  const setLinea = (i: number, patch: Partial<LineaFactura>) => setLineas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setSup = (i: number, patch: Partial<Suplido>) => setSuplidos((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function validar() {
    if (busy) return;
    if (avanzada) {
      const limpiasL = lineas.filter((l) => l.concepto.trim() && Number(l.base) > 0);
      const limpiasS = suplidos.filter((s) => s.concepto.trim() && Number(s.importe) > 0);
      if (!limpiasL.length) return;
      const { base: b, iva, total } = totalesFactura(limpiasL, limpiasS);
      onSubmit({
        avanzada: true, cliente: cliente.trim(), numero: numero.trim(),
        concepto: limpiasL.map((l) => l.concepto).join(" · ").slice(0, 200),
        baseImponible: b, iva, total, lineas: limpiasL, suplidos: limpiasS, notas: notas.trim() || null,
      });
    } else {
      onSubmit({ avanzada: false, cliente: cliente.trim(), concepto, baseImponible: baseNum, iva: ivaDe(baseNum), total: totalDe(baseNum) });
    }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div>
      {!avanzada ? (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">{t("Cliente")}</label>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del cliente")} className={`mt-1.5 ${inp}`} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t("Concepto")}</label>
            <select value={concepto} onChange={(e) => elegirConcepto(e.target.value)} className={`mt-1.5 ${inp} bg-white`}>
              {servicios.length > 0 && <optgroup label={t("Tus servicios")}>{servicios.map((s) => <option key={s.id} value={s.label}>{s.label}{s.precio ? ` · ${eur(s.precio)}` : ""}</option>)}</optgroup>}
              <optgroup label={t("Otros")}>{GENERICOS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</optgroup>
            </select>
          </div>
          <div>
            <label className="flex items-center justify-between text-sm font-medium text-slate-700">
              <span>{t("Base imponible (€)")}</span>
              {autollenado && <span className="text-xs font-normal text-aproba-700">{t("↩ tarifa del servicio · puedes ajustarla")}</span>}
            </label>
            <input type="number" value={base} onChange={(e) => { setBase(e.target.value); setAutollenado(false); }} placeholder="0" className={`mt-1.5 ${inp}`} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(baseNum)}</span></div>
            <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(ivaDe(baseNum))}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(totalDe(baseNum))}</span></div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            <span>{t("Con Pro o Business puedes añadir varias líneas, suplidos (tasas, sin IVA), nº y notas personalizados.")}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">{t("Cliente")}</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del cliente")} className={`mt-1.5 ${inp}`} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("Nº de factura")}</label>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} className={`mt-1.5 ${inp} font-mono`} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Honorarios (con IVA)")}</p>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input list="conceptos-srv" value={l.concepto} onChange={(e) => setLinea(i, { concepto: e.target.value })} placeholder={t("Concepto")} className={`${inp} flex-1`} />
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
            <datalist id="conceptos-srv">{servicios.map((s) => <option key={s.id} value={s.label} />)}</datalist>
            <button onClick={() => setLineas((x) => [...x, { concepto: "", base: 0 }])} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">+ {t("Añadir línea")}</button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Suplidos (sin IVA: tasas, gastos…)")}</p>
              <button onClick={() => setSuplidos((x) => [...x, { concepto: "Tasa 790-012", importe: TASA_790 }])} className="text-xs font-semibold text-aproba-700 hover:underline">+ {t("Tasa 790")}</button>
            </div>
            {suplidos.length === 0 ? (
              <p className="text-xs text-slate-400">{t("Sin suplidos. Añade tasas o gastos pagados por cuenta del cliente (no llevan IVA).")}</p>
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
            <button onClick={() => setSuplidos((x) => [...x, { concepto: "", importe: 0 }])} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">+ {t("Añadir suplido")}</button>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">{t("Notas (opcional)")}</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder={t("Condiciones, forma de pago, observaciones…")} className={`mt-1.5 ${inp} resize-none`} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(tot.base)}</span></div>
            <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(tot.iva)}</span></div>
            {tot.suplidosTotal > 0 && <div className="flex justify-between text-slate-500"><span>{t("Suplidos (sin IVA)")}</span><span>{eur(tot.suplidosTotal)}</span></div>}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(tot.total)}</span></div>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {extra}
      <button onClick={validar} disabled={!canSubmit} className="mt-5 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
        {busy ? t("Procesando…") : submitLabel}
      </button>
    </div>
  );
}
