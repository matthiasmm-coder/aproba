"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOARD_COLUMNS, ESTADO_META, type ExpedienteEstado } from "@/lib/types";
import { loadArchivados, saveArchivados } from "@/lib/archivo";

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

function ArchiveIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" /></svg>;
}

function Card({ e, onArchive }: { e: BoardItem; onArchive: (id: string) => void }) {
  const router = useRouter();
  return (
    <div onClick={() => router.push(`/app/expedientes/${e.id}`)} className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-aproba-500 hover:shadow-card">
      <button
        onClick={(ev) => { ev.stopPropagation(); onArchive(e.id); }}
        aria-label="Archivar"
        title="Archivar"
        className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-sm transition hover:border-aproba-300 hover:text-aproba-600 group-hover:opacity-100"
      >
        <ArchiveIcon className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-400">{e.referencia}</span>
        {e.fechaLimite && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">⏱ {e.fechaLimite}</span>}
      </div>
      <p className="mt-2 font-semibold text-slate-900">{e.clienteNombre}</p>
      <p className="text-sm text-slate-500">{e.tipoLabel} · {e.clienteNacionalidad}</p>
      <div className="mt-3 flex items-center justify-between">
        {e.total > 0 ? <span className="text-xs text-slate-500">{e.validados}/{e.total} docs validados</span> : <span className="text-xs text-slate-400">—</span>}
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-aproba-100 text-[11px] font-semibold text-aproba-700">{initials(e.asignadoA)}</span>
      </div>
    </div>
  );
}

export function BoardClient({ items, asignados }: { items: BoardItem[]; asignados: string[] }) {
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
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">Expedientes</h1>
          <p className="text-sm text-slate-500">{view === "activos" ? `${activos.length} activos` : `${archivadosList.length} archivados`}{q || asignado ? ` · ${visibles.length} mostrados` : ""}</p>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, trámite, referencia…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          {q && <button onClick={() => setQ("")} aria-label="Borrar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
        </div>
        {view === "activos" && (
          <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
            <button onClick={() => setAsignado("")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${asignado === "" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Todos</button>
            {asignados.map((a) => (
              <button key={a} onClick={() => setAsignado(a)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${asignado === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{a}</button>
            ))}
          </div>
        )}
        <div className="ml-auto inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          <button onClick={() => setView("activos")} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${view === "activos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Activos</button>
          <button onClick={() => setView("archivados")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${view === "archivados" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <ArchiveIcon className="h-3.5 w-3.5" />Archivados {archivadosList.length > 0 && <span className="text-xs text-slate-400">{archivadosList.length}</span>}
          </button>
        </div>
      </div>

      {/* Vue active : kanban */}
      {view === "activos" ? (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((estado) => {
            const cards = visibles.filter((e) => e.estado === estado);
            const meta = ESTADO_META[estado];
            return (
              <div key={estado} className="w-[82vw] max-w-xs shrink-0 snap-start sm:w-72 sm:max-w-none">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                  <span className="text-xs text-slate-400">{cards.length}</span>
                </div>
                <div className="space-y-3">
                  {cards.map((e) => <Card key={e.id} e={e} onArchive={(id) => setArchivado(id, true)} />)}
                  {cards.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">Vacío</div>}
                </div>
              </div>
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
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>{meta.label}</span>
                <button onClick={() => setArchivado(e.id, false)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700">Restaurar</button>
              </div>
            );
          })}
          {visibles.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">{q ? "Sin resultados." : "No hay expedientes archivados."}</p>}
        </div>
      )}
    </div>
  );
}
