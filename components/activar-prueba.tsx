"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Bouton qui lance le Stripe Checkout (carte obligatoire, essai 14 j) puis
// redirige vers la pasarela. Utilisé sur /onboarding/pago.
export function ActivarPrueba() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ir() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volverA: "/app" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setError(data.error ?? t("No se pudo iniciar el pago. Inténtalo de nuevo."));
    } catch {
      setError(t("No se pudo iniciar el pago. Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={ir}
        disabled={loading}
        className="w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
      >
        {loading ? t("Abriendo el pago seguro…") : t("Añadir tarjeta y empezar la prueba")}
      </button>
    </div>
  );
}
