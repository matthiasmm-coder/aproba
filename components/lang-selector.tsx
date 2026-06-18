"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, LANGS, type Lang } from "@/lib/app-i18n";
import { useLang, useT } from "@/components/lang-provider";

// Sélecteur de langue de l'interface (es/ca). Écrit le cookie et rafraîchit la route
// → les Server Components se re-rendent dans la nouvelle langue, le contexte client aussi.
export function LangSelector() {
  const router = useRouter();
  const lang = useLang();
  const t = useT();

  function cambiar(nuevo: Lang) {
    document.cookie = `${LANG_COOKIE}=${nuevo}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <h3 className="text-sm font-semibold text-slate-800">{t("Idioma de la interfaz")}</h3>
      <p className="mt-1 text-sm text-slate-500">{t("Elige el idioma en el que quieres ver Aproba.")}</p>
      <div className="mt-4 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => cambiar(l.code)}
            aria-pressed={lang === l.code}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              lang === l.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
