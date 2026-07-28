"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { PLANES, type PlanId } from "@/lib/planes";

// Bouton qui lance le Stripe Checkout (carte obligatoire, essai 1 mois) puis
// redirige vers la pasarela. Utilisé sur /onboarding/pago.
// Le despacho choisit son ciclo : mensual, ou anual (« 2 meses gratis », = 10 × mensual).
// `expirada` change le libellé : l'essai est FINI, le bouton ne peut pas dire
// « empezar la prueba » sous un titre qui annonce qu'elle est terminée.
// `plan` affiche le prix AVANT de demander la carte (sinon écran générique).
export function ActivarPrueba({ expirada = false, plan = null }: { expirada?: boolean; plan?: string | null } = {}) {
  const t = useT();
  const info = plan && PLANES[plan as PlanId] ? PLANES[plan as PlanId] : null;
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

  // Avec le plan connu, chaque option porte son prix réel ; « 2 meses gratis »
  // reste la note anual (l'anual = 10 × le mensual). Sans plan : libellés d'avant.
  const opciones = [
    { id: "mensual" as const, label: t("Mensual"), nota: info ? `${info.precio} €/mes` : null },
    { id: "anual" as const, label: t("Anual"), nota: info ? `${info.precio * 10} €/año · ${t("2 meses gratis")}` : t("2 meses gratis") },
  ];

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && (
        <p className="mb-3 flex items-baseline justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm font-semibold text-slate-800">{t("Tu plan")}: {info.label}</span>
          <span className="text-xs text-slate-500">
            {intervalo === "anual" ? `${info.precio * 10} € ${t("al año")}` : `${info.precio} € ${t("al mes")}`} · {t("IVA no incluido")}
          </span>
        </p>
      )}
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
        {loading ? t("Abriendo el pago seguro…") : expirada ? t("Añadir tarjeta y activar mi plan") : t("Añadir tarjeta y empezar la prueba")}
      </button>
      {/* Bien visible : c'est ICI que celui qui a reçu un code promo doit apprendre où le mettre. */}
      <p className="mt-2 rounded-lg bg-aproba-50 px-3 py-2 text-center text-xs font-medium text-aproba-700">
        {t("¿Tienes un código promocional? Podrás introducirlo en la página de pago.")}
      </p>
    </div>
  );
}
