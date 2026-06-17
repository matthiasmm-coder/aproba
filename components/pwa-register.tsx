"use client";

import { useEffect } from "react";

// Enregistre le service worker (rend la PWA installable). Silencieux en cas d'échec
// ou de navigateur non compatible.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
