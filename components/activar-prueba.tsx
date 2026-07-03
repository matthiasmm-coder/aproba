"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Bouton qui lance le Stripe Checkout (carte obligatoire, essai 1 mois) puis
// redirige vers la pasarela. Utilisé sur /onboarding/pago.
// Le despacho choisit son ciclo : mensual, ou anual (« 2 meses gratis », = 10 × mensual).
export function ActivarPrueba() {
  const t = useT();
  const [intervalo, setIntervalo] = useState<"mensual" | "anual">("mensual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ir() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volverA: "/app", intervalo }),
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

  const opciones = [
    { id: "mensual" as const, label: t("Mensual"), nota: null },
    { id: "anual" as const, label: t("Anual"), nota: t("2 meses gratis") },
  ];

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("Ciclo de facturación")}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={intervalo === o.id}
            onClick={() => setIntervalo(o.id)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
              intervalo === o.id ? "border-aproba-600 bg-aproba-50 text-aproba-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {o.label}
            {o.nota && <span className={`block text-xs font-medium ${intervalo === o.id ? "text-aproba-600" : "text-slate-400"}`}>{o.nota}</span>}
          </button>
        ))}
      </div>
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
