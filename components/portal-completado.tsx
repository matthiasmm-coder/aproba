"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";
import { LANGS, makeT, detectarLang, type Lang, esLangSoportada } from "@/lib/portal-i18n";

// Affiché sur le lien initial /j/[token] APRÈS que le client a terminé son parcours.
// Le lien d'onboarding ne se rejoue plus ; on renvoie vers le suivi /s/[token].
export function PortalCompletado({ token, gestoria, idioma }: { token: string; gestoria: string; idioma: string }) {
  const [lang, setLang] = useState<Lang>((esLangSoportada(idioma) ? idioma : "es") as Lang);
  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("aproba.portal.lang")) as Lang | null;
    if (saved && LANGS.some((l) => l.code === saved)) setLang(saved);
    else if (!esLangSoportada(idioma)) setLang(detectarLang());
  }, [idioma]);
  const t = makeT(lang);
  const inicial = gestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{inicial}</span>
            <span className="text-sm font-semibold text-slate-800">{gestoria}</span>
          </div>
          <select value={lang} onChange={(e) => { setLang(e.target.value as Lang); try { localStorage.setItem("aproba.portal.lang", e.target.value); } catch { /* */ } }} aria-label={t("lang.selectLabel")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-aproba-600">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>
      </header>

      <div className="mx-auto flex max-w-md flex-col items-center px-5 pt-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-aproba-100 text-aproba-600">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{t("done.titulo")}</h1>
        <p className="mt-3 max-w-xs leading-relaxed text-slate-600">{t("done.intro")}</p>
        <a href={`/s/${token}`} className="mt-7 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">
          {t("notif.seg.boton")}
        </a>
        <p className="mt-6 flex items-center gap-1 text-xs text-slate-400">{t("header.con")} <AprobaMark size={13} /> aproba</p>
      </div>
    </div>
  );
}
