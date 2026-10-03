"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// VISOR DEL DOCUMENTO (lib/firma): el PDF exacto que se firma, página a página, a lo ancho de la
// pantalla y nítido (densidad de píxeles real), dibujado con pdf.js en el propio navegador — un
// PDF incrustado se ve mal en iPhone. Las páginas se pintan al acercarse (rápido en documentos
// largos), con zoom y contador de página.

type Pdf = { numPages: number; getPage: (n: number) => Promise<PaginaPdf> };
// pdf.js 6: se destruye la TAREA de carga (el documento ya no tiene destroy()).
type Carga = { promise: Promise<unknown>; destroy: () => Promise<void> };
type PaginaPdf = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
};

// El «worker» de pdf.js corre en la propia página (lo detecta por globalThis.pdfjsWorker): sin
// fichero aparte que servir — el empaquetador del servidor no sabe resolverlo — y de sobra para
// documentos de pocas páginas.
async function cargarPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) await import("pdfjs-dist/build/pdf.worker.min.mjs");
  return pdfjs;
}

function Pagina({ pdf, n, ancho, onVisible }: { pdf: Pdf; n: number; ancho: number; onVisible: (n: number, proporcion: number) => void }) {
  const cont = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [proporcion, setProporcion] = useState(842 / 595);
  const [cerca, setCerca] = useState(n <= 2);

  useEffect(() => {
    const el = cont.current; if (!el) return;
    // Dos observadores: el margen de 600 px adelanta el PINTADO de las páginas cercanas, pero
    // no cuenta para el contador, que sigue a la página MÁS visible (antes, al abrir un
    // documento de 2 páginas decía «Página 2 de 2» con la página 1 en pantalla).
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setCerca(true); }, { rootMargin: "600px 0px" });
    const vista = new IntersectionObserver((es) => {
      for (const e of es) onVisible(n, e.intersectionRatio);
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    io.observe(el);
    vista.observe(el);
    return () => { io.disconnect(); vista.disconnect(); };
  }, [n, onVisible]);

  useEffect(() => {
    if (!cerca || !ancho) return;
    let tarea: { cancel: () => void } | null = null;
    let vivo = true;
    (async () => {
      const page = await pdf.getPage(n);
      if (!vivo) return;
      const base = page.getViewport({ scale: 1 });
      setProporcion(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const vp = page.getViewport({ scale: (ancho / base.width) * dpr });
      const c = lienzo.current; if (!c) return;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d"); if (!ctx) return;
      const r = page.render({ canvasContext: ctx, viewport: vp });
      tarea = r;
      await r.promise.catch(() => {});
    })();
    return () => { vivo = false; tarea?.cancel(); };
  }, [pdf, n, ancho, cerca]);

  return (
    <div ref={cont} className="mx-auto overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12),0_8px_24px_-12px_rgba(15,23,42,0.25)]" style={{ width: ancho, height: ancho * proporcion }}>
      <canvas ref={lienzo} style={{ width: ancho, height: ancho * proporcion, display: "block" }} aria-label={`p. ${n}`} />
    </div>
  );
}

export function VisorPdf({ url, titulo, t, descargarUrl, onCerrar, onListo, textoListo }: {
  url: string; titulo: string; t: (k: string, v?: Record<string, string | number>) => string;
  descargarUrl: string; onCerrar: () => void; onListo: () => void; textoListo: string;
}) {
  const zona = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [error, setError] = useState(false);
  const [anchoZona, setAnchoZona] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [actual, setActual] = useState(1);
  // Página del contador: la más visible en pantalla (empate → la de arriba).
  const visibles = useRef(new Map<number, number>());
  const alVer = useCallback((n: number, proporcion: number) => {
    visibles.current.set(n, proporcion);
    let mejor = 1, max = -1;
    for (const [k, v] of [...visibles.current].sort((a, b) => a[0] - b[0])) if (v > max + 0.001) { max = v; mejor = k; }
    setActual(mejor);
  }, []);

  useEffect(() => {
    let vivo = true;
    let carga: Carga | null = null;
    (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        if (!vivo) return;
        carga = pdfjs.getDocument({ url }) as unknown as Carga;
        const doc = await carga.promise as Pdf;
        if (vivo) setPdf(doc);
      } catch { if (vivo) setError(true); }
    })();
    return () => { vivo = false; void carga?.destroy().catch(() => {}); };
  }, [url]);

  useEffect(() => {
    const el = zona.current; if (!el) return;
    const medir = () => setAnchoZona(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape cierra; el fondo de la página no se desplaza bajo el visor.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onCerrar]);

  const anchoPagina = Math.max(240, Math.min(anchoZona - 24, 860) * zoom);
  const total = pdf?.numPages ?? 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCerrar} aria-label={t("firmaE.visor.cerrar")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{titulo}</p>
          {total > 0 && <p className="text-xs text-slate-500">{t("firmaE.visor.pagina", { n: actual, total })}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1} aria-label={t("firmaE.visor.reducir")} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:opacity-30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" /></svg>
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} disabled={zoom >= 3} aria-label={t("firmaE.visor.ampliar")} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:opacity-30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6M11 8v6" /></svg>
          </button>
          <a href={descargarUrl} aria-label={t("firmaE.descargar")} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          </a>
        </div>
      </header>

      <div ref={zona} className="flex-1 overflow-auto overscroll-contain py-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {error ? (
          <div className="mx-auto mt-16 max-w-sm px-6 text-center">
            <p className="text-sm text-slate-600">{t("firmaE.visor.error")}</p>
            <a href={descargarUrl} className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">{t("firmaE.descargar")}</a>
          </div>
        ) : !pdf || !anchoZona ? (
          <div className="mt-24 flex flex-col items-center gap-3 text-sm text-slate-500">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-300 border-t-aproba-600" />
            {t("firmaE.visor.cargando")}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-3" style={{ width: zoom > 1 ? anchoPagina + 24 : undefined }}>
            {Array.from({ length: total }, (_, i) => <Pagina key={i} pdf={pdf} n={i + 1} ancho={anchoPagina} onVisible={alVer} />)}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onListo} disabled={!pdf && !error} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-aproba-600 px-4 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-aproba-700 disabled:opacity-40">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
          {textoListo}
        </button>
      </footer>
    </div>
  );
}
