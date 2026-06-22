"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BOARD_PHASES, type ExpedienteEstado } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { ChevronIcon, CheckIcon } from "@/components/icons";

// Indicador de pipeline en 4 fases, compartido por el detalle (resalta la fase actual)
// y el dashboard (muestra recuentos y enlaza al tablero). Mismo lenguaje que el board.
export function PhaseStepper({
  activeEstado,
  counts,
  linkHref,
}: {
  activeEstado?: ExpedienteEstado;
  counts?: Record<string, number>;
  linkHref?: string;
}) {
  const t = useT();
  const activeIdx = activeEstado ? BOARD_PHASES.findIndex((p) => p.estados.includes(activeEstado)) : -1;

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
    </div>
  );
}
