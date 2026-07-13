"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { makeT, detectarLang, esLangSoportada, type Lang } from "@/lib/portal-i18n";

const COOKIE = "aproba-cookie-aviso";
const LANG_KEY = "aproba.portal.lang"; // misma clave que el portal /j//s

export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  // En el portal del migrante el aviso habla SU idioma (guardado o del navegador);
  // en el resto de la app queda en español (idioma del gestor).
  const enPortal = pathname?.startsWith("/j/") || pathname?.startsWith("/s/");
  const [lang, setLang] = useState<Lang>("es");

  useEffect(() => {
    // Solo cookies técnicas → aviso informativo, no bloqueante.
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) {
      setVisible(true);
    }
    if (enPortal) {
      try {
        const saved = window.localStorage.getItem(LANG_KEY);
        setLang(esLangSoportada(saved) ? (saved as Lang) : detectarLang());
      } catch { /* es */ }
    }
  }, [enPortal]);

  function aceptar() {
    document.cookie = `${COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setVisible(false);
  }

  if (!visible) return null;
  const t = makeT(enPortal ? lang : "es");

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {t("cookies.texto")}{" "}
          <Link href="/legal/cookies" className="font-medium text-aproba-700 underline underline-offset-2">
            {t("cookies.politica")}
          </Link>
          .
        </p>
        <button
          onClick={aceptar}
          className="min-h-[44px] shrink-0 rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700"
        >
          {t("cookies.ok")}
        </button>
      </div>
    </div>
  );
}
