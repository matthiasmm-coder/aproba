"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { eur } from "@/lib/facturas";
import { NuevaCitaModal } from "@/components/nueva-cita-modal";
import type { ItemAgenda, ClienteMin } from "@/lib/data/citas";

// Sección "Próximas citas" del Inicio: agenda del gestor (consultas previas + citas con
// la administración a las que acude) + crear/editar/eliminar citas previas. Una cita
// previa DESAPARECE de la lista al pasar su hora de fin (fecha + hora + duración).
export function ProximasCitas({ citas, clientes }: { citas: ItemAgenda[]; clientes: ClienteMin[] }) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);

  // Re-evalúa cada 30 s: la cita desaparece en cuanto pasa su hora de fin.
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const fechaCorta = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const fmtDur = (min: number) => { const h = Math.floor(min / 60), mm = min % 60; return h ? `${h} h${mm ? ` ${mm}` : ""}` : `${mm} min`; };

  // ahora=null (SSR/primer render) → mostrar todo (evita mismatch de hidratación).
  const vigente = (c: ItemAgenda) => {
    if (ahora === null || c.tipo !== "previa" || !c.hora) return true;
    const fin = new Date(`${c.fecha}T${c.hora}`).getTime() + (c.duracion ?? 0) * 60000;
    return Number.isNaN(fin) ? true : fin >= ahora;
  };
  const vigentes = citas.filter(vigente);

  async function borrar(id: string) {
    if (!(await confirmar({ mensaje: t("¿Eliminar esta cita?"), peligro: true, confirmarLabel: t("Eliminar") }))) return;
    setBorrando(id);
    try {
      const r = await fetch("/api/citas-previas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.ok) router.refresh();
    } finally { setBorrando(null); }
  }

  const detalle = (c: ItemAgenda, esAdmin: boolean) => (esAdmin
    ? [`${t("Cita administración")}${c.referencia ? ` · ${c.referencia}` : ""}`]
    : [c.motivo || t("Consulta"), c.duracion ? fmtDur(c.duracion) : null, c.precio != null ? eur(c.precio) : null]
  ).filter(Boolean).concat(c.lugar ? [c.lugar] : []).join(" · ");

  const Contenido = ({ c, esAdmin }: { c: ItemAgenda; esAdmin: boolean }) => (
    <div className="flex flex-1 items-center gap-3 py-2.5">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-cream-50 py-1">
        <span className="text-sm font-bold text-slate-800">{fechaCorta(c.fecha)}</span>
        {c.hora && <span className="text-[10px] font-medium text-slate-500">{c.hora}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{c.clienteNombre}</p>
        <p className="truncate text-xs text-slate-400">{detalle(c, esAdmin)}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${esAdmin ? "bg-indigo-100 text-indigo-700" : "bg-aproba-100 text-aproba-700"}`}>
        {esAdmin ? t("Administración") : t("Consulta")}
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{t("Próximas citas")}</h2>
        <button onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("Nueva cita")}
        </button>
      </div>

      {vigentes.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("No tienes citas próximas. Crea una para empezar tu agenda.")}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {vigentes.map((c) => {
            const esAdmin = c.tipo === "administracion";
            if (esAdmin && c.expedienteId) {
              return (
                <Link key={c.id} href={`/app/expedientes/${c.expedienteId}`} className="flex rounded-lg transition hover:bg-slate-50">
                  <Contenido c={c} esAdmin />
                </Link>
              );
            }
            return (
              <div key={c.id} className="flex items-center gap-1">
                <Contenido c={c} esAdmin={false} />
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => setEditId(c.id)} aria-label={t("Editar")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-aproba-700">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button onClick={() => borrar(c.id)} disabled={borrando === c.id} aria-label={t("Eliminar")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {abierto && <NuevaCitaModal clientes={clientes} onClose={() => setAbierto(false)} />}
      {editId && <NuevaCitaModal clientes={clientes} citaId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}
