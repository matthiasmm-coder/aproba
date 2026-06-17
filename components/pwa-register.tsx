"use client";

import { useEffect } from "react";

// Enregistre le service worker (rend la PWA installable) et capture l'événement
// `beforeinstallprompt` (qui peut survenir avant le montage du bouton d'installation) :
// on le met de côté sur window + on prévient via un événement custom.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __aprobaInstallPrompt?: Event }).__aprobaInstallPrompt = e;
      window.dispatchEvent(new Event("aproba-installable"));
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);
  return null;
}
