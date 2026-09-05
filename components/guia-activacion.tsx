"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { pasoDeGuia, TOTAL_PASOS, type PasoGuia } from "@/lib/guia";
import type { DatosActivacion } from "@/lib/activacion";

// GUÍA INTERACTIVA. Un paso a la vez, señalado sobre el elemento real de la pantalla
// (foco recortado + tarjeta pegada al elemento) o, si el elemento no está en esta
// página, una tarjeta flotante con el botón que lleva a él. El paso se deduce del estado
// del despacho (GET /api/activacion), no de clics: si el usuario hace las cosas por su
// cuenta, la guía lo sigue. Se cierra con «Saltar» y no vuelve (localStorage).
const KEY = "aproba.guia.cerrada";
const EVENTO = "aproba:activacion"; // lo disparan las acciones que cambian el estado

export function GuiaActivacion() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [datos, setDatos] = useState<DatosActivacion | null>(null);
  const [cerrada, setCerrada] = useState(true); // sin parpadeo antes de leer localStorage
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dialogo, setDialogo] = useState(false);

  useEffect(() => { try { setCerrada(localStorage.getItem(KEY) === "1"); } catch { setCerrada(false); } }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/activacion", { cache: "no-store" });
      if (r.ok) setDatos(await r.json());
    } catch { /* la guía nunca rompe la página */ }
  }, []);
  useEffect(() => { if (!cerrada) void cargar(); }, [cerrada, pathname, cargar]);
  useEffect(() => {
    const h = () => { void cargar(); };
    window.addEventListener(EVENTO, h);
    return () => window.removeEventListener(EVENTO, h);
  }, [cargar]);

  const paso: PasoGuia | null = datos && !cerrada ? pasoDeGuia(datos, pathname) : null;

  // Seguir al elemento señalado (scroll, resize, re-render) y ceder ante cualquier diálogo.
  useEffect(() => {
    if (!paso) { setRect(null); return; }
    const mide = () => {
      // Solo diálogos VISIBLES: algunos componentes montan el suyo cerrado.
      setDialogo([...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((d) => d.getClientRects().length > 0 && !d.hasAttribute("data-guia-propia")));
      const el = paso.anclaje ? document.querySelector<HTMLElement>(`[data-guia="${paso.anclaje}"]`) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    mide();
    const id = window.setInterval(mide, 600);
    window.addEventListener("scroll", mide, true); window.addEventListener("resize", mide);
    return () => { window.clearInterval(id); window.removeEventListener("scroll", mide, true); window.removeEventListener("resize", mide); };
  }, [paso]);

  useEffect(() => {
    // Al llegar a la página del elemento, llevarlo a la vista.
    if (!paso?.anclaje) return;
    const el = document.querySelector<HTMLElement>(`[data-guia="${paso.anclaje}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [paso?.key, paso?.anclaje]);

  if (!paso || dialogo) return null;

  const saltar = () => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } setCerrada(true); };
  const accion = () => {
    if (paso.ir && !rect) { router.push(paso.ir); return; }
    if (paso.ir && rect) { router.push(paso.ir); return; }
    // «Entendido» sobre un elemento: no hay destino; el usuario actúa sobre él.
    if (rect) { const el = document.querySelector<HTMLElement>(`[data-guia="${paso.anclaje}"]`); el?.focus(); }
  };

  const Tarjeta = (
    <div className="w-[300px] rounded-2xl border border-aproba-200 bg-white p-4 shadow-xl">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL_PASOS }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === paso.n ? "w-5 bg-aproba-600" : i + 1 < paso.n ? "w-1.5 bg-aproba-400" : "w-1.5 bg-slate-200"}`} />
        ))}
        <span className="ml-auto text-[11px] font-medium text-slate-400">{paso.n}/{TOTAL_PASOS}</span>
      </div>
      <p className="mt-2.5 text-base font-bold tracking-tight text-slate-900">{t(paso.titulo)}</p>
      <p className="mt-1 text-sm leading-snug text-slate-600">{t(paso.texto)}</p>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <button type="button" onClick={saltar} className="text-xs font-medium text-slate-400 hover:text-slate-600">{t("Saltar la guía")}</button>
        {(paso.ir || !rect) ? (
          <button type="button" onClick={accion} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">{t(paso.cta)}</button>
        ) : (
          <span className="text-xs font-semibold text-aproba-700">{t("↓ Aquí")}</span>
        )}
      </div>
    </div>
  );

  // Con elemento en pantalla: foco recortado (sombra gigante alrededor del rect) y
  // tarjeta debajo (o encima si no cabe). Sin elemento: tarjeta flotante abajo a la derecha.
  if (rect) {
    const m = 8;
    const abajo = rect.bottom + 12 + 170 < window.innerHeight;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 312));
    return (
      <>
        <div aria-hidden className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-aproba-500 transition-all duration-300" style={{ left: rect.left - m, top: rect.top - m, width: rect.width + 2 * m, height: rect.height + 2 * m, boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.38)" }} />
        <div className="fixed z-40" style={{ left, top: abajo ? rect.bottom + 14 : undefined, bottom: abajo ? undefined : window.innerHeight - rect.top + 14 }}>{Tarjeta}</div>
      </>
    );
  }
  return <div className="fixed bottom-24 right-4 z-40 md:bottom-6 md:right-28">{Tarjeta}</div>;
}

// Para que las acciones avisen a la guía sin acoplarse a ella.
export function avisarGuia() { try { window.dispatchEvent(new Event(EVENTO)); } catch { /* */ } }
