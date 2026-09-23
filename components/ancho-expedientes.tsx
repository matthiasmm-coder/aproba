"use client";

import { useEffect, useState } from "react";

// Ancho de la pantalla Expedientes (PROTOTIPO LOCAL, 23/09/2026). La lista vive a 1 024 px
// a propósito (mismo ancho que Inicio, pedido de Matthias 03/09); el MODO TABLA necesita
// más, porque son las 11 columnas del Excel de Jennifer. El modo lo guarda la lista en
// este navegador y avisa con un evento: aquí solo se escucha y se ensancha.
export const MODO_EXPEDIENTES_KEY = "aproba.expedientes.modo";
export const EVENTO_MODO_EXPEDIENTES = "expedientes-modo";

export function AnchoExpedientes({ activo = true, children }: { activo?: boolean; children: React.ReactNode }) {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    if (!activo) return;
    try { setAncho(window.localStorage.getItem(MODO_EXPEDIENTES_KEY) === "tabla"); } catch { /* sin storage */ }
    const h = (e: Event) => setAncho((e as CustomEvent).detail === "tabla");
    window.addEventListener(EVENTO_MODO_EXPEDIENTES, h);
    return () => window.removeEventListener(EVENTO_MODO_EXPEDIENTES, h);
  }, [activo]);
  return <div className={`mx-auto ${activo && ancho ? "max-w-7xl" : "max-w-5xl"}`}>{children}</div>;
}
