"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { eur } from "@/lib/facturas";
import { agruparPorMes, csvFacturasRecibidas, fechaCortaISO, filtrarPeriodo, isoDeFecha, totalesDe, MAX_SUBIDA_RECIBIDAS, type FacturaRecibida, type CamposFacturaRecibida } from "@/lib/facturas-recibidas";
import type { ExpedienteVinculable } from "@/lib/data/facturas-recibidas";

// FACTURAS RECIBIDAS (proveedores) — 16/09/2026, petición de Asenjo Global Consulting.
// Sección de la pestaña Facturas: subir (o reenviar por email), la IA lee los datos, el
// gestor corrige lo marcado «revisar», totales por mes, CSV y ZIP con los archivos.
// NO es contabilidad: ni libro de IVA ni modelos. Es el archivo, listo para quien la lleve.

type Props = { items: FacturaRecibida[]; expedientes: ExpedienteVinculable[]; rangeFrom: Date; rangeTo: Date; esAdmin: boolean; oficinaActiva: string | null };
type Traducir = (k: string) => string;

const inp = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
const n2 = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

function Fila({ f, refDe, onEditar, onEliminar, esAdmin, t }: { f: FacturaRecibida; refDe: (id: string) => string; onEditar: () => void; onEliminar: () => void; esAdmin: boolean; t: Traducir }) {
  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-cream-50">
      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{f.fecha ? fechaCortaISO(f.fecha) : <span className="text-amber-600">{t("sin fecha")}</span>}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-800">{f.proveedorNombre || <span className="text-amber-600">{t("Proveedor no leído")}</span>}</span>
          {f.revisar && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{t("revisar")}</span>}
          {f.origen === "EMAIL" && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t("email")}</span>}
        </div>
        <div className="text-[11px] text-slate-400">
          {[f.proveedorNif, f.numero ? `${t("nº")} ${f.numero}` : "", f.concepto].filter(Boolean).join(" · ")}
          {f.expedienteId && <span className="ml-1 text-aproba-700">· {refDe(f.expedienteId)}</span>}
        </div>
      </td>
      <td className="hidden px-4 py-2.5 text-right text-slate-500 md:table-cell">{f.baseImponible === null ? "—" : eur(f.baseImponible)}</td>
      <td className="hidden px-4 py-2.5 text-right text-slate-500 md:table-cell">{f.cuotaIva === null ? "—" : `${eur(f.cuotaIva)}${f.tipoIva !== null ? ` (${f.tipoIva} %)` : ""}`}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">{f.total === null ? <span className="text-amber-600">—</span> : eur(f.total)}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <a href={`/api/facturas-recibidas/${f.id}/archivo`} target="_blank" rel="noreferrer" className="text-xs font-medium text-aproba-700 hover:underline">{t("Ver")}</a>
        <button type="button" onClick={onEditar} className="ml-3 text-xs font-medium text-slate-600 hover:underline">{t("Editar")}</button>
        {esAdmin && <button type="button" onClick={onEliminar} className="ml-3 text-xs font-medium text-red-600 hover:underline">{t("Eliminar")}</button>}
      </td>
    </tr>
  );
}

export function FacturasRecibidas({ items, expedientes, rangeFrom, rangeTo, esAdmin, oficinaActiva }: Props) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState<FacturaRecibida[]>(items);
  const [subiendo, setSubiendo] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [editando, setEditando] = useState<FacturaRecibida | null>(null);
  const [plegado, setPlegado] = useState<Record<string, boolean>>({});
  const [descargando, setDescargando] = useState(false);

  const desde = isoDeFecha(rangeFrom), hasta = isoDeFecha(rangeTo);
  const visibles = filtrarPeriodo(lista, desde, hasta);
  const grupos = agruparPorMes(visibles);
  const tot = totalesDe(visibles);
  const refDe = (id: string) => expedientes.find((e) => e.id === id)?.referencia ?? t("expediente");

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > MAX_SUBIDA_RECIBIDAS) { setError(t("Máximo {n} archivos por subida.").replace("{n}", String(MAX_SUBIDA_RECIBIDAS))); return; }
    setSubiendo(files.length); setError(null); setAvisos([]);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("file", f);
      if (oficinaActiva) fd.set("oficinaId", oficinaActiva);
      const res = await fetch("/api/facturas-recibidas", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudieron subir las facturas."));
      setLista((l) => [...(d.facturas as FacturaRecibida[]), ...l]);
      setAvisos(d.avisos ?? []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudieron subir las facturas."));
    } finally { setSubiendo(0); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function eliminar(f: FacturaRecibida) {
    if (!(await confirmar(t("¿Eliminar esta factura recibida? Se borra también el archivo.")))) return;
    setError(null);
    const res = await fetch(`/api/facturas-recibidas/${f.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? t("No se pudo eliminar.")); return; }
    setLista((l) => l.filter((x) => x.id !== f.id)); router.refresh();
  }

  function exportarCSV() {
    const csv = csvFacturasRecibidas(visibles, refDe);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `facturas-recibidas_${desde}_${hasta}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  async function exportarZip() {
    if (descargando) return;
    setDescargando(true); setError(null);
    try {
      const res = await fetch(`/api/facturas-recibidas/export?desde=${desde}&hasta=${hasta}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? t("No se pudo exportar.")); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `facturas-recibidas_${desde}_${hasta}.zip`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo exportar.")); }
    finally { setDescargando(false); }
  }

  return (
    <section id="recibidas">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button onClick={exportarCSV} disabled={visibles.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          {t("CSV")}
        </button>
        <button onClick={exportarZip} disabled={visibles.length === 0 || descargando} title={t("Los archivos originales del periodo más el CSV, en un ZIP")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          {descargando ? t("Preparando…") : t("ZIP (archivos)")}
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" className="hidden" onChange={(e) => subir(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={subiendo > 0} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {subiendo > 0 ? (subiendo === 1 ? t("Leyendo la factura…") : t("Leyendo {n} facturas…").replace("{n}", String(subiendo))) : t("+ Subir facturas")}
        </button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {avisos.length > 0 && (
        <ul className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}

      {/* Mismas tarjetas que las emitidas: base, IVA y total del periodo */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("Base imponible"), value: eur(tot.base), sub: `${tot.n} ${tot.n === 1 ? t("factura") : t("facturas")}`, tone: "text-slate-900" },
          { label: t("IVA soportado"), value: eur(tot.iva), sub: t("Suma de las cuotas"), tone: "text-slate-900" },
          { label: t("Total recibido"), value: eur(tot.total), sub: visibles.some((f) => f.revisar) ? `${visibles.filter((f) => f.revisar).length} ${t("por revisar")}` : t("Todo leído"), tone: "text-aproba-700" },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tightest ${c.tone}`}>{c.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{c.sub}</p>
          </div>
        ))}
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">
          {t("Sin facturas recibidas en este periodo. Sube la primera o reenvíala a tu email de Aproba.")}
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const cerrado = plegado[g.clave] ?? false;
            return (
              <div key={g.clave} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button type="button" onClick={() => setPlegado((p) => ({ ...p, [g.clave]: !cerrado }))} aria-expanded={!cerrado} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-cream-50/60">
                  <div className="flex items-center gap-2">
                    <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${cerrado ? "" : "rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    <span className={`text-sm font-semibold ${g.clave === "sin-fecha" ? "text-amber-700" : "text-slate-800"}`}>{g.clave === "sin-fecha" ? t("Sin fecha (revisar)") : g.etiqueta}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{g.items.length}</span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-600">{eur(g.total)}</span>
                </button>
                {!cerrado && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-4 py-2.5 font-semibold">{t("Fecha")}</th>
                          <th className="px-4 py-2.5 font-semibold">{t("Proveedor")}</th>
                          <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">{t("Base")}</th>
                          <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">{t("IVA")}</th>
                          <th className="px-4 py-2.5 text-right font-semibold">{t("Total")}</th>
                          <th className="px-2 py-2.5 text-right font-semibold"><span className="sr-only">{t("Acciones")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((f) => <Fila key={f.id} f={f} refDe={refDe} onEditar={() => setEditando(f)} onEliminar={() => eliminar(f)} esAdmin={esAdmin} t={t} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{t("Aproba archiva y lee las facturas recibidas; no lleva la contabilidad. Exporta el CSV o el ZIP para quien la lleve.")}</p>

      {editando && (
        <EditarRecibida f={editando} expedientes={expedientes} t={t}
          onCerrar={() => setEditando(null)}
          onGuardada={(nf) => { setLista((l) => l.map((x) => (x.id === nf.id ? nf : x))); setEditando(null); router.refresh(); }} />
      )}
    </section>
  );
}

function EditarRecibida({ f, expedientes, t, onCerrar, onGuardada }: { f: FacturaRecibida; expedientes: ExpedienteVinculable[]; t: Traducir; onCerrar: () => void; onGuardada: (f: FacturaRecibida) => void }) {
  const [c, setC] = useState<Record<keyof CamposFacturaRecibida, string>>({
    proveedorNombre: f.proveedorNombre, proveedorNif: f.proveedorNif, numero: f.numero, fecha: f.fecha, baseImponible: n2(f.baseImponible), tipoIva: n2(f.tipoIva), cuotaIva: n2(f.cuotaIva), total: n2(f.total), concepto: f.concepto, notas: f.notas, expedienteId: f.expedienteId ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof CamposFacturaRecibida) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setC((v) => ({ ...v, [k]: e.target.value }));

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setGuardando(true); setErr(null);
    try {
      const res = await fetch(`/api/facturas-recibidas/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      onGuardada(d.factura as FacturaRecibida);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : t("No se pudo guardar.")); }
    finally { setGuardando(false); }
  }

  const campo = (k: keyof CamposFacturaRecibida, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block text-xs text-slate-500">
      <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <input value={c[k]} onChange={set(k)} className={inp} {...extra} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{t("Factura recibida")}</h3>
            <a href={`/api/facturas-recibidas/${f.id}/archivo`} target="_blank" rel="noreferrer" className="text-xs font-medium text-aproba-700 hover:underline">{f.archivoNombre}</a>
          </div>
          {f.revisar && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{t("Revisa los datos leídos")}</span>}
        </div>
        {f.notas && f.revisar && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{f.notas}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo("proveedorNombre", t("Proveedor"), { autoComplete: "off" })}</div>
          {campo("proveedorNif", t("NIF del proveedor"), { autoComplete: "off" })}
          {campo("numero", t("Nº de factura"), { autoComplete: "off" })}
          {campo("fecha", t("Fecha"), { type: "date" })}
          {campo("tipoIva", t("IVA %"), { inputMode: "decimal" })}
          {campo("baseImponible", t("Base imponible"), { inputMode: "decimal" })}
          {campo("cuotaIva", t("Cuota IVA"), { inputMode: "decimal" })}
          {campo("total", t("Total"), { inputMode: "decimal" })}
          <label className="block text-xs text-slate-500">
            <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{t("Expediente (opcional)")}</span>
            <select value={c.expedienteId} onChange={set("expedienteId")} className={`${inp} bg-white`}>
              <option value="">{t("Ninguno")}</option>
              {expedientes.map((e) => <option key={e.id} value={e.id}>{e.referencia} · {e.cliente}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">{campo("concepto", t("Concepto"), { autoComplete: "off" })}</div>
          <label className="block text-xs text-slate-500 sm:col-span-2">
            <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{t("Notas")}</span>
            <textarea value={c.notas} onChange={set("notas")} rows={2} className={inp} />
          </label>
        </div>
        {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">{t("Cancelar")}</button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white hover:bg-aproba-700 disabled:opacity-60">{guardando ? t("Guardando…") : t("Guardar")}</button>
        </div>
      </form>
    </div>
  );
}
