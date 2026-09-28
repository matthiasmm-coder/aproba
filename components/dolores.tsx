"use client";

import { useRef } from "react";
import { useFase } from "./dia-noche";

// «¿Te suena esto?» — rehecho el 28/09/2026 (Matthias: «más elegante»): cuatro frases con
// filetes finos y números en mono, sin tarjetas ni iconos, y una sola nota de color en la
// frase final. Animación en CSS (globals.css, prefijo .dl-), mismo patrón que dia-noche:
// estado FINAL por defecto (sin JS, reduced-motion o ya a la vista al cargar); solo una
// sección fuera de pantalla se «arma» y se anima al entrar: cada fila aparece con un
// fundido y su filete se traza de izquierda a derecha, una tras otra.
export function Dolores({ dolores }: { dolores: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const fase = useFase(ref, 0.2);

  return (
    <div ref={ref} className={fase === "armado" ? "dl-a" : fase === "on" ? "dl-on" : ""}>
      <ol className="mt-12">
        {dolores.map((d, i) => (
          <li key={d} className="dl-fila" style={{ ["--i" as string]: i }}>
            <div className="dl-texto flex items-baseline gap-5 py-5 sm:gap-8 sm:py-6">
              <span className="w-6 shrink-0 font-mono text-sm tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              <p className="text-lg font-medium leading-snug tracking-[-0.01em] text-slate-800 sm:text-[22px]">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="dl-fin" style={{ ["--i" as string]: dolores.length }} />
      <p className="dl-cierre mt-12 text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        <span className="text-aproba-600">Aproba</span> se ocupa de todo eso.{" "}
        <span className="block text-slate-500 sm:inline">Tú, de tus clientes.</span>
      </p>
    </div>
  );
}
