"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// VIGÍA — caducidad de la TIE del cliente, editable desde su ficha. Es la forma de
// amorçar el radar sobre la cartera EXISTENTE (clientes cuyos documentos nunca
// pasaron por el portal). Al guardar: Cliente.fechaCaducidad + vencimiento (REAL).
export function CaducidadTie({ clienteId, fechaActual }: { clienteId: string; fechaActual: string | null }) {
  const t = useT();
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaActual ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dias = fechaActual ? Math.ceil((Date.parse(fechaActual) - Date.now()) / 864e5) : null;

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      const res = await fetch("/api/clientes/caducidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ clienteId, fecha }] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setGuardado(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Caducidad de la TIE")}</h2>
          {fechaActual && dias !== null ? (
            <p className="mt-1 text-sm">
              <span className={`font-semibold ${dias < 0 ? "text-red-600" : dias <= 60 ? "text-amber-600" : "text-slate-800"}`}>
                {dias < 0 ? t("Caducó hace {n} días").replace("{n}", String(-dias)) : t("Caduca en {n} días").replace("{n}", String(dias))}
              </span>
              <span className="text-slate-400"> · {t("vigilada en Vencimientos")}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">{t("Registra la caducidad y Vigía te avisará cuando toque renovar — sin esperar a un expediente.")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => { setFecha(e.target.value); setGuardado(false); }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600"
            aria-label={t("Caducidad de la TIE")}
          />
          <button
            onClick={guardar}
            disabled={guardando || !fecha || fecha === fechaActual}
            className="min-h-[40px] rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {guardando ? t("Guardando…") : guardado ? t("Guardado ✓") : t("Guardar")}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
