"use client";

import { ACCION_ESTADO, type ExpedienteEstado } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { ArrowIcon } from "@/components/icons";

// La "acción siguiente" canónica, idéntica en tablero, dashboard y detalle:
// verde + flecha = es tu turno · gris + ○ = esperando. Una sola fuente (ACCION_ESTADO).
// `accion` viene calculada del servidor (lib/progreso.ts) y manda: sabe si el
// expediente espera al cliente o al despacho, cosa que el estado solo ya no puede decir
// desde que los cuatro estados de trabajo se fundieron en uno. `estado` queda como repli
// para las superficies aún no migradas.
export function NextAction({ estado, accion: dada, className = "" }: {
  estado?: ExpedienteEstado; accion?: { label: string; espera: boolean }; className?: string;
}) {
  const t = useT();
  const accion = dada ?? (estado ? ACCION_ESTADO[estado] : undefined);
  if (!accion) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${accion.espera ? "text-slate-400" : "font-medium text-aproba-700"} ${className}`}>
      {accion.espera ? <span className="text-slate-300">○</span> : <ArrowIcon className="h-3.5 w-3.5 shrink-0" />}
      {t(accion.label)}
    </span>
  );
}
