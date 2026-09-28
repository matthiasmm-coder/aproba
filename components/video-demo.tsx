"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Vídeo de la portada (1 min 20, 16:9, 60 fps; el mismo de las redes, subtítulos incrustados).
// Arranca SOLO y en silencio cuando la sección se ve (los navegadores solo dejan arrancar sin gesto
// si no hay sonido); «Activar sonido» lo reinicia desde el principio con la voz y los controles.
// Carga (PSI móvil): nada del vídeo baja durante la carga de la página — el póster es un next/image
// perezoso y el <video> se monta a ~400 px de la sección; fuera de pantalla se pausa.
// 1080p en escritorio, 720p en móvil (H.264 + faststart: empieza antes de terminar de bajar).
// Sin arranque automático si el usuario pide menos movimiento o ahorro de datos, o si el navegador
// lo bloquea (modo ahorro de batería en iOS): póster + botón, como antes.
const ANCHO = 1920, ALTO = 1080;
const FUENTE_HD = "/video/aproba-1080.mp4";
const FUENTE_MOVIL = "/video/aproba-720.mp4";

export function VideoDemo() {
  const caja = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cerca, setCerca] = useState(false);          // monta el <video>
  const [visible, setVisible] = useState(false);      // en modo automático: reproduce / pausa
  const [auto, setAuto] = useState(true);             // silencio + bucle mientras se ve
  const [conSonido, setConSonido] = useState(false);  // el usuario activó el sonido: controles nativos
  const [pausado, setPausado] = useState(false);      // pausa pedida por el usuario (no se reanuda sola)
  const [pintado, setPintado] = useState(false);      // ya hay imagen: se retira el póster
  const [fuente, setFuente] = useState(FUENTE_HD);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ahorroDatos = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (menosMovimiento || ahorroDatos) setAuto(false);
    setFuente(window.matchMedia("(min-width: 768px)").matches ? FUENTE_HD : FUENTE_MOVIL);
    const acerca = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCerca(true); acerca.disconnect(); } }, { rootMargin: "400px 0px" });
    const mira = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio >= 0.4), { threshold: [0, 0.4] });
    acerca.observe(el);
    mira.observe(el);
    return () => { acerca.disconnect(); mira.disconnect(); };
  }, []);

  // Modo automático: en silencio mientras se ve; fuera de pantalla, en pausa.
  useEffect(() => {
    const v = video.current;
    if (!v || !auto || conSonido || pausado) return;
    v.muted = true;
    // Solo un bloqueo real (NotAllowedError) desactiva el modo automático; un AbortError (una pausa que
    // interrumpe el arranque al entrar y salir de pantalla) no.
    if (visible) v.play().catch((e) => { if (e?.name === "NotAllowedError") setAuto(false); });
    else v.pause();
  }, [cerca, visible, auto, conSonido, pausado]);

  // Dentro del gesto del clic (Safari solo deja sonar lo que arranca en el propio gesto).
  const activarSonido = () => {
    const v = video.current;
    if (!v) return;
    setConSonido(true);
    setPausado(false);
    v.muted = false;
    v.loop = false;
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  const alternarPausa = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { setPausado(false); v.play().catch(() => {}); }
    else { setPausado(true); v.pause(); }
  };

  const botonPlay = !auto && !conSonido;             // sin arranque automático: botón central, como antes
  return (
    <div ref={caja} className="relative w-full bg-white" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}>
      {cerca && (
        <video
          ref={video}
          className="absolute inset-0 h-full w-full"
          src={fuente}
          muted={!conSonido}
          loop={!conSonido}
          playsInline
          preload={auto ? "auto" : "none"}
          controls={conSonido}
          onPlaying={() => setPintado(true)}
          aria-label="Vídeo: Aproba en 80 segundos"
        />
      )}
      <Image
        src="/video/aproba-poster.jpg"
        alt=""
        width={ANCHO}
        height={ALTO}
        quality={85}
        sizes="(min-width: 896px) 848px, calc(100vw - 48px)"
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${pintado ? "opacity-0" : "opacity-100"}`}
      />
      {botonPlay && (
        <button type="button" onClick={activarSonido} aria-label="Reproducir el vídeo: Aproba en 80 segundos" className="group absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-aproba-700 shadow-float transition group-hover:scale-105 group-hover:bg-white">
            <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72c0 .79.87 1.27 1.54.85l10.6-6.86a1 1 0 0 0 0-1.7L9.54 4.29A1 1 0 0 0 8 5.14Z" /></svg>
          </span>
        </button>
      )}
      {/* En móvil, arriba: abajo tapaban los subtítulos incrustados del vídeo. */}
      {auto && !conSonido && cerca && (
        <>
          <button type="button" onClick={alternarPausa} aria-label={pausado ? "Reanudar el vídeo" : "Pausar el vídeo"}
            className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur transition hover:bg-slate-900/85 sm:bottom-4 sm:left-4 sm:top-auto sm:h-9 sm:w-9">
            {pausado
              ? <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72c0 .79.87 1.27 1.54.85l10.6-6.86a1 1 0 0 0 0-1.7L9.54 4.29A1 1 0 0 0 8 5.14Z" /></svg>
              : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
          </button>
          <button type="button" onClick={activarSonido}
            className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-slate-900/75 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-float backdrop-blur transition hover:bg-slate-900/90 sm:bottom-4 sm:right-4 sm:top-auto sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m23 9-6 6M17 9l6 6" /></svg>
            Activar sonido
          </button>
        </>
      )}
    </div>
  );
}
