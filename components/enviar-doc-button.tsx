"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Manda al cliente el presupuesto, o la hoja de encargo + el mandato para firmar,
// con los PDF adjuntos (/api/expedientes/[id]/enviar-doc?doc=…). Mismo enlace visual
// que las descargas de al lado: es una acción más de la misma línea.
export function EnviarDocButton({ expedienteId, doc }: { expedienteId: string; doc: "presupuesto" | "encargo" }) {
  const t = useT();
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEstado("enviando"); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/enviar-doc?doc=${doc}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo enviar el documento."));
      setEstado("ok");
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : t("No se pudo enviar el documento."));
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
        {estado === "enviando" ? t("enviando…") : estado === "ok" ? t("enviado ✓") : t("enviar por email")}
      </button>
      {estado === "error" && error && <span className="ml-2 text-red-600">{error}</span>}
    </>
  );
}
