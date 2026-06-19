"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { ExpedienteEstado } from "@/lib/types";

// Action contextuelle du gestor selon l'état de l'expediente (état-machine côté
// /api/expedientes/[id]/avanzar). Chaque transition prévient le client par email.
export function SiguientePaso({ id, estado }: { id: string; estado: ExpedienteEstado }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");

  async function avanzar(accion: string, extra?: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("No se pudo completar la acción."));
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally {
      setLoading(false);
    }
  }

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60";
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
    ui = (
      <div className="flex items-center gap-2">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label={t("Fecha de la cita")} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-aproba-600" />
        <button onClick={() => fecha && avanzar("cita", { fecha })} disabled={loading || !fecha} className={`${btn} bg-purple-600 text-white hover:bg-purple-700`}>{t("Asignar cita de huellas")}</button>
      </div>
    );
  } else if (estado === "CITA_HUELLAS") {
    ui = (
      <button onClick={() => { if (window.confirm(t("¿El cliente ya tiene su TIE? Se marcará el trámite como completado."))) avanzar("finalizar"); }} disabled={loading} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
        {loading ? t("Guardando…") : t("TIE entregado · finalizar")}
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
