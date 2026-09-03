"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BOARD_COLUMNS, BOARD_PHASES, SALIDAS, etiquetaSalida, salidaDeEstado, type ExpedienteEstado, type Salida } from "@/lib/types";
import { loadArchivados, setArchivadoServidor } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";
import { ArchiveIcon, ChevronIcon } from "@/components/icons";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import { CerrarExpedienteDialog } from "@/components/cerrar-expediente-dialog";
import { type Progreso } from "@/lib/progreso";

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
  presentadoEl?: string; // dd/mm/aaaa — cuándo se depositó en la Administración
  archivado?: boolean; // servidor — compartido por todo el equipo
  salida?: string | null; // Expediente.salida (flujo v4) — null antes de la migración o sin cerrar
  validados: number;
  total: number;
  progreso?: Progreso; // calculado en el servidor (lib/progreso.ts): fase, acción, orden
  // Flujo v4: en «Preparado» la tarjeta dice si el expediente tiene factura (sin importes).
  cobro?: { facturado: boolean };
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("");

// Orden canónico de los estados (para ordenar las tarjetas dentro de una fase).
const ORDEN: Record<string, number> = Object.fromEntries(BOARD_COLUMNS.map((e, i) => [e, i]));

// «Esperando al cliente» = HECHO: faltan documentos requeridos, el enlace ya salió y aún
// no se presentó. Alimenta el filtro del KPI del dashboard.
const esperandoCliente = (e: BoardItem): boolean =>
  e.progreso
    ? e.progreso.docs.faltan.length > 0 && !e.progreso.hitos.presentado
      && e.progreso.accion.clave !== "elegir_servicio"
      // Modo manual: el cliente no tiene enlace — no se le espera.
      && e.progreso.accion.clave !== "subir_docs"
    : e.estado === "DOCS_PENDIENTES";

// Categoría de un expediente cerrado: la salida registrada, o deducida del estado para
// los archivados de antes de la migración. null = sin clasificar (no se afirma nada).
const categoriaDe = (e: BoardItem): Salida | null => (SALIDAS.find((s) => s.key === e.salida)?.key ?? salidaDeEstado(e.estado) ?? null);
const chipDe = (c: Salida | null) =>
  c === "concedido" ? "bg-aproba-100 text-aproba-700"
  : c === "denegado" ? "bg-red-50 text-red-600"
  : c === "desistido" ? "bg-slate-100 text-slate-500"
  : "bg-amber-50 text-amber-700";

function Card({ e, onArchive, preparado }: { e: BoardItem; onArchive: (e: BoardItem) => void; preparado: boolean }) {
  const t = useT();
  // La barra habla el MISMO idioma que la acción: documentos requeridos por el servicio,
  // no documentos subidos. Sin requisitos configurados (o sin progreso), el conteo de subidos.
  const conRequisitos = (e.progreso?.docs.requeridos ?? 0) > 0;
  const barra = conRequisitos
    ? { hechos: e.progreso!.docs.recibidos, total: e.progreso!.docs.requeridos, faltan: e.progreso!.docs.faltan }
    : { hechos: e.validados, total: e.total, faltan: [] as string[] };
  const comp = e.progreso?.completitud;
  // Legado: un expediente resuelto/denegado que quedó sin archivar enseña su desenlace.
  const legado = preparado ? salidaDeEstado(e.estado) : null;
  const desenlace = legado === "concedido" || legado === "denegado" ? legado : null;
  return (
    // Link real (no div onClick): navegable con teclado, «abrir en pestaña nueva», etc.
    // Todas las tarjetas MIDEN LO MISMO (pedido de Matthias): nombre y servicio en una
    // sola línea (truncados, el completo en title); anillo/chip y avatar a la DERECHA, a
    // la altura del nombre — sin fila inferior (03/09).
    <Link href={`/app/expedientes/${e.id}`} className="group relative block cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition hover:border-aproba-500 hover:shadow-card">
      <button
        onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onArchive(e); }}
        aria-label={t("Archivar")}
        title={t("Archivar")}
        className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition before:absolute before:-inset-2 before:content-[''] hover:border-aproba-500 hover:text-aproba-600 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <ArchiveIcon className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate font-semibold leading-tight text-slate-900" title={e.clienteNombre}>{e.clienteNombre}</p>
            {e.fechaLimite && !preparado && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">⏱ {e.fechaLimite}</span>}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-slate-500" title={`${e.tipoLabel} · ${e.clienteNacionalidad}${e.extrasLabels?.length ? ` (+ ${e.extrasLabels.join(" + ")})` : ""}`}>{e.tipoLabel} · {e.clienteNacionalidad}</p>
        </div>

        {/* Grupo derecho de altura fija. En «Preparación» el anillo de completitud; en
            «Preparado» el % sobra (pedido de Matthias): dos palabras sobre la factura, o el
            desenlace legado si ya se conoce. */}
        <div className="flex h-8 shrink-0 items-center gap-2">
          {preparado ? (
            desenlace ? (
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipDe(desenlace)}`}>{t(etiquetaSalida(desenlace) ?? "")}</span>
            ) : (
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.cobro?.facturado ? "bg-aproba-50 text-aproba-700" : "bg-slate-50 text-slate-400"}`}>
                {e.cobro?.facturado ? t("Facturado") : t("Sin facturar")}
              </span>
            )
          ) : comp && (
            <AnilloCompletitud
              pct={comp.pct}
              size={32}
              titulo={[
                comp.manual ? t("Marcado como preparado por el gestor") : null,
                comp.real < comp.pct ? `${t("Completado real")}: ${comp.real}%` : null,
                `${t("Información")}: ${Math.round(comp.info * 100)}%`,
                `${t("Documentos")}: ${barra.total > 0 ? `${barra.hechos}/${barra.total}` : `${Math.round(comp.docs * 100)}%`}`,
                `${t("Formularios")}: ${comp.formularios === 1 ? t("sí") : t("no")}`,
                barra.faltan.length ? `${t("Faltan")}: ${barra.faltan.join(" · ")}` : null,
              ].filter(Boolean).join(" · ")}
            />
          )}
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-aproba-100 text-[11px] font-semibold text-aproba-700">{initials(e.asignadoA)}</span>
        </div>
      </div>
    </Link>
  );
}

export function BoardClient({ items, asignados, filtroInicial = null }: { items: BoardItem[]; asignados: string[]; filtroInicial?: "esperando" | null }) {
  const t = useT();
  const [q, setQ] = useState("");
  // Filtro «esperando cliente» (desde el KPI del dashboard).
  const [soloEsperando, setSoloEsperando] = useState(filtroInicial === "esperando");
  const [asignado, setAsignado] = useState("");
  const [view, setView] = useState<"activos" | "archivados">("activos");
  // Archivado = SERVIDOR (items[].archivado, igual para todo el equipo) ∪ localStorage
  // (gestos de esta pestaña + legado pre-migración).
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<BoardItem | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [catFiltro, setCatFiltro] = useState<string>("");
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const s = loadArchivados();
    for (const e of items) if (e.archivado) s.add(e.id);
    setArchivados(s);
  }, [items]);

  const restaurar = (id: string) => {
    setArchivados((prev) => { const next = new Set(prev); next.delete(id); return next; });
    void setArchivadoServidor(id, false).then(() => router.refresh());
  };

  // Archivar desde la tarjeta = elegir la SALIDA y cerrar (sin factura ni aviso: el dinero
  // y el email se tocan en la ficha). El estado se traduce en el servidor (lib/cierre.ts).
  async function cerrarDesdeTablero(e: BoardItem, salida: Salida) {
    if (cerrando) return;
    setCerrando(true); setErrorCierre(null);
    try {
      const res = await fetch(`/api/expedientes/${e.id}/cerrar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salida, avisar: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo cerrar el expediente."));
      setArchivados((prev) => new Set(prev).add(e.id));
      setDialogo(null);
      setAviso(`${e.referencia} · ${t("archivado")} · ${t(etiquetaSalida(salida) ?? "")}`);
      router.refresh();
    } catch (err) {
      setErrorCierre(err instanceof Error ? err.message : t("No se pudo cerrar el expediente."));
    } finally { setCerrando(false); }
  }

  // Reclasificar un archivado cuando llega la resolución: sin avisos, sin restaurar.
  async function reclasificar(e: BoardItem, salida: Salida) {
    try {
      const res = await fetch(`/api/expedientes/${e.id}/salida`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salida }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo reclasificar."));
      setAviso(`${e.referencia} → ${t(etiquetaSalida(salida) ?? "")}${j.salidaGuardada === false ? ` · ${t("Falta la migración supabase/flujo-v4.sql: la categoría se deduce del estado.")}` : ""}`);
      router.refresh();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : t("No se pudo reclasificar."));
    }
  }

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
  const faseDeTarjeta = (e: BoardItem) => (e.progreso ? e.progreso.fase : BOARD_PHASES.find((ph) => ph.estados.includes(e.estado))?.key ?? "preparacion");
  // Un expediente siempre tiene usuario: «Sin asignar» no es un filtro (03/09). Los pocos
  // legados sin asignar siguen visibles bajo «Todos».
  const filtrosAsignado = asignados.filter((a) => a !== "Sin asignar");

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
            {filtrosAsignado.map((a) => (
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

      {/* Día 1: tablero vacío → contar el flujo y llevar al primer expediente. */}
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

      {/* Vista activa: dos columnas de TRABAJO (Preparación · Preparado), lectura izq→der. */}
      {view === "activos" && visibles.length > 0 ? (
        <div className="no-scrollbar flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-2 sm:snap-none sm:gap-2 sm:overflow-visible">
          {BOARD_PHASES.map((ph, i) => {
            const cards = visibles
              .filter((e) => faseDeTarjeta(e) === ph.key)
              .sort((a, b) => (a.progreso?.score ?? ORDEN[a.estado] ?? 0) - (b.progreso?.score ?? ORDEN[b.estado] ?? 0));
            return (
              <Fragment key={ph.key}>
                <div className="flex w-[82vw] max-w-xs shrink-0 snap-start flex-col sm:w-auto sm:max-w-none sm:flex-1 sm:shrink">
                  <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-lg bg-aproba-50 px-3 py-2">
                    <span aria-hidden />
                    <span className="text-center text-[13px] font-bold text-aproba-700">{i + 1}. {t(ph.label)}</span>
                    <span className="justify-self-end rounded-full bg-white/70 px-1.5 text-xs font-semibold text-aproba-700">{cards.length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {cards.map((e) => <Card key={e.id} e={e} preparado={ph.key === "preparado"} onArchive={(x) => { setErrorCierre(null); setDialogo(x); }} />)}
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
        /* Vista archivados: lista por SALIDA (chips + filtro), reclasificable en la fila. */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-3">
            {[{ key: "", label: "Todas" }, ...SALIDAS.map((s) => ({ key: s.key as string, label: s.label })), { key: "sin", label: "Sin clasificar" }].map((c) => {
              const n = c.key === "" ? archivadosList.length : archivadosList.filter((e) => (categoriaDe(e) ?? "sin") === c.key).length;
              if (c.key !== "" && n === 0) return null;
              return (
                <button key={c.key} onClick={() => setCatFiltro(c.key)} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${catFiltro === c.key ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"}`}>
                  {t(c.label)} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          {visibles.filter((e) => !catFiltro || (categoriaDe(e) ?? "sin") === catFiltro).map((e) => {
            const cat = categoriaDe(e);
            return (
              // Móvil: el nombre en su línea y los mandos debajo; en ancho, todo en una fila.
              <div key={e.id} className="flex flex-wrap items-center gap-3 border-b border-slate-50 px-5 py-3 last:border-0 hover:bg-cream-50">
                <a href={`/app/expedientes/${e.id}`} className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
                    <p className="truncate text-xs text-slate-400">{e.tipoLabel} · {e.referencia}</p>
                  </div>
                </a>
                {cat && <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:ml-0 ${chipDe(cat)}`}>{t(etiquetaSalida(cat) ?? "")}</span>}
                <select
                  aria-label={t("Cambiar categoría")}
                  value={cat ?? ""}
                  onChange={(ev) => { const v = ev.target.value as Salida | ""; if (v) void reclasificar(e, v); }}
                  className={`shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-aproba-600 ${cat ? "" : "ml-auto sm:ml-0"}`}
                >
                  <option value="" disabled>{cat ? t("Cambiar…") : t("Clasificar…")}</option>
                  {SALIDAS.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
                </select>
                <button onClick={() => restaurar(e.id)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-500 hover:text-aproba-700">{t("Restaurar")}</button>
              </div>
            );
          })}
          {visibles.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">{q ? t("Sin resultados.") : t("No hay expedientes archivados.")}</p>}
        </div>
      )}

      {dialogo && (
        <CerrarExpedienteDialog
          referencia={dialogo.referencia}
          cliente={dialogo.clienteNombre}
          sinFactura
          busy={cerrando}
          error={errorCierre}
          onClose={() => { if (!cerrando) setDialogo(null); }}
          onConfirm={({ salida }) => void cerrarDesdeTablero(dialogo, salida)}
        />
      )}
      {aviso && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-float">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-slate-400 hover:text-white" aria-label={t("Cerrar")}>✕</button>
        </div>
      )}
    </div>
  );
}
