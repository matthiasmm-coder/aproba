"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Borra el expediente de EJEMPLO y su cliente ficticio (DELETE /api/ejemplo). Sin modal:
// es una demostración, no un expediente — no hay nada que perder.
export function EliminarEjemploButton() {
  const t = useT();
  const router = useRouter();
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function borrar() {
    setBorrando(true); setError(null);
    try {
      const res = await fetch("/api/ejemplo", { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo borrar el ejemplo.")); }
      router.push("/app"); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo borrar el ejemplo."));
      setBorrando(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={borrar} disabled={borrando} className="text-sm font-semibold text-aproba-800 underline decoration-aproba-300 underline-offset-2 hover:text-aproba-900 disabled:opacity-60">
        {borrando ? t("Borrando…") : t("Borrar el ejemplo")}
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
