"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOARD_COLUMNS, BOARD_PHASES, ESTADO_META, type ExpedienteEstado } from "@/lib/types";
import { esTuTurno } from "@/lib/pipeline";
import { loadArchivados } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";
import { NextAction } from "@/components/next-action";
import { PhaseStepper } from "@/components/phase-stepper";

export type DashItem = {
  id: string;
  clienteNombre: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string;
  validados: number;
  total: number;
};

const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);
const ORDEN: Record<string, number> = Object.fromEntries(BOARD_COLUMNS.map((e, i) => [e, i]));

// Fila-tarjeta de "qué toca hacer", en el mismo lenguaje visual que las tarjetas del tablero.
function AccionRow({ e }: { e: DashItem }) {
  const t = useT();
  const meta = ESTADO_META[e.estado];
  const pct = e.total > 0 ? Math.round((e.validados / e.total) * 100) : 0;
  return (
    <Link href={`/app/expedientes/${e.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm transition hover:border-aproba-500 hover:shadow-card">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{initials(e.clienteNombre)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
          <span className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${meta.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{t(meta.label)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <NextAction estado={e.estado} />
          <span className="truncate text-xs text-slate-400">· {e.tipoLabel}</span>
          {e.total > 0 && (
            <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
              <span className="h-1 w-8 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${pct === 100 ? "bg-aproba-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} /></span>
              {e.validados}/{e.total}
            </span>
          )}
        </div>
      </div>
      {e.fechaLimite && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">⏱ {e.fechaLimite}</span>}
      <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-semibold text-aproba-700 md:flex">{initials(e.asignadoA)}</span>
    </Link>
  );
}

export function DashboardClient({ items, usuario }: { items: DashItem[]; usuario?: string }) {
  const t = useT();
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  useEffect(() => { setArchivados(loadArchivados()); }, []);

  const live = useMemo(() => items.filter((e) => !archivados.has(e.id)), [items, archivados]);

  // "Tu turno" = todo lo que el tablero marca en verde (acción del gestor), una sola fuente.
  const accion = live
    .filter((e) => esTuTurno(e.estado) && e.estado !== "RECHAZADO")
    .sort((a, b) => (ORDEN[a.estado] ?? 0) - (ORDEN[b.estado] ?? 0));
  const esperandoCliente = live.filter((e) => e.estado === "DOCS_PENDIENTES").length;

  const phaseCounts = Object.fromEntries(
    BOARD_PHASES.map((ph) => [ph.key, live.filter((e) => ph.estados.includes(e.estado)).length]),
  );

  const carga = Object.entries(
    live.filter((e) => e.estado !== "RESUELTO" && e.estado !== "RECHAZADO" && e.estado !== "FINALIZADO")
      .reduce<Record<string, number>>((acc, e) => { acc[e.asignadoA] = (acc[e.asignadoA] ?? 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxCarga = Math.max(1, ...carga.map(([, n]) => n));

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Hola")}{usuario ? `, ${usuario.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-slate-500">
          {accion.length > 0
            ? <><span className="font-semibold text-aproba-700">{accion.length} {accion.length === 1 ? t("expediente requiere") : t("expedientes requieren")}</span> {t("tu acción hoy")}</>
            : t("Nada pendiente por tu parte. ¡Buen trabajo!")}
          {esperandoCliente > 0 && <> · <span className="text-slate-400">{esperandoCliente} {t("esperando al cliente")}</span></>}
        </p>
      </div>

      {/* Mapa del pipeline : 4 fases con recuentos, enlazan al tablero */}
      <div className="mb-6">
        <PhaseStepper counts={phaseCounts} linkHref="/app/expedientes" />
      </div>

      {/* Lo que requiere tu acción */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Requieren tu acción")}</h2>
          <Link href="/app/expedientes" className="text-sm font-semibold text-aproba-700 hover:underline">{t("Ver tablero")} →</Link>
        </div>
        {accion.length > 0 ? (
          <div className="space-y-2.5">
            {accion.slice(0, 8).map((e) => <AccionRow key={e.id} e={e} />)}
            {accion.length > 8 && <Link href="/app/expedientes" className="block py-1 text-center text-sm font-medium text-slate-500 hover:text-slate-800">{t("Ver los")} {accion.length} {t("expedientes")} →</Link>}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">{t("Nada pendiente. ¡Buen trabajo!")}</div>
        )}
      </div>

      {/* Carga del equipo */}
      {carga.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Carga del equipo · en curso")}</h2>
          <div className="space-y-2.5">
            {carga.map(([nombre, n]) => (
              <div key={nombre} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-semibold text-aproba-700">{initials(nombre)}</span>
                <span className="w-24 shrink-0 truncate text-sm text-slate-600">{nombre}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-aproba-500" style={{ width: `${(n / maxCarga) * 100}%` }} /></div>
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
