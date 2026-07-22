"use client";

import { useEffect, useRef, useState } from "react";

// Révèle ses enfants (fade + slide up) quand ils entrent dans le viewport.
// Filets de sécurité : prefers-reduced-motion → visible d'emblée ; et si
// l'IntersectionObserver ne tire pas (vieux WebView, prerender), un écouteur de
// scroll passif révèle au même moment — rien ne peut rester invisible.
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    let done = false;
    const mostrar = () => {
      if (done) return;
      done = true;
      setShown(true);
      io.disconnect();
      window.removeEventListener("scroll", porScroll);
    };
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) mostrar(); },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    const porScroll = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight - 40 && r.bottom > 0) mostrar();
    };
    io.observe(el);
    window.addEventListener("scroll", porScroll, { passive: true });
    requestAnimationFrame(porScroll); // ya visible al montar (above the fold) → un frame después para que la transición se vea
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", porScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
