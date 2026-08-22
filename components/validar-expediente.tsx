"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import type { Progreso } from "@/lib/progreso";

// UN botón para declarar el expediente listo (22/08/2026, pedido de Matthias).
// El gestor confirma que Información, Documentos y Formularios están OK → 100 % y
// «Listo para presentar». Reversible: el mismo bloque permite retirar la validación.
export function ValidarExpediente({ id, completitud }: { id: string; completitud: Progreso["completitud"] }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(validado: boolean) {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/validar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validado }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo validar el expediente.")); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo validar el expediente."));
    } finally { setLoading(false); }
  }

  const pieza = (label: string, v: number) => (
    <span className={`inline-flex items-center gap-1 text-[11px] ${v >= 1 ? "text-aproba-700" : "text-slate-400"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v >= 1 ? "bg-aproba-500" : "bg-slate-300"}`} />{t(label)}
    </span>
  );

  return (
    <div className="mt-4 flex flex-col items-center gap-2 border-t border-slate-100 pt-4">
      <div className="flex items-center gap-3">
        <AnilloCompletitud pct={completitud.pct} size={40} />
        <div className="text-left">
          <p className="text-sm font-semibold text-slate-800">
            {completitud.manual ? t("Validado — listo para presentar") : `${completitud.pct}% ${t("del expediente preparado")}`}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {pieza("Información", completitud.info)}
            {pieza("Documentos", completitud.docs)}
            {pieza("Formularios", completitud.formularios)}
          </div>
        </div>
      </div>

      {completitud.manual ? (
        <button onClick={() => toggle(false)} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
          {loading ? "…" : t("Retirar la validación")}
        </button>
      ) : (
        <button onClick={() => toggle(true)} disabled={loading} className="rounded-lg border border-aproba-300 px-3.5 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-60">
          {loading ? "…" : t("Marcar todo como OK y listo para presentar")}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
