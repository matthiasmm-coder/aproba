"use client";

import { useEffect } from "react";

// Anota UNA vez por carga que alguien ha abierto la tarjeta (/m). Sin cookies ni datos
// personales; si la llamada falla, no pasa nada: es una medida, no una función.
export function RegistrarEscaneo({ fuente }: { fuente: string | null }) {
  useEffect(() => {
    const cuerpo = JSON.stringify({ fuente });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/m/scan", new Blob([cuerpo], { type: "application/json" }));
      else void fetch("/api/m/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo, keepalive: true });
    } catch { /* ignorado a propósito */ }
  }, [fuente]);
  return null;
}
