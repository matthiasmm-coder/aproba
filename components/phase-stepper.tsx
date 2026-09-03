"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BOARD_PHASES, type ExpedienteEstado } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { ChevronIcon, CheckIcon } from "@/components/icons";

// Indicador de pipeline en 2 fases de trabajo (flujo v4), compartido por el detalle
// (resalta la fase actual; archivado = todo hecho + chip con la salida) y el dashboard
// (muestra recuentos y enlaza al tablero). Mismo lenguaje que el board.
export function PhaseStepper({
  activeEstado,
  activeFase,
  counts,
  linkHref,
  archivado = false,
  salida = null,
}: {
  activeEstado?: ExpedienteEstado;
  archivado?: boolean;       // ficha: el ciclo está cerrado
  salida?: string | null;    // etiqueta ya traducida de la salida (o null)
  // Fase ya calculada (lib/progreso.ts). Necesaria desde que los cuatro estados de
  // trabajo se fundieron: EN_PREPARACION no pertenece a ninguna fase por sí solo, y sin
  // esto el stepper se quedaba TODO en gris en la mayoría de las fichas.
  activeFase?: string;
  counts?: Record<string, number>;
  linkHref?: string;
}) {
  const t = useT();
  const activeIdx = archivado
    ? BOARD_PHASES.length
    : activeFase
      ? BOARD_PHASES.findIndex((p) => p.key === activeFase)
      : activeEstado ? BOARD_PHASES.findIndex((p) => p.estados.includes(activeEstado)) : -1;

  return (
    <div className="no-scrollbar flex items-stretch gap-1.5 overflow-x-auto pb-1 sm:gap-2 sm:overflow-visible sm:pb-0">
      {BOARD_PHASES.map((ph, i) => {
        const active = i === activeIdx;
        const done = activeIdx > -1 && i < activeIdx;
        const cls = active
          ? "bg-aproba-50 text-aproba-700 ring-1 ring-aproba-200"
          : done
            ? "bg-aproba-50/60 text-aproba-700/70"
            : "bg-slate-50 text-slate-400";
        const inner = (
          <div className={`flex h-full flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${cls} ${linkHref ? "hover:bg-aproba-100 hover:text-aproba-700" : ""}`}>
            <span className="inline-flex items-center gap-1.5">
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : <span className="opacity-70">{i + 1}.</span>}
              {t(ph.label)}
            </span>
            {counts && <span className="shrink-0 rounded-full bg-white/70 px-1.5 text-xs font-semibold">{counts[ph.key] ?? 0}</span>}
          </div>
        );
        return (
          <Fragment key={ph.key}>
            {linkHref ? (
              <Link href={linkHref} className="flex w-36 shrink-0 sm:w-auto sm:min-w-0 sm:flex-1">{inner}</Link>
            ) : (
              <div className="flex w-36 shrink-0 sm:w-auto sm:min-w-0 sm:flex-1">{inner}</div>
            )}
            {i < BOARD_PHASES.length - 1 && (
              <div className="hidden shrink-0 self-center text-slate-300 sm:block" aria-hidden>
                <ChevronIcon className="h-4 w-4" />
              </div>
            )}
          </Fragment>
        );
      })}
      {archivado && (
        <span className="self-center whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {t("Archivado")}{salida ? ` · ${salida}` : ""}
        </span>
      )}
    </div>
  );
}
