"use client";

import { useState } from "react";

// Bouton de feedback flottant (app gestor). Pour la beta : capter les retours au
// moment où le testeur bute, pas une semaine après. POST /api/feedback.
const CATS = [
  { id: "bug", label: "Un problema", emoji: "🐞" },
  { id: "idea", label: "Una idea", emoji: "💡" },
  { id: "otro", label: "Otro", emoji: "💬" },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [categoria, setCategoria] = useState("idea");
  const [mensaje, setMensaje] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setOpen(false);
    // petite latence pour ne pas voir le reset pendant l'animation de fermeture
    window.setTimeout(() => { setEstado("idle"); setMensaje(""); setError(null); }, 200);
  }

  async function enviar() {
    if (mensaje.trim().length < 3) return;
    setEstado("enviando");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: mensaje.trim(), categoria, pagina: window.location.pathname }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo enviar.");
      }
      setEstado("ok");
      window.setTimeout(cerrar, 1800);
    } catch (e) {
      setEstado("error");
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    }
  }

  return (
    <>
      {/* Bouton flottant — au-dessus de la nav mobile (bottom-20), coin bas-droit sur desktop */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Enviar feedback"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 md:bottom-6 md:right-6 print:hidden"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl md:bottom-6 md:right-6 print:hidden">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">¿Qué nos quieres contar?</p>
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-slate-400 transition hover:text-slate-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {estado === "ok" ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aproba-100 text-aproba-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <p className="text-sm font-medium text-slate-700">¡Gracias! Lo tendremos en cuenta.</p>
            </div>
          ) : (
            <>
              <div className="mt-3 flex gap-1.5">
                {CATS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoria(c.id)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      categoria === c.id ? "border-aproba-600 bg-aproba-50 text-aproba-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="mr-1">{c.emoji}</span>{c.label}
                  </button>
                ))}
              </div>

              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={4}
                maxLength={4000}
                autoFocus
                placeholder="Cuéntanos qué te ha gustado, qué falla o qué echas en falta…"
                className="mt-3 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
              />

              {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

              <button
                type="button"
                disabled={estado === "enviando" || mensaje.trim().length < 3}
                onClick={enviar}
                className="mt-2 w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {estado === "enviando" ? "Enviando…" : "Enviar"}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">Tu mensaje llega directo al equipo de Aproba.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
