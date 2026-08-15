"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/components/lang-provider";

// FACTURACIÓN POR OFICINA — pastillas de sedes en «Facturación y métodos de pago».
//
// Modelo definitivo: la gestoría ES una oficina (fila real creada al abrir la
// cuenta, marcador orden = -1). Aquí todas las pastillas son IGUALES — sin noción
// de «principal» —; qué panel lleva cada una lo decide la página (la fila inicial
// edita los datos históricos del despacho, que siguen siendo el respaldo de las
// sedes sin datos propios).
//
// Con UNA sola oficina (solo la de la gestoría) no hay pastillas: su panel se
// muestra directo y la sección es exactamente la de siempre. `comun` solo sirve
// de repli si el workspace aún no tiene ninguna fila (backfill sin ejecutar).
//
// TODOS los paneles quedan montados (ocultos por CSS): cambiar de pastilla no
// pierde lo tecleado en las otras.
export function FacturacionPorOficina({
  comun,
  oficinas,
}: {
  comun: ReactNode;
  oficinas: { id: string; nombre: string; panel: ReactNode; nota?: string }[];
}) {
  const t = useT();
  const [activa, setActiva] = useState<string>(oficinas[0]?.id ?? "");

  if (oficinas.length === 0) return <>{comun}</>;
  if (oficinas.length === 1) return <>{oficinas[0].panel}</>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        {oficinas.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setActiva(o.id)}
            className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              activa === o.id
                ? "border-aproba-600 bg-aproba-600 text-white shadow-sm"
                : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"
            }`}
          >
            <span className="max-w-[16rem] truncate">{o.nombre}</span>
          </button>
        ))}
      </div>
      {oficinas.map((o) => (
        <div key={o.id} className={activa === o.id ? "" : "hidden"}>
          {o.nota && (
            <p className="mb-4 rounded-lg border border-aproba-200 bg-aproba-50/60 px-3 py-2 text-xs text-aproba-800">
              {o.nota}
            </p>
          )}
          {o.panel}
        </div>
      ))}
    </div>
  );
}
