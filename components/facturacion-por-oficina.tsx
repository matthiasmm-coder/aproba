"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/components/lang-provider";

// FACTURACIÓN POR OFICINA (fase 6) — el conmutador de la sección «Facturación y
// métodos de pago». Solo aparece con DOS o más oficinas: con una (o ninguna) la
// sección es exactamente la de siempre y no se ve ni el selector.
//
// Todos los paneles llegan RENDERIZADOS del servidor (2-3 sedes como mucho); aquí
// solo se decide cuál se ve. Cambiar de pestaña no pierde el estado de los
// formularios de las otras: siguen montados, solo ocultos.
export function FacturacionPorOficina({
  comun,
  oficinas,
}: {
  comun: ReactNode;
  oficinas: { id: string; nombre: string; panel: ReactNode }[];
}) {
  const t = useT();
  const [activa, setActiva] = useState<string>("comun");

  if (oficinas.length < 2) return <>{comun}</>;

  const pestañas = [{ id: "comun", nombre: t("Todo el despacho") }, ...oficinas.map((o) => ({ id: o.id, nombre: o.nombre }))];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
        {pestañas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiva(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              activa === p.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      {/* TODOS los paneles montados, ocultos por CSS: cambiar de pestaña no pierde
          lo tecleado en las otras (un NIF a medio escribir sobrevive al vistazo). */}
      <div className={activa === "comun" ? "" : "hidden"}>
        <p className="mb-4 rounded-lg border border-slate-200 bg-cream-50/60 px-3 py-2 text-xs text-slate-500">
          {t("Datos y cuentas COMUNES: se usan para las facturas de clientes sin oficina y como respaldo cuando una oficina no tiene los suyos propios.")}
        </p>
        {comun}
      </div>
      {oficinas.map((o) => (
        <div key={o.id} className={activa === o.id ? "" : "hidden"}>
          <p className="mb-4 rounded-lg border border-aproba-200 bg-aproba-50/60 px-3 py-2 text-xs text-aproba-800">
            {t("Configuración de")} <strong>{o.nombre}</strong>: {t("sus facturas, su hoja de encargo y los cobros de sus clientes usarán estos datos. Lo que dejes vacío cae en lo común del despacho.")}
          </p>
          {o.panel}
        </div>
      ))}
    </div>
  );
}
