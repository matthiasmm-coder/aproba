"use client";

import { useEffect } from "react";

// Enregistre le service worker (rend la PWA installable) et capture l'événement
// `beforeinstallprompt` (qui peut survenir avant le montage du bouton d'installation) :
// on le met de côté sur window + on prévient via un événement custom.
export function PwaRegister() {
  useEffect(() => {
    // Se registra DESPUÉS de `load` (y en un hueco de inactividad): registrar el SW durante
    // la carga hace que Chrome pida manifest + iconos mientras aún bajan CSS/JS/fuentes.
    let cancelado = false;
    const registrar = () => { if (!cancelado && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); };
    const enHueco = () => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(registrar, { timeout: 4000 }); else window.setTimeout(registrar, 1500); };
    if (document.readyState === "complete") enHueco();
    else window.addEventListener("load", enHueco, { once: true });
    const onBip = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __aprobaInstallPrompt?: Event }).__aprobaInstallPrompt = e;
      window.dispatchEvent(new Event("aproba-installable"));
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => { cancelado = true; window.removeEventListener("load", enHueco); window.removeEventListener("beforeinstallprompt", onBip); };
  }, []);
  return null;
}
