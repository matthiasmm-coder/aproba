"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { PLANES, preciosDeTabla, type PlanId, type PreciosPlan } from "@/lib/planes";

// Bouton qui lance le Stripe Checkout (carte obligatoire, essai 1 mois) puis
// redirige vers la pasarela. Utilisé sur /onboarding/pago.
// Le despacho choisit son PLAN (préselectionné = celui de l'alta, jamais verrouillé :
// demande client réelle — l'écran n'offrait QUE le plan stocké) et son ciclo.
// `expirada` change le libellé : l'essai est FINI, le bouton ne peut pas dire
// « empezar la prueba » sous un titre qui annonce qu'elle est terminée.
// `precios` = importes que el servidor ha resuelto para ESTE despacho (su etiqueta Stripe,
// heredada o pública) — la pantalla nunca calcula un precio por su cuenta. `heredado`
// añade la frase que explica por qué no ve la tarifa pública.
export function ActivarPrueba({ expirada = false, plan = null, precios = null, heredado = false }: {
  expirada?: boolean; plan?: string | null; precios?: PreciosPlan | null; heredado?: boolean;
} = {}) {
  const t = useT();
  const planGuardado: PlanId | null = plan && PLANES[plan as PlanId] ? (plan as PlanId) : null;
  const [planSel, setPlanSel] = useState<PlanId>(planGuardado ?? "PRO");
  const tabla = precios ?? preciosDeTabla(false);
  const importe = (id: PlanId, ciclo: "mensual" | "anual") => tabla[id][ciclo];
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
        body: JSON.stringify({ volverA: "/app", intervalo, plan: planSel }),
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
    { id: "mensual" as const, label: t("Mensual"), nota: `${importe(planSel, "mensual")} €/mes` },
    { id: "anual" as const, label: t("Anual"), nota: `${importe(planSel, "anual")} €/año · ${t("2 meses gratis")}` },
  ];

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {/* Sélecteur de plan — le plan de l'alta est présélectionné ET marqué « Tu plan »,
          jamais imposé : quelqu'un qui a cliqué ailleurs doit retrouver le sien d'un coup d'œil. */}
      <div className="mb-2 grid grid-cols-3 gap-2 pt-2" role="radiogroup" aria-label={t("Plan")}>
        {(Object.keys(PLANES) as PlanId[]).map((id) => {
          const p = PLANES[id];
          const sel = planSel === id;
          const mio = planGuardado === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => setPlanSel(id)}
              className={`relative rounded-lg border px-2 py-2.5 text-center transition ${
                sel ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {mio && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-aproba-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {t("Tu plan")}
                </span>
              )}
              <span className={`block text-sm font-semibold ${sel ? "text-aproba-700" : "text-slate-700"}`}>{p.label}</span>
              <span className={`block text-xs font-medium ${sel ? "text-aproba-600" : "text-slate-500"}`}>
                {intervalo === "anual" ? `${importe(id, "anual")} €/año` : `${importe(id, "mensual")} €/mes`}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">
                {p.maxUsuarios === Infinity ? "∞" : p.maxUsuarios} {p.maxUsuarios === 1 ? t("usuario") : t("usuarios")} ·{" "}
                {p.maxExpedientes === Infinity ? `${t("exp.")} ∞` : `${p.maxExpedientes} ${t("exp./mes")}`}
              </span>
            </button>
          );
        })}
      </div>
      {/* Hérité : dire POURQUOI il ne voit pas la tarifa pública — sinon il croit à une erreur. */}
      {heredado && (
        <p className="mb-1 text-center text-[11px] font-medium text-aproba-700">{t("Son los precios de tu alta: la subida de tarifa no te afecta.")}</p>
      )}
      <p className="mb-3 text-center text-[11px] text-slate-400">{t("Precios sin IVA. Puedes cambiar de plan cuando quieras desde Ajustes.")}</p>
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
