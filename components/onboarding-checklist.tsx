"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";

export type ChecklistItem = { key: string; label: string; href: string; done: boolean };

const KEY = "aproba.checklist.dismissed";

// Checklist « termina de configurar tu despacho » sur le dashboard — rappelle les
// étapes d'onboarding sautées (dérivées des données). Dismissable.
export function OnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(true); // évite le flash avant hydratation
  useEffect(() => { setDismissed(localStorage.getItem(KEY) === "1"); }, []);

  const pendientes = items.filter((i) => !i.done);
  const hechos = items.filter((i) => i.done).length;
  if (dismissed || pendientes.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-aproba-200 bg-aproba-50/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t("Termina de configurar tu despacho")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{hechos} {t("de")} {items.length} {hechos === 1 ? t("completado") : t("completados")}. {t("Te llevará un par de minutos.")}</p>
        </div>
        <button onClick={() => { localStorage.setItem(KEY, "1"); setDismissed(true); }} aria-label={t("Ocultar")} className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {pendientes.map((i) => (
          <Link key={i.key} href={i.href} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-aproba-300 hover:text-aproba-700">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-300">+</span>
            {t(i.label)}
          </Link>
        ))}
      </div>
    </div>
  );
}
