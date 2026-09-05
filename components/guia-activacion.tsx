"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
const EVENTO_ESTADO = "aproba:guia"; // lo dispara la guía al pasar a activa/inactiva

type Caja = { left: number; top: number; width: number; height: number; right: number; bottom: number };
const mismaCaja = (a: Caja | null, b: Caja | null) =>
  (!a && !b) || Boolean(a && b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

// Estado publicado en <html data-guia="activa|inactiva"> para que otros bloques (la
// checklist del panel) se retiren mientras la guía lleva la mano, sin acoplarse a ella.
// Ausente = todavía no se sabe (localStorage o /api/activacion pendientes).
export type EstadoGuia = "activa" | "inactiva";
export const EVENTO_GUIA = EVENTO_ESTADO;
export function estadoGuia(): EstadoGuia | null {
  try { const v = document.documentElement.dataset.guia; return v === "activa" || v === "inactiva" ? v : null; } catch { return null; }
}

export function GuiaActivacion() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [datos, setDatos] = useState<DatosActivacion | null>(null);
  const [cerrada, setCerrada] = useState(true); // sin parpadeo antes de leer localStorage
  const [leida, setLeida] = useState(false); // localStorage ya consultado
  const [fallo, setFallo] = useState(false); // /api/activacion no respondió: la guía calla, la checklist puede salir
  const [rect, setRect] = useState<Caja | null>(null);
  const [dialogo, setDialogo] = useState(false);

  useEffect(() => { try { setCerrada(localStorage.getItem(KEY) === "1"); } catch { setCerrada(false); } setLeida(true); }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/activacion", { cache: "no-store" });
      if (r.ok) setDatos(await r.json()); else setFallo(true);
    } catch { setFallo(true); /* la guía nunca rompe la página */ }
  }, []);
  useEffect(() => { if (!cerrada) void cargar(); }, [cerrada, pathname, cargar]);
  useEffect(() => {
    const h = () => { void cargar(); };
    window.addEventListener(EVENTO, h);
    return () => window.removeEventListener(EVENTO, h);
  }, [cargar]);

  // Memoizado: pasoDeGuia devuelve un objeto nuevo en cada render y, como dependencia de un
  // efecto, lo rearmaba en bucle (render → medir → setRect → render…). Ese bucle hacía
  // temblar el foco y, peor, dejaba sin terminar la navegación de router.push (una
  // transición de React que las actualizaciones continuas interrumpen sin parar).
  const paso: PasoGuia | null = useMemo(() => (datos && !cerrada ? pasoDeGuia(datos, pathname) : null), [datos, cerrada, pathname]);

  // Publicar el estado en cuanto se conoce (nunca antes: evitaría que la checklist
  // apareciera un instante y se escondiera al cargar la guía).
  const conocida = leida && (cerrada || datos !== null || fallo);
  const activa = Boolean(paso);
  useEffect(() => {
    if (!conocida) return;
    document.documentElement.dataset.guia = activa ? "activa" : "inactiva";
    window.dispatchEvent(new Event(EVENTO_ESTADO));
  }, [conocida, activa]);

  // Seguir al elemento señalado y ceder ante cualquier diálogo. Se mide en cada frame
  // (requestAnimationFrame: sigue el scroll suave sin saltos) pero SOLO se actualiza el
  // estado cuando la posición cambia de verdad, así el resto del tiempo no hay renders.
  const hayPaso = Boolean(paso);
  const anclaje = paso?.anclaje ?? null;
  useEffect(() => {
    if (!hayPaso) { setRect(null); return; }
    let vivo = true, primero = true, tick = 0;
    let ultimo: Caja | null = null, ultimoDialogo: boolean | null = null;
    const mide = () => {
      if (!vivo) return;
      if (tick++ % 10 === 0) {
        // Solo diálogos VISIBLES: algunos componentes montan el suyo cerrado. No hace falta cada frame.
        const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((x) => x.getClientRects().length > 0 && !x.hasAttribute("data-guia-propia"));
        if (d !== ultimoDialogo) { ultimoDialogo = d; setDialogo(d); }
      }
      const el = anclaje ? document.querySelector<HTMLElement>(`[data-guia="${anclaje}"]`) : null;
      const r = el ? el.getBoundingClientRect() : null;
      const caja: Caja | null = r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null;
      if (primero || !mismaCaja(caja, ultimo)) { primero = false; ultimo = caja; setRect(caja); }
      requestAnimationFrame(mide);
    };
    const raf = requestAnimationFrame(mide);
    return () => { vivo = false; cancelAnimationFrame(raf); };
  }, [hayPaso, anclaje, pathname]);

  useEffect(() => {
    // Al llegar a la página del elemento, llevarlo a la vista.
    if (!paso?.anclaje) return;
    const el = document.querySelector<HTMLElement>(`[data-guia="${paso.anclaje}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [paso?.key, paso?.anclaje]);

  if (!paso || dialogo) return null;

  const saltar = () => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } setCerrada(true); };
  const accion = () => {
    if (paso.ir) { router.push(paso.ir); return; }
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
        <div aria-hidden className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-aproba-500" style={{ left: rect.left - m, top: rect.top - m, width: rect.width + 2 * m, height: rect.height + 2 * m, boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.38)" }} />
        <div className="fixed z-40" style={{ left, top: abajo ? rect.bottom + 14 : undefined, bottom: abajo ? undefined : window.innerHeight - rect.top + 14 }}>{Tarjeta}</div>
      </>
    );
  }
  return <div className="fixed bottom-24 right-4 z-40 md:bottom-6 md:right-28">{Tarjeta}</div>;
}

// Para que las acciones avisen a la guía sin acoplarse a ella.
export function avisarGuia() { try { window.dispatchEvent(new Event(EVENTO)); } catch { /* */ } }
