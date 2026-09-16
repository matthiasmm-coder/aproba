"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { eur } from "@/lib/facturas";
import { agruparPorMes, csvFacturasRecibidas, fechaCortaISO, filtrarPeriodo, isoDeFecha, totalesDe, motivoNoPagable, MAX_SUBIDA_RECIBIDAS, type FacturaRecibida, type CamposFacturaRecibida } from "@/lib/facturas-recibidas";
import { fmtIban } from "@/lib/sepa";
import type { ExpedienteVinculable } from "@/lib/data/facturas-recibidas";

// FACTURAS RECIBIDAS (proveedores) — vista «Recibidas» de la pestaña Facturas (16/09/2026,
// petición de Asenjo Global Consulting). Subir (o reenviar por email), la IA lee los datos,
// el gestor corrige lo marcado «revisar», pendiente/pagada, y «Orden de transferencia»:
// se marcan las pendientes y Aproba escribe el fichero SEPA (pain.001) que el gestor
// importa en su banca online; las facturas quedan pagadas. NO es contabilidad.

type Props = { items: FacturaRecibida[]; expedientes: ExpedienteVinculable[]; rangeFrom: Date; rangeTo: Date; esAdmin: boolean; oficinaActiva: string | null };
type Traducir = (k: string) => string;
type Filtro = "todas" | "pendientes" | "pagadas";

const inp = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
const n2 = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
const descargar = (contenido: BlobPart, tipo: string, nombre: string) => {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url);
};

function Fila({ f, refDe, marcada, onMarcar, onEditar, onEliminar, onPagada, esAdmin, t }: {
  f: FacturaRecibida; refDe: (id: string) => string; marcada: boolean; onMarcar: (v: boolean) => void; onEditar: () => void; onEliminar: () => void; onPagada: () => void; esAdmin: boolean; t: Traducir;
}) {
  const motivo = motivoNoPagable(f);
  return (
    <tr className={`border-b border-slate-50 last:border-0 hover:bg-cream-50 ${marcada ? "bg-aproba-50/40" : ""}`}>
      <td className="pl-4 pr-1 py-2.5">
        <input type="checkbox" checked={marcada} disabled={!!motivo} onChange={(e) => onMarcar(e.target.checked)} title={motivo ? t(motivo) : t("Incluir en la orden de transferencia")} className="h-4 w-4 accent-aproba-600 disabled:opacity-30" />
      </td>
      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{f.fecha ? fechaCortaISO(f.fecha) : <span className="text-amber-600">{t("sin fecha")}</span>}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-800">{f.proveedorNombre || <span className="text-amber-600">{t("Proveedor no leído")}</span>}</span>
          {f.estado === "PAGADA"
            ? <span className="rounded-full bg-aproba-100 px-1.5 py-0.5 text-[10px] font-semibold text-aproba-700">{t("Pagada")}{f.fechaPago ? ` ${fechaCortaISO(f.fechaPago)}` : ""}</span>
            : <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{t("Pendiente")}</span>}
          {f.revisar && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{t("revisar")}</span>}
          {f.origen === "EMAIL" && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t("email")}</span>}
        </div>
        <div className="text-[11px] text-slate-400">
          {[f.proveedorNif, f.numero ? `${t("nº")} ${f.numero}` : "", f.concepto].filter(Boolean).join(" · ")}
          {f.proveedorIban ? <span className="ml-1 font-mono">· {fmtIban(f.proveedorIban)}</span> : f.estado === "PENDIENTE" && <span className="ml-1 text-amber-600">· {t("sin IBAN")}</span>}
          {f.expedienteId && <span className="ml-1 text-aproba-700">· {refDe(f.expedienteId)}</span>}
        </div>
      </td>
      <td className="hidden px-3 py-2.5 text-right text-slate-500 md:table-cell">{f.baseImponible === null ? "—" : eur(f.baseImponible)}</td>
      <td className="hidden px-3 py-2.5 text-right text-slate-500 md:table-cell">{f.cuotaIva === null ? "—" : `${eur(f.cuotaIva)}${f.tipoIva !== null ? ` (${f.tipoIva} %)` : ""}`}</td>
      <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">{f.total === null ? <span className="text-amber-600">—</span> : eur(f.total)}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        {f.estado === "PENDIENTE" && <button type="button" onClick={onPagada} className="text-xs font-medium text-aproba-700 hover:underline">{t("Pagada")}</button>}
        <a href={`/api/facturas-recibidas/${f.id}/archivo`} target="_blank" rel="noreferrer" className="ml-3 text-xs font-medium text-slate-600 hover:underline">{t("Ver")}</a>
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
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState<number>(0);
  const [ordenando, setOrdenando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [editando, setEditando] = useState<FacturaRecibida | null>(null);
  const [plegado, setPlegado] = useState<Record<string, boolean>>({});
  const [descargando, setDescargando] = useState(false);

  const desde = isoDeFecha(rangeFrom), hasta = isoDeFecha(rangeTo);
  // «Pendientes» ignora el periodo: una factura por pagar lo es tenga la fecha que tenga.
  const visibles = filtro === "pendientes" ? lista.filter((f) => f.estado === "PENDIENTE")
    : filtrarPeriodo(lista, desde, hasta).filter((f) => filtro === "todas" || f.estado === "PAGADA");
  const grupos = agruparPorMes(visibles);
  const tot = totalesDe(visibles);
  const nPendientes = lista.filter((f) => f.estado === "PENDIENTE").length;
  const pagables = visibles.filter((f) => !motivoNoPagable(f));
  const seleccion = pagables.filter((f) => sel.has(f.id));
  const totalSel = Math.round(seleccion.reduce((s, f) => s + (f.total ?? 0), 0) * 100) / 100;
  const refDe = (id: string) => expedientes.find((e) => e.id === id)?.referencia ?? t("expediente");
  const actualizar = (nf: FacturaRecibida) => setLista((l) => l.map((x) => (x.id === nf.id ? nf : x)));

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > MAX_SUBIDA_RECIBIDAS) { setError(t("Máximo {n} archivos por subida.").replace("{n}", String(MAX_SUBIDA_RECIBIDAS))); return; }
    setSubiendo(files.length); setError(null); setExito(null); setAvisos([]);
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

  async function patch(f: FacturaRecibida, cambios: Partial<Record<keyof CamposFacturaRecibida, string>>): Promise<FacturaRecibida | null> {
    const res = await fetch(`/api/facturas-recibidas/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? t("No se pudo guardar.")); return null; }
    return d.factura as FacturaRecibida;
  }

  async function marcarPagada(f: FacturaRecibida) {
    setError(null);
    const nf = await patch(f, { estado: "PAGADA", fechaPago: isoDeFecha(new Date()) });
    if (nf) { actualizar(nf); setSel((s) => { const n = new Set(s); n.delete(f.id); return n; }); router.refresh(); }
  }

  async function eliminar(f: FacturaRecibida) {
    if (!(await confirmar(t("¿Eliminar esta factura recibida? Se borra también el archivo.")))) return;
    setError(null);
    const res = await fetch(`/api/facturas-recibidas/${f.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? t("No se pudo eliminar.")); return; }
    setLista((l) => l.filter((x) => x.id !== f.id)); router.refresh();
  }

  async function ordenTransferencia() {
    if (!seleccion.length || ordenando) return;
    if (!(await confirmar(t("Se generará el fichero SEPA con {n} transferencias por {total} y esas facturas quedarán como pagadas. Impórtalo en tu banca online para ejecutarlas.").replace("{n}", String(seleccion.length)).replace("{total}", eur(totalSel))))) return;
    setOrdenando(true); setError(null); setExito(null);
    try {
      const res = await fetch("/api/facturas-recibidas/orden-pago", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: seleccion.map((f) => f.id) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo generar la orden."));
      descargar(d.xml as string, "application/xml", d.nombre as string);
      const pagadas = new Set(seleccion.map((f) => f.id));
      setLista((l) => l.map((f) => (pagadas.has(f.id) ? { ...f, estado: "PAGADA", fechaPago: d.fechaEjecucion as string, ordenPago: d.msgId as string } : f)));
      setSel(new Set());
      setExito(t("Orden generada: {n} transferencias por {total}. Importa el fichero en tu banca online y valídalo; las facturas ya figuran como pagadas.").replace("{n}", String(d.n)).replace("{total}", eur(d.total as number)));
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo generar la orden.")); }
    finally { setOrdenando(false); }
  }

  function exportarCSV() { descargar(csvFacturasRecibidas(visibles, refDe), "text/csv;charset=utf-8;", `facturas-recibidas_${desde}_${hasta}.csv`); }

  async function exportarZip() {
    if (descargando) return;
    setDescargando(true); setError(null);
    try {
      const res = await fetch(`/api/facturas-recibidas/export?desde=${desde}&hasta=${hasta}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? t("No se pudo exportar.")); }
      descargar(await res.blob(), "application/zip", `facturas-recibidas_${desde}_${hasta}.zip`);
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo exportar.")); }
    finally { setDescargando(false); }
  }

  const todasMarcadas = pagables.length > 0 && pagables.every((f) => sel.has(f.id));
  const chip = (k: Filtro, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${filtro === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
      {label} <span className="text-xs text-slate-400">{n}</span>
    </button>
  );

  return (
    <section id="recibidas">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          {chip("todas", t("Todas"), filtrarPeriodo(lista, desde, hasta).length)}
          {chip("pendientes", t("Pendientes"), nPendientes)}
          {chip("pagadas", t("Pagadas"), filtrarPeriodo(lista, desde, hasta).filter((f) => f.estado === "PAGADA").length)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={ordenTransferencia} disabled={seleccion.length === 0 || ordenando} title={t("Fichero SEPA (pain.001) con una transferencia por factura marcada, para importar en tu banca online")} className="inline-flex items-center gap-2 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm font-semibold text-aproba-700 transition hover:border-aproba-300 disabled:opacity-50">
            {ordenando ? t("Generando…") : seleccion.length ? `${t("Orden de transferencia")} · ${seleccion.length} · ${eur(totalSel)}` : t("Orden de transferencia")}
          </button>
          <button onClick={exportarCSV} disabled={visibles.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{t("CSV")}</button>
          <button onClick={exportarZip} disabled={visibles.length === 0 || descargando} title={t("Los archivos originales del periodo más el CSV, en un ZIP")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{descargando ? t("Preparando…") : t("ZIP (archivos)")}</button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" className="hidden" onChange={(e) => subir(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={subiendo > 0} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
            {subiendo > 0 ? (subiendo === 1 ? t("Leyendo la factura…") : t("Leyendo {n} facturas…").replace("{n}", String(subiendo))) : t("+ Subir facturas")}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {exito && <p className="mb-3 rounded-lg bg-aproba-50 px-3 py-2 text-xs text-aproba-700">{exito}</p>}
      {avisos.length > 0 && (
        <ul className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("Base imponible"), value: eur(tot.base), sub: `${tot.n} ${tot.n === 1 ? t("factura") : t("facturas")}`, tone: "text-slate-900" },
          { label: t("IVA soportado"), value: eur(tot.iva), sub: t("Suma de las cuotas"), tone: "text-slate-900" },
          { label: filtro === "pendientes" ? t("Pendiente de pago") : t("Total recibido"), value: eur(tot.total), sub: visibles.some((f) => f.revisar) ? `${visibles.filter((f) => f.revisar).length} ${t("por revisar")}` : nPendientes ? `${nPendientes} ${t("pendientes de pago")}` : t("Todo pagado"), tone: filtro === "pendientes" ? "text-amber-600" : "text-aproba-700" },
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
          {filtro === "pendientes" ? t("Nada pendiente de pago.") : t("Sin facturas recibidas en este periodo. Sube la primera o reenvíala a tu email de Aproba.")}
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
                          <th className="pl-4 pr-1 py-2.5">
                            <input type="checkbox" checked={todasMarcadas} disabled={pagables.length === 0} onChange={(e) => setSel(e.target.checked ? new Set(pagables.map((f) => f.id)) : new Set())} title={t("Marcar todas las pendientes con IBAN")} className="h-4 w-4 accent-aproba-600 disabled:opacity-30" />
                          </th>
                          <th className="px-3 py-2.5 font-semibold">{t("Fecha")}</th>
                          <th className="px-3 py-2.5 font-semibold">{t("Proveedor")}</th>
                          <th className="hidden px-3 py-2.5 text-right font-semibold md:table-cell">{t("Base")}</th>
                          <th className="hidden px-3 py-2.5 text-right font-semibold md:table-cell">{t("IVA")}</th>
                          <th className="px-3 py-2.5 text-right font-semibold">{t("Total")}</th>
                          <th className="px-2 py-2.5 text-right font-semibold"><span className="sr-only">{t("Acciones")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((f) => (
                          <Fila key={f.id} f={f} refDe={refDe} marcada={sel.has(f.id)} onMarcar={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(f.id); else n.delete(f.id); return n; })}
                            onEditar={() => setEditando(f)} onEliminar={() => eliminar(f)} onPagada={() => marcarPagada(f)} esAdmin={esAdmin} t={t} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{t("Aproba archiva y lee las facturas recibidas y prepara el fichero de transferencias; el pago lo ejecuta tu banco. No lleva la contabilidad: exporta el CSV o el ZIP para quien la lleve.")}</p>

      {editando && (
        <EditarRecibida f={editando} expedientes={expedientes} t={t}
          onCerrar={() => setEditando(null)}
          onGuardada={(nf) => { actualizar(nf); setEditando(null); router.refresh(); }} />
      )}
    </section>
  );
}

function EditarRecibida({ f, expedientes, t, onCerrar, onGuardada }: { f: FacturaRecibida; expedientes: ExpedienteVinculable[]; t: Traducir; onCerrar: () => void; onGuardada: (f: FacturaRecibida) => void }) {
  const [c, setC] = useState<Record<keyof CamposFacturaRecibida, string>>({
    proveedorNombre: f.proveedorNombre, proveedorNif: f.proveedorNif, proveedorIban: fmtIban(f.proveedorIban), numero: f.numero, fecha: f.fecha, baseImponible: n2(f.baseImponible), tipoIva: n2(f.tipoIva), cuotaIva: n2(f.cuotaIva), total: n2(f.total),
    concepto: f.concepto, notas: f.notas, expedienteId: f.expedienteId ?? "", estado: f.estado, fechaPago: f.fechaPago,
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
          {campo("proveedorIban", t("IBAN del proveedor"), { autoComplete: "off", placeholder: "ES00 0000 0000 0000 0000 0000", spellCheck: false })}
          {campo("numero", t("Nº de factura"), { autoComplete: "off" })}
          {campo("fecha", t("Fecha"), { type: "date" })}
          {campo("tipoIva", t("IVA %"), { inputMode: "decimal" })}
          {campo("baseImponible", t("Base imponible"), { inputMode: "decimal" })}
          {campo("cuotaIva", t("Cuota IVA"), { inputMode: "decimal" })}
          {campo("total", t("Total"), { inputMode: "decimal" })}
          <label className="block text-xs text-slate-500">
            <span className="mb-1 block font-medium uppercase tracking-wide text-slate-400">{t("Estado del pago")}</span>
            <select value={c.estado} onChange={set("estado")} className={`${inp} bg-white`}>
              <option value="PENDIENTE">{t("Pendiente")}</option>
              <option value="PAGADA">{t("Pagada")}</option>
            </select>
          </label>
          {campo("fechaPago", t("Fecha de pago"), { type: "date", disabled: c.estado !== "PAGADA" })}
          <label className="block text-xs text-slate-500 sm:col-span-2">
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
        {f.ordenPago && <p className="mt-2 text-[11px] text-slate-400">{t("Incluida en la orden de transferencia")} {f.ordenPago}</p>}
        {err && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">{t("Cancelar")}</button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white hover:bg-aproba-700 disabled:opacity-60">{guardando ? t("Guardando…") : t("Guardar")}</button>
        </div>
      </form>
    </div>
  );
}
