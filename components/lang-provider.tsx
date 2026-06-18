"use client";

import { createContext, useContext } from "react";
import { translate, type Lang } from "@/lib/app-i18n";

// La langue est résolue côté serveur (cookie) et passée ici ; les Client Components
// la consomment via useT()/useLang(). Au changement de langue, le serveur re-rend
// (router.refresh) avec la nouvelle valeur → toute l'UI se met à jour.
const LangContext = createContext<Lang>("es");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): (es: string) => string {
  const lang = useContext(LangContext);
  return (es: string) => translate(lang, es);
}
