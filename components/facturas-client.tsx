"use client";

import { useState } from "react";
import Link from "next/link";
import { FACTURA_ESTADO_META, eur, ivaDe, totalDe, parseFecha, fmtFecha, MESES, type Factura } from "@/lib/facturas";
import { DateRangePicker } from "@/components/date-range-picker";
import { DatosFacturacion } from "@/components/datos-facturacion";
import type { Despacho } from "@/lib/data/config";
import type { CobroPendiente } from "@/lib/data/facturas";
import { CobrosPendientes } from "@/components/cobros-pendientes";
import { useT } from "@/components/lang-provider";

type Mode = "mtd" | "ytd" | "custom";
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function FacturasClient({ facturas, cobros, despacho }: { facturas: Factura[]; cobros: CobroPendiente[]; despacho: Despacho }) {
  const t = useT();
  const HOY = startOfDay(new Date()); // aujourd'hui (date réelle)
  const [mode, setMode] = useState<Mode>("mtd");
  const [from, setFrom] = useState<Date | null>(new Date(HOY.getFullYear(), HOY.getMonth(), 1));
  const [to, setTo] = useState<Date | null>(HOY);
  const [calOpen, setCalOpen] = useState(false);

  // Plage active selon le mode
  let rangeFrom: Date, rangeTo: Date, rangeLabel: string;
  if (mode === "mtd") {
    rangeFrom = new Date(HOY.getFullYear(), HOY.getMonth(), 1);
    rangeTo = HOY;
    rangeLabel = `${MESES[HOY.getMonth()]} ${HOY.getFullYear()}${t(", hasta hoy")}`;
  } else if (mode === "ytd") {
    rangeFrom = new Date(HOY.getFullYear(), 0, 1);
    rangeTo = HOY;
    rangeLabel = `${t("Año")} ${HOY.getFullYear()}${t(", hasta hoy")}`;
  } else {
    rangeFrom = from ?? new Date(HOY.getFullYear(), HOY.getMonth(), 1);
    rangeTo = to ?? HOY;
    rangeLabel = `${fmtFecha(rangeFrom)} – ${fmtFecha(rangeTo)}`;
  }

  const filtered = facturas.filter((f) => {
    const d = startOfDay(parseFecha(f.fecha));
    return d >= startOfDay(rangeFrom) && d <= startOfDay(rangeTo);
  });

  const facturado = filtered.filter((f) => f.estado !== "BORRADOR").reduce((s, f) => s + totalDe(f.base), 0);
  const cobrado = filtered.filter((f) => f.estado === "PAGADA").reduce((s, f) => s + totalDe(f.base), 0);
  const pendiente = filtered.filter((f) => f.estado === "EMITIDA" || f.estado === "VENCIDA").reduce((s, f) => s + totalDe(f.base), 0);
  const vencidas = filtered.filter((f) => f.estado === "VENCIDA").length;

  const STATS = [
    { label: t("Facturado"), value: eur(facturado), sub: `${filtered.length} ${t("facturas")}`, tone: "text-slate-900" },
    { label: t("Cobrado"), value: eur(cobrado), sub: t("Pagadas"), tone: "text-aproba-700" },
    { label: t("Pendiente de cobro"), value: eur(pendiente), sub: vencidas ? `${vencidas} ${t("vencidas")}` : t("Al día"), tone: "text-amber-600" },
  ];

  function exportarCSV() {
    const num = (n: number) => n.toFixed(2).replace(".", ",");
    const esc = (v: string | number) => {
      const s = String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Número", "Fecha", "Cliente", "Concepto", "Base", "IVA", "Total", "Estado", "Origen"];
    const rows = filtered.map((f) => [f.numero, f.fecha, f.cliente, f.concepto, num(f.base), num(ivaDe(f.base)), num(totalDe(f.base)), FACTURA_ESTADO_META[f.estado].label, f.origen === "AUTOMATICA" ? "Automática" : "Manual"]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");

    const nombre =
      mode === "mtd" ? `${MESES[HOY.getMonth()]}-${HOY.getFullYear()}`
      : mode === "ytd" ? `${HOY.getFullYear()}`
      : `${fmtFecha(rangeFrom)}_${fmtFecha(rangeTo)}`.replace(/ /g, "-");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${nombre}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => { setMode(m); if (m === "custom") setCalOpen(true); else setCalOpen(false); }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Facturas")}</h1>
          <p className="text-sm text-slate-500">{t("Factura a tus clientes por cada trámite.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarCSV} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("Exportar")}
          </button>
          <Link href="/app/facturas/nueva" className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nueva factura")}</Link>
        </div>
      </div>

      <DatosFacturacion despacho={despacho} />

      {/* Cobros pendientes (morosos) — NO filtrado por periodo: una deuda es una deuda */}
      <CobrosPendientes cobros={cobros} />

      {/* Sélecteur de période */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          {tab("mtd", t("Este mes"))}
          {tab("ytd", t("Este año"))}
          {tab("custom", t("Personalizado"))}
        </div>

        {mode === "custom" && (
          <div className="relative">
            <button onClick={() => setCalOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {from && to ? `${fmtFecha(from)} – ${fmtFecha(to)}` : t("Elegir fechas")}
            </button>
            {calOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setCalOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-2">
                  <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setCalOpen(false); }} initialMonth={from ?? HOY} />
                </div>
              </>
            )}
          </div>
        )}

        <span className="text-sm text-slate-400">{rangeLabel}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tightest ${s.tone}`}>{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-semibold">{t("Nº")}</th>
              <th className="px-5 py-3 font-semibold">{t("Cliente")}</th>
              <th className="hidden px-5 py-3 font-semibold md:table-cell">{t("Concepto")}</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">{t("Fecha")}</th>
              <th className="px-5 py-3 text-right font-semibold">{t("Total")}</th>
              <th className="px-5 py-3 text-right font-semibold">{t("Estado")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => {
              const meta = FACTURA_ESTADO_META[f.estado];
              return (
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-cream-50">
                  <td className="px-5 py-3"><Link href={`/app/facturas/${f.id}`} className="font-mono text-xs text-aproba-700 hover:underline">{f.numero}</Link></td>
                  <td className="px-5 py-3 font-medium text-slate-800">{f.cliente}</td>
                  <td className="hidden px-5 py-3 text-slate-500 md:table-cell">
                    {f.concepto}
                    {f.origen === "AUTOMATICA" && (
                      <span title={t("Generada automáticamente al pagar el cliente en la plataforma")} className="ml-2 inline-flex items-center gap-1 rounded-full bg-aproba-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-aproba-700">
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                        {t("auto")}
                      </span>
                    )}
                  </td>
                  <td className="hidden px-5 py-3 text-slate-500 sm:table-cell">{f.fecha}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{eur(totalDe(f.base))}</td>
                  <td className="px-5 py-3 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">{t("Sin facturas en este periodo.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
