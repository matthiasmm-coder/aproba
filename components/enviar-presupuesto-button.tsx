"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// «Enviar por email» junto al enlace del presupuesto: manda al cliente el mismo PDF
// adjunto, sin descargarlo (/api/expedientes/[id]/presupuesto-email).
export function EnviarPresupuestoButton({ expedienteId }: { expedienteId: string }) {
  const t = useT();
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEstado("enviando"); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/presupuesto-email`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo enviar el presupuesto."));
      setEstado("ok");
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : t("No se pudo enviar el presupuesto."));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={enviar}
        disabled={estado === "enviando" || estado === "ok"}
        className="inline-block py-2 font-medium text-aproba-700 underline underline-offset-2 transition hover:text-aproba-600 disabled:no-underline disabled:opacity-70 sm:py-0"
      >
        {estado === "enviando" ? t("enviando…") : estado === "ok" ? t("presupuesto enviado ✓") : t("enviar por email")}
      </button>
      {estado === "error" && error && <span className="ml-2 text-red-600">{error}</span>}
    </>
  );
}
