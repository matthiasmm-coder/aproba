"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/components/lang-provider";

// FACTURACIÓN POR OFICINA (fase 6) — pastillas de sedes en «Facturación y métodos
// de pago». El modelo: LA GESTORÍA ES LA PRIMERA OFICINA (la principal). No existe
// un ámbito «Todo el despacho» aparte: la pastilla principal lleva el nombre del
// despacho y edita sus datos de siempre — que siguen siendo el respaldo de
// cualquier sede sin datos propios (la cascada no cambia, solo la presentación).
//
// Sin oficinas añadidas no hay pastillas: una sola oficina (la gestoría) no
// necesita selector y la sección es exactamente la de siempre.
//
// TODOS los paneles quedan montados (ocultos por CSS): cambiar de pastilla no
// pierde lo tecleado en las otras.
export function FacturacionPorOficina({
  principalNombre,
  comun,
  oficinas,
}: {
  principalNombre: string;
  comun: ReactNode;
  oficinas: { id: string; nombre: string; panel: ReactNode }[];
}) {
  const t = useT();
  const [activa, setActiva] = useState<string>("principal");

  if (oficinas.length < 1) return <>{comun}</>;

  const pastilla = (id: string, nombre: string, esPrincipal: boolean) => (
    <button
      key={id}
      type="button"
      onClick={() => setActiva(id)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
        activa === id
          ? "border-aproba-600 bg-aproba-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-slate-600 hover:border-aproba-400 hover:text-aproba-700"
      }`}
    >
      <span className="max-w-[16rem] truncate">{nombre}</span>
      {esPrincipal && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${activa === id ? "bg-white/20" : "bg-slate-100 text-slate-400"}`}>
          {t("principal")}
        </span>
      )}
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pastilla("principal", principalNombre, true)}
        {oficinas.map((o) => pastilla(o.id, o.nombre, false))}
      </div>
      <div className={activa === "principal" ? "" : "hidden"}>
        <p className="mb-4 rounded-lg border border-slate-200 bg-cream-50/60 px-3 py-2 text-xs text-slate-500">
          {t("Oficina principal: los datos y cuentas de la gestoría. Sirven de respaldo para cualquier otra oficina que no tenga los suyos propios.")}
        </p>
        {comun}
      </div>
      {oficinas.map((o) => (
        <div key={o.id} className={activa === o.id ? "" : "hidden"}>
          <p className="mb-4 rounded-lg border border-aproba-200 bg-aproba-50/60 px-3 py-2 text-xs text-aproba-800">
            {t("Configuración de")} <strong>{o.nombre}</strong>: {t("sus facturas, su hoja de encargo y los cobros de sus clientes usarán estos datos. Lo que dejes vacío cae en la oficina principal.")}
          </p>
          {o.panel}
        </div>
      ))}
    </div>
  );
}
