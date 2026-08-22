"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BOARD_COLUMNS, BOARD_PHASES, type ExpedienteEstado } from "@/lib/types";
import { loadArchivados, setArchivadoServidor } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";
import { ArchiveIcon, ChevronIcon } from "@/components/icons";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import type { Progreso } from "@/lib/progreso";

export type BoardItem = {
  id: string;
  referencia: string;
  clienteNombre: string;
  clienteNacionalidad: string;
  tipoLabel: string;
  extrasLabels?: string[];
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string;
  archivado?: boolean; // servidor — compartido por todo el equipo
  validados: number;
  total: number;
  progreso?: Progreso; // calculado en el servidor (lib/progreso.ts): fase, acción, orden
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("");

// Orden canónico de los estados (para ordenar las tarjetas dentro de una fase).
const ORDEN: Record<string, number> = Object.fromEntries(BOARD_COLUMNS.map((e, i) => [e, i]));

// «Esperando al cliente» = HECHO: faltan documentos requeridos, el enlace ya salió y aún
// no se presentó. Alimenta el filtro del KPI del dashboard (el botón «Recordar» de las
// tarjetas se retiró el 22/08 — ese gesto vive ahora solo en la ficha).
const esperandoCliente = (e: BoardItem): boolean =>
  e.progreso
    ? e.progreso.docs.faltan.length > 0 && !e.progreso.hitos.presentado
      && e.progreso.accion.clave !== "elegir_servicio"
      // Modo manual: el cliente no tiene enlace — no se le espera.
      && e.progreso.accion.clave !== "subir_docs"
    : e.estado === "DOCS_PENDIENTES";

function Card({ e, onArchive }: { e: BoardItem; onArchive: (id: string) => void }) {
  const t = useT();
  // La barra habla el MISMO idioma que la acción: documentos requeridos por el servicio,
  // no documentos subidos. Con el denominador viejo la tarjeta se contradecía sola —
  // «3/3» al lado de «Esperando documentos» (caso real: Rosa, 3 subidos y validados,
  // pero el justificante de medios económicos que exige la renovación sin llegar).
  // Sin requisitos configurados (o sin progreso: repli), se queda el conteo de subidos.
  const conRequisitos = (e.progreso?.docs.requeridos ?? 0) > 0;
  const barra = conRequisitos
    ? { hechos: e.progreso!.docs.recibidos, total: e.progreso!.docs.requeridos, faltan: e.progreso!.docs.faltan }
    : { hechos: e.validados, total: e.total, faltan: [] as string[] };
  const comp = e.progreso?.completitud;
  return (
    // Link real (no div onClick): navegable con teclado, «abrir en pestaña nueva», etc.
    // Todas las tarjetas MIDEN LO MISMO (pedido de Matthias): nombre y servicio en una
    // sola línea (truncados, el completo en title) y la fila del anillo siempre presente.
    <Link href={`/app/expedientes/${e.id}`} className="group relative block cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-aproba-500 hover:shadow-card">
      <button
        onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onArchive(e.id); }}
        aria-label={t("Archivar")}
        title={t("Archivar")}
        className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition before:absolute before:-inset-2 before:content-[''] hover:border-aproba-500 hover:text-aproba-600 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <ArchiveIcon className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-semibold leading-tight text-slate-900" title={e.clienteNombre}>{e.clienteNombre}</p>
        {e.fechaLimite && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">⏱ {e.fechaLimite}</span>}
      </div>
      <p className="mt-0.5 truncate text-[13px] text-slate-500" title={`${e.tipoLabel} · ${e.clienteNacionalidad}${e.extrasLabels?.length ? ` (+ ${e.extrasLabels.join(" + ")})` : ""}`}>{e.tipoLabel} · {e.clienteNacionalidad}</p>

      <div className="mt-2.5 flex items-center gap-2">
        {/* Completitud del expediente (Información + Documentos + Formularios). Tras
            presentar marca 100 % — la fila queda para que todas las tarjetas midan igual. */}
        {comp && (
          <AnilloCompletitud
            pct={comp.pct}
            titulo={[
              comp.manual ? t("Marcado como listo por el gestor") : null,
              `${t("Información")}: ${Math.round(comp.info * 100)}%`,
              `${t("Documentos")}: ${barra.total > 0 ? `${barra.hechos}/${barra.total}` : `${Math.round(comp.docs * 100)}%`}`,
              `${t("Formularios")}: ${comp.formularios === 1 ? t("sí") : t("no")}`,
              barra.faltan.length ? `${t("Faltan")}: ${barra.faltan.join(" · ")}` : null,
            ].filter(Boolean).join(" · ")}
          />
        )}
        <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-aproba-100 text-[11px] font-semibold text-aproba-700">{initials(e.asignadoA)}</span>
      </div>
    </Link>
  );
}

// ── Puesta al día en lote ────────────────────────────────────────────────────
// Medición 22/08: 43 expedientes reales llevaban semanas «listos para presentar»
// cuando ya estaban presentados en Mercurio — nadie da 43 clics declarativos uno a
// uno. Este banner deja decir la verdad de golpe. Sin avisos a los clientes.
function PonerAlDia({ candidatos, onDone }: { candidatos: BoardItem[]; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fecha, setFecha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function enviar() {
    if (!sel.size || enviando) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch("/api/expedientes/presentados-lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel], fecha: fecha || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo actualizar."));
      setOpen(false); onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo actualizar."));
    } finally { setEnviando(false); }
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-indigo-900">
          <span className="font-semibold">{candidatos.length}</span> {t("expedientes listos para presentar. ¿Algunos ya están presentados en Mercurio? Ponlos al día de golpe — sin avisos al cliente.")}
        </p>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
          {open ? t("Cerrar") : t("Poner al día…")}
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setSel(new Set(candidatos.map((c) => c.id)))} className="text-xs font-semibold text-indigo-700 hover:underline">{t("Seleccionar todos")}</button>
            {sel.size > 0 && <button onClick={() => setSel(new Set())} className="text-xs text-slate-400 hover:underline">{t("Ninguno")}</button>}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {candidatos.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-indigo-50/60">
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-indigo-600" />
                <span className="font-mono text-[11px] text-slate-400">{c.referencia}</span>
                <span className="min-w-0 truncate">{c.clienteNombre}</span>
                <span className="ml-auto shrink-0 text-[11px] text-slate-400">{c.tipoLabel}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <label className="text-xs text-slate-500">
              {t("Fecha de presentación (opcional)")}
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="ml-1.5 rounded-md border border-slate-300 px-2 py-1 text-[16px] sm:text-xs outline-none focus:border-indigo-500" />
            </label>
            <button onClick={enviar} disabled={!sel.size || enviando} className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {enviando ? "…" : `${t("Marcar como presentados")}${sel.size ? ` (${sel.size})` : ""}`}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function BoardClient({ items, asignados, filtroInicial = null }: { items: BoardItem[]; asignados: string[]; filtroInicial?: "esperando" | null }) {
  const t = useT();
  const [q, setQ] = useState("");
  // Filtro «esperando cliente» (desde el KPI del dashboard): un clic → la lista de
  // expedientes DOCS_PENDIENTES con el botón Recordar en cada tarjeta.
  const [soloEsperando, setSoloEsperando] = useState(filtroInicial === "esperando");
  const [asignado, setAsignado] = useState("");
  const [view, setView] = useState<"activos" | "archivados">("activos");
  // Archivado = SERVIDOR (items[].archivado, igual para los 3 usuarios) ∪ localStorage
  // (gestos de esta pestaña + legado pre-migración).
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    const s = loadArchivados();
    for (const e of items) if (e.archivado) s.add(e.id);
    setArchivados(s);
  }, [items]);

  const setArchivado = (id: string, val: boolean) => {
    setArchivados((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
    void setArchivadoServidor(id, val); // persiste (servidor + caché local)
  };

  const matchSearch = (e: BoardItem) => {
    const nq = norm(q.trim());
    if (soloEsperando && !esperandoCliente(e)) return false;
    if (asignado && e.asignadoA !== asignado) return false;
    if (!nq) return true;
    return norm(e.clienteNombre).includes(nq) || norm(e.clienteNacionalidad).includes(nq) || norm(e.tipoLabel).includes(nq) || norm(e.referencia).includes(nq)
      || (e.extrasLabels ?? []).some((l) => norm(l).includes(nq));
  };

  const activos = useMemo(() => items.filter((e) => !archivados.has(e.id)), [items, archivados]);
  const archivadosList = useMemo(() => items.filter((e) => archivados.has(e.id)), [items, archivados]);
  const visibles = (view === "activos" ? activos : archivadosList).filter(matchSearch);

  // Candidatos a la puesta al día: los que el cálculo declara «listos para presentar».
  // Umbral de 3: con uno o dos, el clic normal en la ficha basta y el banner es ruido.
  const paraPresentar = useMemo(() => activos.filter((e) => e.progreso?.accion.clave === "presentar"), [activos]);

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente, trámite, referencia…")} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
          {q && <button onClick={() => setQ("")} aria-label={t("Borrar")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>}
        </div>
        {soloEsperando && (
          <button onClick={() => setSoloEsperando(false)} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">
            {t("Esperando cliente")} <span aria-hidden>✕</span>
          </button>
        )}
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

      {/* Día 1: tablero vacío → contar el flujo y llevar al primer expediente, no 4 columnas de «—». */}
      {view === "activos" && visibles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl">🗂️</p>
          <p className="mt-3 font-semibold text-slate-700">{t("Tu primer expediente en 3 pasos")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {t("Creas el expediente y envías el enlace → tu cliente rellena sus datos y sube los documentos → la IA los valida y tú generas los formularios oficiales.")}
          </p>
          <Link href="/app/expedientes/nuevo" className="mt-5 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">
            {t("Crear mi primer expediente")}
          </Link>
        </div>
      )}

      {view === "activos" && !soloEsperando && paraPresentar.length >= 3 && (
        <PonerAlDia candidatos={paraPresentar} onDone={() => router.refresh()} />
      )}

      {/* Vue active : pipeline en 4 fases (cabe en pantalla, lectura izq→der como un flujo) */}
      {view === "activos" && visibles.length > 0 ? (
        <div className="no-scrollbar flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-2 sm:snap-none sm:gap-2 sm:overflow-visible">
          {BOARD_PHASES.map((ph, i) => {
            // La fase viene del progreso calculado (lib/progreso.ts): la frontera
            // Recepción/Preparación ya no es una pertenencia de estado sino el avance
            // real. Repli sobre el groupage antiguo si la fila no trae progreso.
            const cards = visibles
              .filter((e) => (e.progreso ? e.progreso.fase === ph.key : ph.estados.includes(e.estado)))
              .sort((a, b) => (a.progreso?.score ?? ORDEN[a.estado] ?? 0) - (b.progreso?.score ?? ORDEN[b.estado] ?? 0));
            return (
              <Fragment key={ph.key}>
                <div className="flex w-[82vw] max-w-xs shrink-0 snap-start flex-col sm:w-auto sm:max-w-none sm:flex-1 sm:shrink">
                  {/* Título CENTRADO con el contador flotando a la derecha: en grid, el
                      centro es el de la cabecera entera, no el del hueco que deja el
                      contador — así los cuatro títulos quedan alineados entre columnas
                      aunque los contadores tengan uno o dos dígitos. */}
                  <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-lg bg-aproba-50 px-3 py-2">
                    <span aria-hidden />
                    <span className="text-center text-[13px] font-bold text-aproba-700">{i + 1}. {t(ph.label)}</span>
                    <span className="justify-self-end rounded-full bg-white/70 px-1.5 text-xs font-semibold text-aproba-700">{cards.length}</span>
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
      ) : view === "activos" ? null : (
        /* Vue archivés : liste */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visibles.map((e) => {
            return (
              <div key={e.id} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0 hover:bg-cream-50">
                <a href={`/app/expedientes/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
                    <p className="truncate text-xs text-slate-400">{e.tipoLabel} · {e.referencia}</p>
                  </div>
                </a>
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
