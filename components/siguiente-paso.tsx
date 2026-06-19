"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { ExpedienteEstado } from "@/lib/types";

// Action contextuelle du gestor selon l'état de l'expediente (état-machine côté
// /api/expedientes/[id]/avanzar). L'étape « cita » n'apparaît que si le service la
// requiert ; sinon on passe directement de « Resolución favorable » à « Finalizar ».
export function SiguientePaso({
  id, estado, citaPresencial = false, citaQuien = "cliente",
}: {
  id: string; estado: ExpedienteEstado; citaPresencial?: boolean; citaQuien?: "cliente" | "gestor";
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citaOpen, setCitaOpen] = useState(false);
  const [cita, setCita] = useState({ fecha: "", hora: "", lugar: "", notas: "" });

  async function avanzar(accion: string, extra?: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo completar la acción.")); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally {
      setLoading(false);
    }
  }

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60";
  const fld = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-aproba-600";
  let ui: React.ReactNode = null;

  if (estado === "FORM_GENERADO") {
    ui = (
      <button onClick={() => { if (window.confirm(t("¿Marcar como presentado? Se avisará al cliente."))) avanzar("presentar"); }} disabled={loading} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
        {loading ? t("Guardando…") : t("Marcar como presentado")}
      </button>
    );
  } else if (estado === "PRESENTADO") {
    ui = (
      <div className="flex gap-2">
        <button onClick={() => avanzar("resolver_favorable")} disabled={loading} className={`${btn} bg-aproba-600 text-white hover:bg-aproba-700`}>{t("Resolución favorable")}</button>
        <button onClick={() => { if (window.confirm(t("¿Marcar como denegado?"))) avanzar("resolver_desfavorable"); }} disabled={loading} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>{t("Denegado")}</button>
      </div>
    );
  } else if (estado === "RESUELTO") {
    ui = citaPresencial ? (
      <div className="relative">
        <button onClick={() => setCitaOpen((o) => !o)} disabled={loading} className={`${btn} bg-purple-600 text-white hover:bg-purple-700`}>{t("Asignar cita")}</button>
        {citaOpen && (
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg">
            <p className="mb-2 text-xs font-semibold text-slate-700">{t("Datos de la cita")}</p>
            <label className="block text-xs text-slate-500">{t("Fecha")} *
              <input type="date" value={cita.fecha} onChange={(e) => setCita((c) => ({ ...c, fecha: e.target.value }))} className={fld} />
            </label>
            <label className="mt-2 block text-xs text-slate-500">{t("Hora")}
              <input type="time" value={cita.hora} onChange={(e) => setCita((c) => ({ ...c, hora: e.target.value }))} className={fld} />
            </label>
            <label className="mt-2 block text-xs text-slate-500">{t("Lugar / dirección")}
              <input value={cita.lugar} onChange={(e) => setCita((c) => ({ ...c, lugar: e.target.value }))} placeholder={t("Comisaría, oficina…")} className={fld} />
            </label>
            <label className="mt-2 block text-xs text-slate-500">{t("Instrucciones (qué llevar…)")}
              <textarea value={cita.notas} onChange={(e) => setCita((c) => ({ ...c, notas: e.target.value }))} rows={2} className={`${fld} resize-none`} />
            </label>
            <p className="mt-2 text-[11px] text-slate-400">{citaQuien === "cliente" ? t("El cliente recibirá todos estos datos por email.") : t("El cliente solo recibirá la fecha; acudes tú en su nombre.")}</p>
            <button onClick={() => cita.fecha && avanzar("cita", cita)} disabled={!cita.fecha || loading} className={`${btn} mt-2 w-full bg-purple-600 text-white hover:bg-purple-700`}>
              {loading ? t("Guardando…") : t("Confirmar cita y avisar")}
            </button>
          </div>
        )}
      </div>
    ) : (
      <button onClick={() => { if (window.confirm(t("¿Finalizar este trámite? Se avisará al cliente."))) avanzar("finalizar"); }} disabled={loading} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
        {loading ? t("Guardando…") : t("Finalizar trámite")}
      </button>
    );
  } else if (estado === "CITA_HUELLAS") {
    ui = (
      <button onClick={() => { if (window.confirm(t("¿Finalizar este trámite? Se avisará al cliente."))) avanzar("finalizar"); }} disabled={loading} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
        {loading ? t("Guardando…") : t("Finalizar trámite")}
      </button>
    );
  }

  if (!ui) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      {ui}
      {error && <span className="text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
