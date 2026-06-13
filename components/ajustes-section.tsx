"use client";

import { useState, type ReactNode } from "react";

// Section pliable pour la page Ajustes. Le contenu reste monté (les managers
// conservent leur état et leur persistance) ; on l'ouvre/ferme avec une
// animation de hauteur via l'astuce CSS grid-rows 0fr ↔ 1fr.
export function AjustesSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/70 sm:px-6 sm:py-5"
      >
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aproba-50 text-aproba-700">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{title}</span>
          {subtitle && <span className="mt-0.5 block text-sm text-slate-500">{subtitle}</span>}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-5 pb-6 pt-5 sm:px-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
