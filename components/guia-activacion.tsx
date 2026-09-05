"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import dynamic from "next/dynamic";
import { pasoDeGuia, TOUR_INICIAL, TOTAL_PASOS, type PasoGuia, type TourEjemplo } from "@/lib/guia";
import type { PresupuestoPrefill } from "@/components/servicios-implantacion";

// La ventana Aproba Despegue solo se carga al terminar la guía (no engorda el layout).
const DespegueModal = dynamic(() => import("@/components/despegue-modal").then((m) => m.DespegueModal), { ssr: false });
import type { DatosActivacion } from "@/lib/activacion";

// GUÍA INTERACTIVA. Un paso a la vez, señalado sobre el elemento real de la pantalla
// (foco recortado + tarjeta pegada al elemento) o, si el elemento no está en esta
// página, una tarjeta flotante con el botón que lleva a él. El paso se deduce del estado
// del despacho (GET /api/activacion) y de lo ya mirado del ejemplo (localStorage), no de
// clics sueltos: si el usuario hace las cosas por su cuenta, la guía lo sigue. Se cierra
// con «Saltar» y no vuelve (localStorage).
const KEY = "aproba.guia.cerrada";
const EVENTO = "aproba:activacion"; // lo disparan las acciones que cambian el estado
const EVENTO_ESTADO = "aproba:guia"; // lo dispara la guía al pasar a activa/inactiva
// Lo mirado del ejemplo va ligado a SU id: si se borra y se vuelve a sembrar, la visita empieza de cero.
const claveTour = (ejemploId: string | null | undefined) => `aproba.guia.tour.${ejemploId ?? "sin-ejemplo"}`;
const claveFin = (ejemploId: string | null | undefined) => `aproba.guia.fin.${ejemploId ?? "sin-ejemplo"}`; // último paso, confirmado con el botón

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
  const [tour, setTour] = useState<TourEjemplo>(TOUR_INICIAL);
  const [rect, setRect] = useState<Caja | null>(null);
  const [ancla, setAncla] = useState<string | null>(null); // data-guia señalado ahora (para los textos por anclaje)
  const [dialogo, setDialogo] = useState(false);
  const [despegue, setDespegue] = useState<PresupuestoPrefill | null>(null); // ventana final (Aproba Despegue)

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

  // Lo ya mirado del ejemplo (pasos «Siguiente»), leído del navegador en cuanto se sabe qué ejemplo es.
  const ejemploId = datos?.ejemploId ?? null;
  useEffect(() => {
    if (!datos) return;
    try { const v = Number(localStorage.getItem(claveTour(ejemploId)) ?? "0"); setTour({ vistos: Number.isFinite(v) ? v : 0, enlaceVisto: localStorage.getItem(claveFin(ejemploId)) === "1" }); } catch { setTour(TOUR_INICIAL); }
  }, [datos, ejemploId]);
  const guardarTour = (vistos: number) => { setTour((t0) => ({ ...t0, vistos })); try { localStorage.setItem(claveTour(ejemploId), String(vistos)); } catch { /* */ } };
  // Fin de la guía: se recuerda y se abre la ventana Aproba Despegue con los datos de la sesión.
  const terminar = async () => {
    setTour((t0) => ({ ...t0, enlaceVisto: true })); try { localStorage.setItem(claveFin(ejemploId), "1"); } catch { /* */ }
    let prefill: PresupuestoPrefill = {};
    try { const r = await fetch("/api/despegue", { cache: "no-store" }); if (r.ok) prefill = await r.json(); } catch { /* sin datos: la ventana sale vacía */ }
    setDespegue(prefill);
  };

  // Memoizado: pasoDeGuia devuelve un objeto nuevo en cada render y, como dependencia de un
  // efecto, lo rearmaba en bucle (render → medir → setRect → render…). Ese bucle hacía
  // temblar el foco y, peor, dejaba sin terminar la navegación de router.push (una
  // transición de React que las actualizaciones continuas interrumpen sin parar).
  const paso: PasoGuia | null = useMemo(() => (datos && !cerrada ? pasoDeGuia(datos, pathname, tour) : null), [datos, cerrada, pathname, tour]);

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
  const anclajes = useMemo(() => (paso ? (paso.anclajes ?? (paso.anclaje ? [paso.anclaje] : [])) : []), [paso]);
  const claveAnclajes = anclajes.join("|");
  const abrir = paso?.abrir ?? null;
  const pasoKey = paso?.key ?? null;
  useEffect(() => {
    if (!hayPaso) { setRect(null); return; }
    let vivo = true, primero = true, tick = 0;
    let preparadoPara: string | null = null; // anclaje ya abierto/llevado a la vista (puede cambiar dentro del mismo paso)
    let anclaVista: string | null | undefined; // último anclaje publicado (undefined = aún ninguno)
    let ultimo: Caja | null = null, ultimoDialogo: boolean | null = null;
    const mide = () => {
      if (!vivo) return;
      if (tick++ % 10 === 0) {
        // Solo diálogos VISIBLES: algunos componentes montan el suyo cerrado. No hace falta cada frame.
        const d = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((x) => x.getClientRects().length > 0 && !x.hasAttribute("data-guia-propia"));
        if (d !== ultimoDialogo) { ultimoDialogo = d; setDialogo(d); }
      }
      let el: HTMLElement | null = null, nombre: string | null = null;
      for (const a of anclajes) { const e = document.querySelector<HTMLElement>(`[data-guia="${a}"]`); if (e) { el = e; nombre = a; break; } }
      if (el && nombre !== preparadoPara) {
        preparadoPara = nombre;
        // Abrir la sección plegable que toca (la ficha las trae plegadas) y, un poco después
        // (tras una navegación suave Next vuelve arriba y anulaba un scroll inmediato: el
        // elemento quedaba bajo el borde y la tarjeta caía sobre el botón «Ayuda»), llevar
        // el elemento a la vista si queda fuera. Cabecera a 96 px del borde superior.
        if (abrir) window.dispatchEvent(new CustomEvent("abrir-seccion", { detail: abrir }));
        window.setTimeout(() => {
          if (!vivo) return;
          const r = el.getBoundingClientRect();
          const alto = Math.min(r.height, window.innerHeight * 0.5);
          const fuera = r.top < 72 || r.top + alto > window.innerHeight - 190;
          if (fuera) window.scrollTo({ top: window.scrollY + r.top - 96, behavior: "smooth" });
        }, 350);
      }
      const r = el ? el.getBoundingClientRect() : null;
      const caja: Caja | null = r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null;
      if (primero || !mismaCaja(caja, ultimo)) { primero = false; ultimo = caja; setRect(caja); }
      if (nombre !== anclaVista) { anclaVista = nombre; setAncla(nombre); }
      requestAnimationFrame(mide);
    };
    const raf = requestAnimationFrame(mide);
    return () => { vivo = false; cancelAnimationFrame(raf); };
  }, [hayPaso, anclajes, claveAnclajes, abrir, pasoKey, pathname]);

  const ventana = despegue ? <DespegueModal prefill={despegue} coheteUrl="/despegue-cohete.png" onClose={() => setDespegue(null)} /> : null;
  if (!paso || dialogo) return ventana;

  const saltar = () => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } setCerrada(true); };
  const accion = () => {
    if (paso.avanza) guardarTour(paso.avanza); // paso de «mirar»: confirmado
    if (paso.termina) { void terminar(); return; }  // fin de la guía → Aproba Despegue
    if (paso.ir) { router.push(paso.ir); return; }
    // «Entendido» sobre un elemento: no hay destino; el usuario actúa sobre él.
    if (!paso.avanza && rect) { for (const a of anclajes) { const el = document.querySelector<HTMLElement>(`[data-guia="${a}"]`); if (el) { el.focus(); break; } } }
  };
  const textoPaso = (rect && ancla && paso.textos?.[ancla]) || { titulo: paso.titulo, texto: paso.texto };

  const Tarjeta = (
    <div className="w-[300px] rounded-2xl border border-aproba-200 bg-white p-4 shadow-xl">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: TOTAL_PASOS }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i + 1 === paso.n ? "w-5 bg-aproba-600" : i + 1 < paso.n ? "w-1.5 bg-aproba-400" : "w-1.5 bg-slate-200"}`} />
        ))}
        <span className="ml-auto text-[11px] font-medium text-slate-400">{paso.n}/{TOTAL_PASOS}</span>
      </div>
      <p className="mt-2.5 text-base font-bold tracking-tight text-slate-900">{t(textoPaso.titulo)}</p>
      <p className="mt-1 text-sm leading-snug text-slate-600">{t(textoPaso.texto)}</p>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <button type="button" onClick={saltar} className="text-xs font-medium text-slate-400 hover:text-slate-600">{t("Saltar la guía")}</button>
        {paso.cta && (paso.ir || paso.avanza || paso.termina || !rect) ? (
          <button type="button" onClick={accion} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">{t(paso.cta)}</button>
        ) : null}
      </div>
    </div>
  );

  // z-[45]: por encima del lanzador «Ayuda» (z-40), por debajo de banners y diálogos (z-50).
  // Con elemento en pantalla: una FLECHA que rebota sobre él (la pantalla entera sigue
  // visible, sin oscurecer nada) y la tarjeta al lado si cabe, si no debajo o encima.
  // Sin elemento: tarjeta flotante abajo a la derecha.
  if (rect) {
    const ALTO = 170, ANCHO = 300;
    const altoFoco = Math.min(rect.height, window.innerHeight * 0.5);
    const encima = rect.top > 64; // flecha encima apuntando abajo; si no hay sitio, debajo apuntando arriba
    const flechaX = rect.left + Math.min(rect.width / 2, 140) - 14;
    const flechaY = encima ? rect.top - 46 : rect.top + altoFoco + 6;
    const Flecha = (
      <div aria-hidden className="pointer-events-none fixed z-[45] animate-bounce text-aproba-600" style={{ left: flechaX, top: flechaY }}>
        <svg width="28" height="38" viewBox="0 0 28 38" className={encima ? "" : "rotate-180"} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3v26M4 19l10 12 10-12" stroke="#fff" strokeWidth="8" />
          <path d="M14 3v26M4 19l10 12 10-12" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      </div>
    );
    const aLaDerecha = altoFoco < 220 && rect.right + 16 + ANCHO + 12 <= window.innerWidth;
    if (aLaDerecha) {
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - ALTO - 12));
      return (<>{ventana}{Flecha}<div className="fixed z-[45]" style={{ left: rect.right + 16, top }}>{Tarjeta}</div></>);
    }
    const abajo = rect.top + altoFoco + 12 + ALTO < window.innerHeight;
    // Si la tarjeta cae en la esquina inferior derecha (donde vive «Ayuda»), se corre a la izquierda.
    const bordeInferior = abajo ? rect.top + altoFoco + 14 + ALTO : rect.top - 14;
    const esquinaAyuda = bordeInferior > window.innerHeight - 100;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 312 - (esquinaAyuda ? 140 : 0)));
    // Encima del elemento, la tarjeta deja hueco para la flecha (que rebota entre ambos).
    return (<>{ventana}{Flecha}<div className="fixed z-[45]" style={{ left, top: abajo ? rect.top + altoFoco + 14 : undefined, bottom: abajo ? undefined : window.innerHeight - rect.top + 58 }}>{Tarjeta}</div></>);
  }
  return (<>{ventana}<div className="fixed bottom-24 right-4 z-[45] md:bottom-6 md:right-28">{Tarjeta}</div></>);
}

// Para que las acciones avisen a la guía sin acoplarse a ella.
export function avisarGuia() { try { window.dispatchEvent(new Event(EVENTO)); } catch { /* */ } }
