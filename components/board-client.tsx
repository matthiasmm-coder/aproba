"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, BOARD_PHASES, ESTADO_META, type ExpedienteEstado } from "@/lib/types";
import { loadArchivados, saveArchivados } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";
import { ArchiveIcon, ChevronIcon } from "@/components/icons";
import { NextAction } from "@/components/next-action";

export type BoardItem = {
  id: string;
  referencia: string;
  clienteNombre: string;
  clienteNacionalidad: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string;
  validados: number;
  total: number;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("");

// Orden canónico de los estados (para ordenar las tarjetas dentro de una fase).
const ORDEN: Record<string, number> = Object.fromEntries(BOARD_COLUMNS.map((e, i) => [e, i]));

function Card({ e, onArchive }: { e: BoardItem; onArchive: (id: string) => void }) {
  const router = useRouter();
  const t = useT();
  const meta = ESTADO_META[e.estado];
  const pct = e.total > 0 ? Math.round((e.validados / e.total) * 100) : 0;
  return (
    <div onClick={() => router.push(`/app/expedientes/${e.id}`)} className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-aproba-500 hover:shadow-card">
      <button
        onClick={(ev) => { ev.stopPropagation(); onArchive(e.id); }}
        aria-label={t("Archivar")}
        title={t("Archivar")}
        className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-sm transition hover:border-aproba-500 hover:text-aproba-600 group-hover:opacity-100"
      >
        <ArchiveIcon className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-tight text-slate-900">{e.clienteNombre}</p>
        {e.fechaLimite && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">⏱ {e.fechaLimite}</span>}
      </div>
      <p className="mt-0.5 text-[13px] text-slate-500">{e.tipoLabel} · {e.clienteNacionalidad}</p>

      <div className="mt-2.5 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{t(meta.label)}
        </span>
        {e.total > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${pct === 100 ? "bg-aproba-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} /></span>
            {e.validados}/{e.total}
          </span>
        )}
        <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-aproba-100 text-[11px] font-semibold text-aproba-700">{initials(e.asignadoA)}</span>
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2">
        <NextAction estado={e.estado} />
      </div>
    </div>
  );
}

export function BoardClient({ items, asignados }: { items: BoardItem[]; asignados: string[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [asignado, setAsignado] = useState("");
  const [view, setView] = useState<"activos" | "archivados">("activos");
  const [archivados, setArchivados] = useState<Set<string>>(new Set());

  useEffect(() => { setArchivados(loadArchivados()); }, []);

  const setArchivado = (id: string, val: boolean) => {
    setArchivados((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      saveArchivados(next);
      return next;
    });
  };

  const matchSearch = (e: BoardItem) => {
    const nq = norm(q.trim());
    if (asignado && e.asignadoA !== asignado) return false;
    if (!nq) return true;
    return norm(e.clienteNombre).includes(nq) || norm(e.clienteNacionalidad).includes(nq) || norm(e.tipoLabel).includes(nq) || norm(e.referencia).includes(nq);
  };

  const activos = useMemo(() => items.filter((e) => !archivados.has(e.id)), [items, archivados]);
  const archivadosList = useMemo(() => items.filter((e) => archivados.has(e.id)), [items, archivados]);
  const visibles = (view === "activos" ? activos : archivadosList).filter(matchSearch);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Expedientes")}</h1>
          <p className="text-sm text-slate-500">{view === "activos" ? `${activos.length} ${t("activos")}` : `${archivadosList.length} ${t("archivados")}`}{q || asignado ? ` · ${visibles.length} ${t("mostrados")}` : ""}</p>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente, trámite, referencia…")} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          {q && <button onClick={() => setQ("")} aria-label={t("Borrar")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
        </div>
        {view === "activos" && (
          <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
            <button onClick={() => setAsignado("")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${asignado === "" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Todos")}</button>
            {asignados.map((a) => (
              <button key={a} onClick={() => setAsignado(a)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${asignado === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{a}</button>
            ))}
          </div>
        )}
        <div className="ml-auto inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setView("activos")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${view === "activos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Activos")}</button>
          <button onClick={() => setView("archivados")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${view === "archivados" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <ArchiveIcon className="h-3.5 w-3.5" />{t("Archivados")} {archivadosList.length > 0 && <span className="text-xs text-slate-400">{archivadosList.length}</span>}
          </button>
        </div>
      </div>

      {/* Vue active : pipeline en 4 fases (cabe en pantalla, lectura izq→der como un flujo) */}
      {view === "activos" ? (
        <div className="no-scrollbar flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-2 sm:snap-none sm:gap-2 sm:overflow-visible">
          {BOARD_PHASES.map((ph, i) => {
            const cards = visibles
              .filter((e) => ph.estados.includes(e.estado))
              .sort((a, b) => (ORDEN[a.estado] ?? 0) - (ORDEN[b.estado] ?? 0));
            return (
              <Fragment key={ph.key}>
                <div className="flex w-[82vw] max-w-xs shrink-0 snap-start flex-col sm:w-auto sm:max-w-none sm:flex-1 sm:shrink">
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-aproba-50 px-3 py-2">
                    <span className="text-[13px] font-bold text-aproba-700">{i + 1}. {t(ph.label)}</span>
                    <span className="rounded-full bg-white/70 px-1.5 text-xs font-semibold text-aproba-700">{cards.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {cards.map((e) => <Card key={e.id} e={e} onArchive={(id) => setArchivado(id, true)} />)}
                    {cards.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-300">—</div>}
                  </div>
                </div>
                {i < BOARD_PHASES.length - 1 && (
                  <div className="hidden shrink-0 self-start pt-2.5 text-slate-300 sm:block" aria-hidden>
                    <ChevronIcon className="h-4 w-4" />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      ) : (
        /* Vue archivés : liste */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visibles.map((e) => {
            const meta = ESTADO_META[e.estado];
            return (
              <div key={e.id} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0 hover:bg-cream-50">
                <a href={`/app/expedientes/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
                    <p className="truncate text-xs text-slate-400">{e.tipoLabel} · {e.referencia}</p>
                  </div>
                </a>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
                <button onClick={() => setArchivado(e.id, false)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-500 hover:text-aproba-700">{t("Restaurar")}</button>
              </div>
            );
          })}
          {visibles.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">{q ? t("Sin resultados.") : t("No hay expedientes archivados.")}</p>}
        </div>
      )}
    </div>
  );
}
