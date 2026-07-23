"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// CTA «Solicita una demo» + modal con el formulario.
// Los botones pueden vivir en cualquier punto de la landing (server component):
// disparan un CustomEvent y un único <DemoModalHost/> montado al final de la
// página abre el modal. Sin contexto que cruce la frontera server/client.

const EVENTO = "aproba:demo";

// El CTA «Solicita una demo» lleva directamente al Calendly del fundador: el
// visitante elige su hueco sin esperar a que le contestemos. Calendly captura
// su email al reservar, así que no perdemos el lead. (El formulario/modal de
// abajo queda como alternativa reutilizable; hoy no está montado en la landing.)
const CALENDLY_URL = "https://calendly.com/matthias-merlemounier/20min";

const VARIANTES = {
  primary: "bg-aproba-600 text-white shadow-sm hover:bg-aproba-700",
  invert: "bg-white text-aproba-700 shadow-sm hover:bg-aproba-50",
  outline: "border border-slate-300 text-slate-700 hover:border-aproba-400 hover:text-aproba-700",
} as const;

export function DemoButton({ variant = "primary", className = "", children }: { variant?: keyof typeof VARIANTES; className?: string; children?: React.ReactNode }) {
  return (
    <a
      href={CALENDLY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-block whitespace-nowrap rounded-lg text-center text-sm font-semibold transition ${VARIANTES[variant]} ${className}`}
    >
      {children ?? "Solicita una demo"}
    </a>
  );
}

const VOLUMENES = ["1–10", "10–30", "30–100", "Más de 100"];

export function DemoModalHost() {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Marca de apertura: el servidor señala (no descarta) los envíos «instantáneos».
  const t0 = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // Devolver el foco al botón que abrió el modal (WCAG 2.4.3).
  const origenFoco = useRef<HTMLElement | null>(null);
  // Un fetch lanzado antes de cerrar/reabrir no debe pisar el estado del formulario nuevo.
  const generacion = useRef(0);

  useEffect(() => {
    const abrir = () => {
      origenFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      t0.current = Date.now();
      generacion.current += 1;
      setEstado("idle");
      setAbierto(true);
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, []);

  const cerrar = useCallback(() => {
    generacion.current += 1;
    setAbierto(false);
    origenFoco.current?.focus();
  }, []);

  // Esc para cerrar, trampa de foco (aria-modal sin trampa deja al usuario de
  // teclado tabulando a ciegas por detrás del overlay) + bloqueo del scroll.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cerrar(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const dentro = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !dentro)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dentro)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.querySelector("input")?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(timer);
    };
  }, [abierto, cerrar]);

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (estado === "enviando") return;
    const fd = new FormData(ev.currentTarget);
    const gen = generacion.current;
    setEstado("enviando");
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: fd.get("nombre"),
          despacho: fd.get("despacho"),
          email: fd.get("email"),
          telefono: fd.get("telefono"),
          volumen: fd.get("volumen"),
          mensaje: fd.get("mensaje"),
          web: fd.get("web"), // honeypot
          t: Date.now() - t0.current,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (gen !== generacion.current) return; // el modal se cerró/reabrió mientras tanto
      if (!res.ok) {
        setErrorMsg(d.error ?? "No se pudo enviar la solicitud.");
        setEstado("error");
        return;
      }
      setEstado("ok");
    } catch {
      if (gen !== generacion.current) return;
      setErrorMsg("No hay conexión. Inténtalo de nuevo.");
      setEstado("error");
    }
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="demo-titulo">
      <div className="absolute inset-0 touch-none overscroll-contain bg-slate-900/50 backdrop-blur-sm" onClick={cerrar} />
      <div ref={panelRef} className="relative max-h-[92dvh] w-full max-w-lg animate-slideup overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-6 shadow-float sm:rounded-2xl sm:p-8">
        <button onClick={cerrar} aria-label="Cerrar" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        {estado === "ok" ? (
          <div className="py-8 text-center" role="status">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-aproba-100">
              <svg className="h-7 w-7 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            <h3 id="demo-titulo" className="mt-5 text-xl font-bold tracking-tightest text-slate-900">¡Solicitud recibida!</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              Te escribiremos en menos de 24 h laborables para fijar la demo. Mientras tanto, puedes ver el vídeo de 90 segundos en esta misma página.
            </p>
            <button onClick={cerrar} className="mt-6 rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">Entendido</button>
          </div>
        ) : (
          <>
            <h3 id="demo-titulo" className="text-xl font-bold tracking-tightest text-slate-900">Solicita una demo</h3>
            <p className="mt-1.5 text-sm text-slate-600">20–30 minutos online, con tus casos reales. Sin compromiso.</p>

            <form onSubmit={enviar} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="demo-nombre" className="mb-1 block text-xs font-semibold text-slate-600">Tu nombre *</label>
                  <input id="demo-nombre" name="nombre" required maxLength={120} autoComplete="name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" placeholder="Juan Santiago" />
                </div>
                <div>
                  <label htmlFor="demo-despacho" className="mb-1 block text-xs font-semibold text-slate-600">Despacho o gestoría *</label>
                  <input id="demo-despacho" name="despacho" required maxLength={160} autoComplete="organization" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" placeholder="Santiago Abogados" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="demo-email" className="mb-1 block text-xs font-semibold text-slate-600">Email *</label>
                  <input id="demo-email" name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" placeholder="juan@despacho.es" />
                </div>
                <div>
                  <label htmlFor="demo-telefono" className="mb-1 block text-xs font-semibold text-slate-600">Teléfono <span className="font-normal text-slate-400">(opcional)</span></label>
                  <input id="demo-telefono" name="telefono" maxLength={40} autoComplete="tel" inputMode="tel" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" placeholder="600 000 000" />
                </div>
              </div>
              <div>
                <label htmlFor="demo-volumen" className="mb-1 block text-xs font-semibold text-slate-600">Expedientes de extranjería al mes</label>
                <select id="demo-volumen" name="volumen" defaultValue="" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm">
                  <option value="">Selecciona…</option>
                  {VOLUMENES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="demo-mensaje" className="mb-1 block text-xs font-semibold text-slate-600">¿Algo que debamos saber? <span className="font-normal text-slate-400">(opcional)</span></label>
                <textarea id="demo-mensaje" name="mensaje" rows={3} maxLength={2000} className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" placeholder="Trámites que más gestionas, dudas concretas…" />
              </div>
              {/* Honeypot: invisible para humanos, los bots lo rellenan */}
              <input name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              {estado === "error" && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMsg} También puedes escribirnos a{" "}
                  <a href="mailto:aproba.software@gmail.com" className="font-semibold underline">aproba.software@gmail.com</a>.
                </p>
              )}

              <button type="submit" disabled={estado === "enviando"} className="w-full rounded-lg bg-aproba-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700 disabled:opacity-60">
                {estado === "enviando" ? "Enviando…" : "Solicitar la demo"}
              </button>
              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                Solo usaremos tus datos para contactarte sobre la demo.{" "}
                <a href="/legal/privacidad" className="underline hover:text-slate-600">Política de privacidad</a>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
