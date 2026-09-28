"use client";

import { useEffect, useRef, useState } from "react";
import { repartir, type ParteCita } from "@/lib/testimonio";

// TESTIMONIO QUE SE ESCRIBE (Matthias, 28/09/2026): al entrar la tarjeta en pantalla, la
// cita se escribe detrás de un cursor y, al terminar, el sello del nº de colegiado salta
// con un zoom (crece, se pasa y vuelve).
// Rápida y fluida (pedido de Matthias): la cita entera en DURACION, a ritmo constante y al
// compás de los fotogramas del navegador (requestAnimationFrame), no letra a letra con
// temporizadores, que dan tirones.
// Sin saltos de maquetación: el texto ENTERO está en el DOM desde el servidor (SEO,
// lectores de pantalla; sin JS se ve completo) y lo aún no escrito va en transparente, así
// cada línea ocupa desde el principio el sitio que tendrá al final. La marca verde crece
// con el texto. Con prefers-reduced-motion no se mueve nada.

const DURACION = 1000; // ms para escribir la cita entera
const ESPERA = 350; // ms entre que se ve la tarjeta y la primera letra: deja avanzar el fundido de Reveal

const MARCA = "bg-[linear-gradient(transparent_62%,#D1FAE5_62%)] [-webkit-box-decoration-break:clone] [box-decoration-break:clone]";

type Fase = "completo" | "espera" | "escribiendo" | "hecho";

// Cursor de ancho cero: no empuja ni una letra, así ninguna línea cambia al escribir.
function Cursor({ fin }: { fin: boolean }) {
  return (
    <span aria-hidden="true" className="relative">
      <span className={`absolute -bottom-[0.2em] left-[1px] h-[1.15em] w-[2px] rounded-full bg-aproba-600 ${fin ? "animate-[aproba-cursor-fin_1.4s_steps(1)_forwards]" : ""}`} />
    </span>
  );
}

export function TestimonioEscrito({ partes, nombre, cargo, sello }: { partes: ParteCita[]; nombre: string; cargo: string; sello: string }) {
  const texto = partes.map((p) => p.t).join("");
  const total = texto.length;
  const ref = useRef<HTMLQuoteElement>(null);
  const [fase, setFase] = useState<Fase>("completo"); // el servidor lo pinta entero
  const [n, setN] = useState(total);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // La tarjeta está bajo el pliegue: nadie ve este paso de «completo» a «en blanco».
    setFase("espera");
    setN(0);
    let vivo = true;
    let empezado = false;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let fotograma = 0;
    // Cuántas letras tocan según el tiempo transcurrido: a 60 fps, unas dos por fotograma.
    const escribir = (t0: number) => (ahora: number) => {
      if (!vivo) return;
      const avance = Math.min(1, (ahora - t0) / DURACION);
      setN(Math.round(total * avance));
      if (avance < 1) fotograma = requestAnimationFrame(escribir(t0));
      else setFase("hecho");
    };
    const empezar = () => {
      if (empezado) return;
      empezado = true;
      io.disconnect();
      window.removeEventListener("scroll", porScroll);
      setFase("escribiendo");
      reloj = setTimeout(() => { fotograma = requestAnimationFrame((t) => escribir(t)(t)); }, ESPERA);
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) empezar(); }, { threshold: 0.6 });
    // Red de seguridad, como en Reveal: si el observador no dispara, el scroll lo hace.
    const porScroll = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.8 && r.bottom > 0) empezar();
    };
    io.observe(el);
    window.addEventListener("scroll", porScroll, { passive: true });
    requestAnimationFrame(porScroll);
    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
      cancelAnimationFrame(fotograma);
      io.disconnect();
      window.removeEventListener("scroll", porScroll);
    };
  }, [total]);

  const trozos = repartir(partes, n);
  const conCursor = fase === "escribiendo" || fase === "hecho";
  // El cursor va tras la última letra escrita: en la primera parte que aún tiene pendiente,
  // o al final de la última si ya está todo.
  const iPendiente = trozos.findIndex((p) => p.pendiente.length > 0);
  const parteCursor = iPendiente === -1 ? trozos.length - 1 : iPendiente;
  const selloOculto = fase === "espera" || fase === "escribiendo";

  return (
    <>
      <blockquote ref={ref} className="relative mt-5 text-[16.8px] font-medium leading-[1.5] tracking-[-0.01em] text-slate-900 sm:text-[21.6px] sm:leading-[1.45]">
        {trozos.map((p, i) => (
          <span key={i}>
            {p.escrito ? <span className={p.marca ? MARCA : undefined}>{p.escrito}</span> : null}
            {conCursor && i === parteCursor ? <Cursor fin={fase === "hecho"} /> : null}
            {p.pendiente ? <span className="text-transparent">{p.pendiente}</span> : null}
          </span>
        ))}
      </blockquote>
      <figcaption className="relative mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-slate-100 pt-6">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-slate-900">{nombre}</span>
          <span className="mt-0.5 block text-sm leading-snug text-slate-500">{cargo}</span>
        </span>
        <span
          className={`shrink-0 rounded-full bg-aproba-50 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-aproba-700 ring-1 ring-inset ring-aproba-200 ${
            selloOculto ? "scale-0 opacity-0" : fase === "hecho" ? "animate-[aproba-sello_750ms_ease-out_200ms_both]" : ""
          }`}
        >
          {sello}
        </span>
      </figcaption>
    </>
  );
}
