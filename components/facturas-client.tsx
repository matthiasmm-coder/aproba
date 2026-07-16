"use client";

import { useState } from "react";
import Link from "next/link";
import { FACTURA_ESTADO_META, eur, ivaDe, totalDe, parseFecha, fmtFecha, MESES, type Factura, type FacturaEstado } from "@/lib/facturas";
import { DateRangePicker } from "@/components/date-range-picker";
import { DatosFacturacion } from "@/components/datos-facturacion";
import type { Despacho } from "@/lib/data/config";
import type { CobroPendiente } from "@/lib/data/facturas";
import { CobrosPendientes } from "@/components/cobros-pendientes";
import { FacturaAcciones } from "@/components/factura-acciones";
import { useT } from "@/components/lang-provider";

type Mode = "mtd" | "ytd" | "custom";
type Traducir = (k: string) => string;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Grupos de la tabla: emitidas (pendientes de cobro), pagadas y borradores. Cada uno es
// una sección plegable. VENCIDA cuenta como emitida.
const GRUPOS: { key: string; estados: FacturaEstado[]; titulo: string }[] = [
  { key: "emitidas", estados: ["EMITIDA", "VENCIDA"], titulo: "Emitidas" },
  { key: "pagadas", estados: ["PAGADA"], titulo: "Pagadas" },
  { key: "borradores", estados: ["BORRADOR"], titulo: "Borradores" },
];

// Fila y Grupo a nivel de módulo (NO dentro del render): definirlos dentro remontaría toda
// la tabla en cada cambio de estado del padre — perdiendo el estado interno de
// FacturaAcciones (spinner/error) y refrescando inputs sin razón.
function FilaFactura({ f, esAdmin, t }: { f: Factura; esAdmin: boolean; t: Traducir }) {
  const meta = FACTURA_ESTADO_META[f.estado];
  return (
    <tr className={`border-b border-slate-50 last:border-0 hover:bg-cream-50 ${f.archivado ? "opacity-60" : ""}`}>
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
      <td className="px-2 py-2 text-right"><FacturaAcciones id={f.id} numero={f.numero} estado={f.estado} archivada={Boolean(f.archivado)} esAdmin={esAdmin} /></td>
    </tr>
  );
}

function GrupoFacturas({ id, titulo, items, subtotal, cerrado, onToggle, esAdmin, t }: {
  id: string; titulo: string; items: Factura[]; subtotal?: number; cerrado: boolean; onToggle: () => void; esAdmin: boolean; t: Traducir;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!cerrado}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-cream-50/60"
      >
        <div className="flex items-center gap-2">
          <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${cerrado ? "" : "rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          <span className="text-sm font-semibold text-slate-800">{t(titulo)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span>
        </div>
        {subtotal !== undefined && <span className="shrink-0 text-sm font-semibold text-slate-600">{eur(subtotal)}</span>}
      </button>
      {!cerrado && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">{t("Nº")}</th>
                <th className="px-5 py-3 font-semibold">{t("Cliente")}</th>
                <th className="hidden px-5 py-3 font-semibold md:table-cell">{t("Concepto")}</th>
                <th className="hidden px-5 py-3 font-semibold sm:table-cell">{t("Fecha")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("Total")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("Estado")}</th>
                <th className="px-2 py-3 text-right font-semibold"><span className="sr-only">{t("Acciones")}</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => <FilaFactura key={f.id} f={f} esAdmin={esAdmin} t={t} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FacturasClient({ facturas, cobros, despacho, esAdmin }: { facturas: Factura[]; cobros: CobroPendiente[]; despacho: Despacho; esAdmin: boolean }) {
  const t = useT();
  const HOY = startOfDay(new Date()); // aujourd'hui (date réelle)
  const [mode, setMode] = useState<Mode>("mtd");
  const [from, setFrom] = useState<Date | null>(new Date(HOY.getFullYear(), HOY.getMonth(), 1));
  const [to, setTo] = useState<Date | null>(HOY);
  const [calOpen, setCalOpen] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [plegado, setPlegado] = useState<Record<string, boolean>>({});
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [errPdf, setErrPdf] = useState<string | null>(null);

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
  // Las archivadas se separan: fuera de las estadísticas y de los grupos normales, visibles
  // solo con el toggle (una factura archivada sigue existiendo, pero no ensucia la vista).
  const visibles = filtered.filter((f) => !f.archivado);
  const archivadas = filtered.filter((f) => f.archivado);

  const facturado = visibles.filter((f) => f.estado !== "BORRADOR").reduce((s, f) => s + totalDe(f.base), 0);
  const cobrado = visibles.filter((f) => f.estado === "PAGADA").reduce((s, f) => s + totalDe(f.base), 0);
  const pendiente = visibles.filter((f) => f.estado === "EMITIDA" || f.estado === "VENCIDA").reduce((s, f) => s + totalDe(f.base), 0);
  const vencidas = visibles.filter((f) => f.estado === "VENCIDA").length;

  const STATS = [
    { label: t("Facturado"), value: eur(facturado), sub: `${visibles.length} ${t("facturas")}`, tone: "text-slate-900" },
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
    const rows = visibles.map((f) => [f.numero, f.fecha, f.cliente, f.concepto, num(f.base), num(ivaDe(f.base)), num(totalDe(f.base)), FACTURA_ESTADO_META[f.estado].label, f.origen === "AUTOMATICA" ? "Automática" : "Manual"]);
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

  // Descarga TODAS las facturas emitidas y pagadas (no borradores, no archivadas) en un
  // solo .zip de PDFs — el archivo contable de un clic. No depende del periodo.
  async function exportarPdfs() {
    if (descargandoPdf) return;
    setDescargandoPdf(true); setErrPdf(null);
    try {
      const res = await fetch("/api/facturas/export");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? t("No se pudieron exportar las facturas."));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facturas_${HOY.toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrPdf(e instanceof Error ? e.message : t("No se pudieron exportar las facturas."));
    } finally {
      setDescargandoPdf(false);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => { setMode(m); if (m === "custom") setCalOpen(true); else setCalOpen(false); }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );

  const grupos = GRUPOS
    .map((g) => ({ ...g, items: visibles.filter((f) => g.estados.includes(f.estado)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Facturas")}</h1>
          <p className="text-sm text-slate-500">{t("Factura a tus clientes por cada trámite.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportarCSV} disabled={visibles.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("CSV")}
          </button>
          <button onClick={exportarPdfs} disabled={descargandoPdf} title={t("Descarga todas las facturas emitidas y pagadas en PDF")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {descargandoPdf ? t("Preparando…") : t("PDF (todas)")}
          </button>
          <Link href="/app/facturas/nueva" className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nueva factura")}</Link>
        </div>
      </div>
      {errPdf && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{errPdf}</p>}

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

      {/* Cobros pendientes (morosos) — NO filtrado por periodo: una deuda es una deuda */}
      <div className="mt-6">
        <CobrosPendientes cobros={cobros} />
      </div>

      {/* Grupos plegables por estado */}
      <div className="space-y-4">
        {grupos.map((g) => (
          <GrupoFacturas
            key={g.key} id={g.key} titulo={g.titulo} items={g.items}
            subtotal={g.key === "borradores" ? undefined : g.items.reduce((s, f) => s + totalDe(f.base), 0)}
            cerrado={plegado[g.key] ?? true} onToggle={() => setPlegado((p) => ({ ...p, [g.key]: !(p[g.key] ?? true) }))}
            esAdmin={esAdmin} t={t}
          />
        ))}
        {visibles.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">{t("Sin facturas en este periodo.")}</div>
        )}

        {/* Archivadas — ocultas por defecto */}
        {archivadas.length > 0 && (
          <div>
            <button onClick={() => setVerArchivadas((v) => !v)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-600">
              <svg className={`h-3.5 w-3.5 transition-transform ${verArchivadas ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              {verArchivadas ? t("Ocultar archivadas") : t("Ver archivadas ({n})").replace("{n}", String(archivadas.length))}
            </button>
            {verArchivadas && (
              <GrupoFacturas
                id="archivadas" titulo="Archivadas" items={archivadas}
                cerrado={plegado.archivadas ?? true} onToggle={() => setPlegado((p) => ({ ...p, archivadas: !(p.archivadas ?? true) }))}
                esAdmin={esAdmin} t={t}
              />
            )}
          </div>
        )}
      </div>

      {/* Datos de facturación — configuración puntual, al final de la página */}
      <div className="mt-6">
        <DatosFacturacion despacho={despacho} />
      </div>
    </div>
  );
}
