"use client";

import { useEffect } from "react";
import { recordarOrigen } from "@/lib/origen";

// Anota de dónde vino el visitante la PRIMERA vez que llega — pero solo si ha aceptado
// el aviso de cookies (ver lib/origen.ts). Como el aviso se acepta DESPUÉS de aterrizar,
// se reintenta al hacer clic en cualquier sitio: así la primera visita no se pierde,
// que es justo la que dice de dónde viene la persona.
export function OrigenTracker() {
  useEffect(() => {
    const anotar = () => recordarOrigen(window.location.href, document.referrer);
    anotar();
    document.addEventListener("click", anotar, { passive: true });
    return () => document.removeEventListener("click", anotar);
  }, []);
  return null;
}
