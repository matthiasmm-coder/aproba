"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Botón dentro del aviso de documentos pendientes: reenvía al cliente un email con
// la lista de lo que falta + el enlace para subirlos (/api/expedientes/[id]/recordar-docs).
export function RecordarDocsButton({ expedienteId }: { expedienteId: string }) {
  const t = useT();
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function recordar() {
    setEstado("enviando"); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/recordar-docs`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo enviar el recordatorio."));
      setEstado("ok");
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : t("No se pudo enviar el recordatorio."));
    }
  }

  return (
    <div className="mt-2.5">
      <button
        onClick={recordar}
        disabled={estado === "enviando" || estado === "ok"}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-default disabled:opacity-70 sm:min-h-0"
      >
        {estado === "ok" ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
        )}
        {estado === "enviando" ? t("Enviando…") : estado === "ok" ? t("Recordatorio enviado ✓") : t("Recordar al cliente")}
      </button>
      {estado === "error" && error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
