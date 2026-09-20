"use client";

import { createContext, useCallback, useContext } from "react";
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
  // Identidad ESTABLE mientras no cambie el idioma. Si `t` fuera una función nueva en
  // cada render, cualquier efecto que la lleve en sus dependencias se relanzaría sin
  // parar: la memoria de actividad pedía /api/memoria en bucle y su botón, desactivado
  // mientras carga, no llegaba a activarse nunca.
  return useCallback((es: string) => translate(lang, es), [lang]);
}
