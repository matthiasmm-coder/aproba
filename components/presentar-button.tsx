"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Marque l'expediente comme présenté (depuis « formularios generados ») → avise le
// client. Affiché seulement quand l'expediente est en FORM_GENERADO.
export function PresentarButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function presentar() {
    if (!window.confirm(t("¿Marcar este expediente como presentado? Se avisará al cliente."))) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/presentar`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("No se pudo presentar."));
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo presentar."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={presentar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
        {loading ? t("Presentando…") : t("Marcar como presentado")}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
