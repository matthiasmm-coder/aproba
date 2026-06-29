"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { eur } from "@/lib/facturas";
import { NuevaCitaModal } from "@/components/nueva-cita-modal";
import type { ItemAgenda, ClienteMin } from "@/lib/data/citas";

// Sección "Próximas citas" del Inicio: agenda del gestor (consultas previas + citas con
// la administración a las que acude) + botón para crear una cita previa.
export function ProximasCitas({ citas, clientes }: { citas: ItemAgenda[]; clientes: ClienteMin[] }) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);

  const fechaCorta = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const fmtDur = (min: number) => { const h = Math.floor(min / 60), mm = min % 60; return h ? `${h} h${mm ? ` ${mm}` : ""}` : `${mm} min`; };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{t("Próximas citas")}</h2>
        <button onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("Nueva cita")}
        </button>
      </div>

      {citas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("No tienes citas próximas. Crea una para empezar tu agenda.")}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {citas.map((c) => {
            const esAdmin = c.tipo === "administracion";
            const Row = (
              <div className="flex items-center gap-3 py-2.5">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-cream-50 py-1">
                  <span className="text-sm font-bold text-slate-800">{fechaCorta(c.fecha)}</span>
                  {c.hora && <span className="text-[10px] font-medium text-slate-500">{c.hora}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{c.clienteNombre}</p>
                  <p className="truncate text-xs text-slate-400">
                    {(esAdmin
                      ? [`${t("Cita administración")}${c.referencia ? ` · ${c.referencia}` : ""}`]
                      : [c.motivo || t("Consulta"), c.duracion ? fmtDur(c.duracion) : null, c.precio != null ? eur(c.precio) : null]
                    ).filter(Boolean).concat(c.lugar ? [c.lugar] : []).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${esAdmin ? "bg-indigo-100 text-indigo-700" : "bg-aproba-100 text-aproba-700"}`}>
                  {esAdmin ? t("Administración") : t("Consulta")}
                </span>
              </div>
            );
            return esAdmin && c.expedienteId
              ? <Link key={c.id} href={`/app/expedientes/${c.expedienteId}`} className="block rounded-lg transition hover:bg-slate-50">{Row}</Link>
              : <div key={c.id}>{Row}</div>;
          })}
        </div>
      )}

      {abierto && <NuevaCitaModal clientes={clientes} onClose={() => setAbierto(false)} />}
    </div>
  );
}
