"use client";

import { useEffect, useRef, useState } from "react";

// «El día y la noche» animado (13/09/2026): al entrar en pantalla, la lista SIN Aproba
// aparece y se va tachando fila a fila; enfrente, cada fila CON Aproba entra con su
// marca dibujándose y un destello verde; entre las dos, una flecha. Todo en CSS
// (globals.css, prefijo .dn-) disparado por una sola clase; el orden lo da --i.
// Mismos filetes de seguridad que <Reveal>: reduced-motion → estado final de inmediato;
// sin IntersectionObserver → escucha de scroll.
// Observa un elemento y devuelve true cuando entra (una sola vez), con los filetes.
function useVisible(ref: React.RefObject<HTMLDivElement | null>, umbral: number, fraccion: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOn(true); return; }
    let done = false;
    const mostrar = () => { if (done) return; done = true; setOn(true); io.disconnect(); window.removeEventListener("scroll", porScroll); };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) mostrar(); }, { threshold: umbral, rootMargin: "0px 0px -60px 0px" });
    const porScroll = () => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight * fraccion && r.bottom > 0) mostrar(); };
    io.observe(el);
    window.addEventListener("scroll", porScroll, { passive: true });
    requestAnimationFrame(porScroll);
    return () => { io.disconnect(); window.removeEventListener("scroll", porScroll); };
  }, [ref, umbral, fraccion]);
  return on;
}

export function DiaNoche({ sin, con }: { sin: string[]; con: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const refCon = useRef<HTMLDivElement>(null);
  // La rejilla dispara el tachado (y, en escritorio, todo); la tarjeta CON tiene su
  // propio disparo: en móvil queda bajo el pliegue y solo se enciende cuando se llega a ella.
  const on = useVisible(ref, 0.35, 0.7);
  const onCon = useVisible(refCon, 0.4, 0.55);

  return (
    <div ref={ref} className={`relative mt-12 grid gap-6 md:grid-cols-2 md:gap-10 ${on ? "dn-on" : ""}`}>
      {/* Sin Aproba: cada fila aparece y luego se tacha */}
      <div className="dn-sin h-full rounded-2xl border border-slate-200 bg-cream-50 p-7">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sin Aproba</h3>
        <ul className="mt-5 space-y-3 text-slate-600">
          {sin.map((s, i) => (
            <li key={s} className="dn-item flex items-start gap-3" style={{ ["--i" as string]: i }}>
              <svg className="dn-x mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              <span className="dn-text">{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Flecha entre las dos columnas (solo escritorio) */}
      <span aria-hidden className="dn-arrow absolute left-1/2 top-1/2 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-aproba-200 bg-white text-aproba-700 shadow-card md:flex">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>

      {/* Con Aproba: cada fila entra con la marca dibujándose y un destello */}
      <div ref={refCon} className={`dn-con dn-con-card h-full rounded-2xl border-2 border-aproba-600 bg-white p-7 shadow-card ${on && onCon ? "dn-go" : ""}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-aproba-700">Con Aproba</h3>
        <ul className="mt-5 space-y-3 text-slate-700">
          {con.map((s, i) => (
            <li key={s} className="dn-item -mx-2 flex items-start gap-3 rounded-lg px-2 py-0.5" style={{ ["--i" as string]: i }}>
              <svg className="dn-check mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
