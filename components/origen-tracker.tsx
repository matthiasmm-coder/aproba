"use client";

import { useEffect } from "react";
import { recordarOrigen } from "@/lib/origen";

// Monta una sola vez en las páginas públicas: anota de dónde vino el visitante la
// PRIMERA vez que llega. No pinta nada, no bloquea nada, y si el almacenamiento falla
// (modo privado) la web funciona igual — la medición nunca es más importante que la página.
export function OrigenTracker() {
  useEffect(() => { recordarOrigen(window.location.href, document.referrer); }, []);
  return null;
}
