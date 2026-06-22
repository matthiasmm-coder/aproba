"use client";

import { ACCION_ESTADO, type ExpedienteEstado } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { ArrowIcon } from "@/components/icons";

// La "acción siguiente" canónica, idéntica en tablero, dashboard y detalle:
// verde + flecha = es tu turno · gris + ○ = esperando. Una sola fuente (ACCION_ESTADO).
export function NextAction({ estado, className = "" }: { estado: ExpedienteEstado; className?: string }) {
  const t = useT();
  const accion = ACCION_ESTADO[estado];
  if (!accion) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${accion.espera ? "text-slate-400" : "font-medium text-aproba-700"} ${className}`}>
      {accion.espera ? <span className="text-slate-300">○</span> : <ArrowIcon className="h-3.5 w-3.5 shrink-0" />}
      {t(accion.label)}
    </span>
  );
}
