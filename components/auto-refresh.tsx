"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refresco automático mientras hay trabajo en curso del lado servidor (p. ej. un
// documento PROCESANDO por la IA): el gestor ve el estado cambiar solo, sin F5.
// Se detiene solo (maxMs) para no refrescar para siempre un doc atascado.
export function AutoRefresh({ activo, intervaloMs = 5000, maxMs = 120000 }: { activo: boolean; intervaloMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - t0 > maxMs) { window.clearInterval(id); return; }
      router.refresh();
    }, intervaloMs);
    return () => window.clearInterval(id);
  }, [activo, intervaloMs, maxMs, router]);
  return null;
}
