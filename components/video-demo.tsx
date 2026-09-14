"use client";

import { useState } from "react";
import Image from "next/image";

// Vídeo «Aproba en 90 segundos» de la portada. Antes era un <video preload="metadata"
// poster="/demo-poster.jpg">: en móvil Chrome bajaba ~200 KB del MP4 y el póster JPEG de
// 67 KB durante la carga, compitiendo con CSS/JS/fuentes por una sección que está muy por
// debajo del pliegue. Ahora el póster es un next/image perezoso (WebP al tamaño real) con
// un botón de reproducción, y el <video> solo se monta al pulsar (autoplay tras el gesto).
const ANCHO = 1920, ALTO = 1200;

export function VideoDemo() {
  const [reproducir, setReproducir] = useState(false);
  if (reproducir) {
    return (
      <video controls autoPlay playsInline preload="auto" className="h-auto w-full bg-black" style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}>
        <source src="/demo.mp4" type="video/mp4" />
        Tu navegador no admite la reproducción de vídeo.
      </video>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setReproducir(true)}
      aria-label="Reproducir el vídeo: Aproba en 90 segundos"
      className="group relative block w-full bg-black"
      style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}
    >
      <Image src="/demo-poster.jpg" alt="" width={1280} height={800} quality={85} sizes="(min-width: 896px) 848px, calc(100vw - 48px)" className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-aproba-700 shadow-float transition group-hover:scale-105 group-hover:bg-white">
          <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72c0 .79.87 1.27 1.54.85l10.6-6.86a1 1 0 0 0 0-1.7L9.54 4.29A1 1 0 0 0 8 5.14Z" /></svg>
        </span>
      </span>
    </button>
  );
}
