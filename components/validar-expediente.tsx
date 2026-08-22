"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import type { Progreso } from "@/lib/progreso";

// Carta de completitud de la ficha (rediseñada el 22/08 sobre capturas de Matthias):
// el anillo con el % DENTRO (y solo ahí — nada de repetirlo en texto), los tres
// bloques con su coca verde cuando están listos, y el botón «Marcar como listo para
// presentar». El botón NO toca el %: empuja el expediente a la columna «Listo para
// presentar» del kanban y el número sigue diciendo la verdad calculada.
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

  // Coca verde cuando la parte está lista; círculo hueco gris mientras no.
  const pieza = (label: string, listo: boolean) => (
    <span className={`inline-flex items-center gap-1.5 text-xs ${listo ? "font-medium text-aproba-700" : "text-slate-400"}`}>
      {listo ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-aproba-600 text-white">
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      ) : (
        <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
      )}
      {t(label)}
    </span>
  );

  return (
    // TODO en una línea (anillo · partes · botón), pedido de Matthias — con flex-wrap
    // para que el móvil pliegue sin desbordar.
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <AnilloCompletitud pct={completitud.pct} size={44} />
      {pieza("Información", completitud.info >= 1)}
      {pieza("Documentos", completitud.docs >= 1)}
      {pieza("Formularios", completitud.formularios >= 1)}

      {completitud.manual ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-aproba-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {t("Marcado como listo para presentar")}
          </span>
          <button onClick={() => toggle(false)} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
            {loading ? "…" : t("Retirar")}
          </button>
        </div>
      ) : (
        <button onClick={() => toggle(true)} disabled={loading} className="rounded-lg border border-aproba-300 px-3.5 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-60">
          {loading ? "…" : t("Marcar como listo para presentar")}
        </button>
      )}
      {error && <p role="alert" className="w-full text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
