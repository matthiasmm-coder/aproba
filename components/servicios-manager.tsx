"use client";

import { useEffect, useRef, useState } from "react";
import { newServicio, type Servicio } from "@/lib/servicios";
import { guardarServicios } from "@/lib/config-browser";
import { eur, totalDe } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ServiciosManager({ inicial }: { inicial: Servicio[] }) {
  const t = useT();
  const [servicios, setServicios] = useState<Servicio[]>(inicial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [nuevoDoc, setNuevoDoc] = useState<Record<string, string>>({});
  const removed = useRef<Set<string>>(new Set());
  const mounted = useRef(false);

  // Persister en base (Supabase, RLS) à chaque changement — debounce 600 ms.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        const claves = [...removed.current];
        await guardarServicios(servicios, claves);
        claves.forEach((c) => removed.current.delete(c));
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [servicios]);

  const update = (id: string, patch: Partial<Servicio>) =>
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addDoc = (id: string) => {
    const val = (nuevoDoc[id] ?? "").trim();
    if (!val) return;
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, docs: [...s.docs, val] } : s)));
    setNuevoDoc((m) => ({ ...m, [id]: "" }));
  };

  const removeDoc = (id: string, idx: number) =>
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, docs: s.docs.filter((_, i) => i !== idx) } : s)));

  const activos = servicios.filter((s) => s.active).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos} {t("activos")}</span> {t("de")} {servicios.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && t("Guardando…")}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
          {saveState === "error" && t("Error al guardar — reintenta")}
        </span>
      </div>

      <div className="space-y-3">
        {servicios.map((s) => (
          <div key={s.id} className={`rounded-xl border bg-white p-4 transition-colors ${s.active ? "border-slate-200" : "border-slate-200 bg-slate-50/60"}`}>
            {/* Ligne titre + toggle */}
            <div className="flex items-center gap-3">
              <input
                value={s.label}
                placeholder={t("Nombre del servicio")}
                onChange={(e) => update(s.id, { label: e.target.value })}
                className="flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
              />
              <button
                onClick={() => update(s.id, { active: !s.active })}
                role="switch"
                aria-checked={s.active}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${s.active ? "bg-aproba-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${s.active ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
              <button
                onClick={() => { removed.current.add(s.id); setServicios((list) => list.filter((x) => x.id !== s.id)); }}
                aria-label={t("Eliminar servicio")}
                className="shrink-0 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </div>

            <input
              value={s.desc}
              placeholder={t("Descripción breve (la verá el cliente)")}
              onChange={(e) => update(s.id, { desc: e.target.value })}
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
            />

            {/* Pago del cliente : anticipo (al firmar) + resto (al finalizar) */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Pago del cliente")}</p>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{t("Al firmar")}</span>
                  <div className="relative">
                    <input type="number" min={0} step={10} value={s.anticipo || ""} placeholder="0"
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { anticipo: v, precio: v + s.resto }); }}
                      className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  </div>
                </label>
                <span className="pb-2.5 text-slate-300">+</span>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{t("Al finalizar")}</span>
                  <div className="relative">
                    <input type="number" min={0} step={10} value={s.resto || ""} placeholder="0"
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { resto: v, precio: s.anticipo + v }); }}
                      className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  </div>
                </label>
                <div className="pb-2 text-xs text-slate-400">
                  {t("Total")} <span className="font-semibold text-slate-700">{eur(s.anticipo + s.resto)}</span>
                  <span className="mx-1">·</span> {t("IVA inc.")} <span className="font-semibold text-slate-600">{eur(totalDe(s.anticipo + s.resto))}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {s.anticipo > 0 && s.resto > 0
                  ? t("El cliente paga en la plataforma al enviar sus documentos y al finalizar — cada pago genera su factura automáticamente.")
                  : s.anticipo > 0
                    ? t("El cliente paga todo en la plataforma al enviar sus documentos — la factura se genera automáticamente.")
                    : s.resto > 0
                      ? t("El cliente paga todo en la plataforma al finalizar el trámite — la factura se genera automáticamente.")
                      : t("Sin cobro configurado: no se pedirá pago en la plataforma.")}
              </p>
            </div>

            {/* Documentos requeridos */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Documentos requeridos")}</p>
              <div className="flex flex-wrap gap-1.5">
                {s.docs.map((d, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs text-slate-600">
                    {t(d)}
                    <button onClick={() => removeDoc(s.id, i)} aria-label={`${t("Quitar")} ${d}`} className="rounded p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
                {s.docs.length === 0 && <span className="text-xs text-slate-400">{t("Sin documentos.")}</span>}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={nuevoDoc[s.id] ?? ""}
                  onChange={(e) => setNuevoDoc((m) => ({ ...m, [s.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addDoc(s.id); }}
                  placeholder={t("Añadir documento…")}
                  className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
                />
                <button onClick={() => addDoc(s.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400">{t("Añadir")}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setServicios((list) => [...list, newServicio()])}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        {t("Nuevo servicio")}
      </button>
    </div>
  );
}
