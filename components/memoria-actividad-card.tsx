"use client";

import { useT } from "@/components/lang-provider";
import { MemoriaActividad } from "@/components/memoria-actividad";

// Tarjeta «Memoria de actividad» (art. 8.1.f de la Orden ISM/164/2026). Cierra el Inicio
// de los administradores desde el 06/09/2026 (antes vivía en Ajustes → Despacho y
// cuenta): es un informe que se saca cada cierto tiempo, no un ajuste.
export function MemoriaActividadCard() {
  const t = useT();
  return (
    <div id="memoria" className="mx-auto mt-6 max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 text-center">
      <p className="text-sm font-semibold text-slate-800">{t("Memoria de actividad")}</p>
      <MemoriaActividad />
    </div>
  );
}
