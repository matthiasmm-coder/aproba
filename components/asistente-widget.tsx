"use client";

import { useEffect, useRef, useState } from "react";

// Asistente de Aproba — primera capa de soporte DENTRO del producto: el gestor pregunta
// «¿cómo hago X?» o «me he atascado en Y» y recibe la respuesta al momento (POST /api/asistente).
// Si el asistente no llega, «Hablar con una persona» manda la conversación al equipo
// (POST /api/feedback, el mismo canal de siempre).

type Mensaje = { rol: "user" | "assistant"; texto: string };

const SUGERENCIAS = [
  "¿Cómo doy de alta un expediente?",
  "El cliente no encuentra su enlace, ¿qué hago?",
  "¿Cómo importo mis clientes desde Excel?",
];

export function AsistenteWidget() {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"chat" | "humano">("chat");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Escalado a humano
  const [humano, setHumano] = useState("");
  const [envio, setEnvio] = useState<"idle" | "enviando" | "ok">("idle");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ block: "end" }); }, [mensajes, cargando]);

  function cerrar() {
    setOpen(false);
    window.setTimeout(() => { setModo("chat"); setError(null); setEnvio("idle"); setHumano(""); }, 200);
  }

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    const historial: Mensaje[] = [...mensajes, { rol: "user", texto: pregunta }];
    setMensajes(historial);
    setEntrada("");
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial, pagina: window.location.pathname }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No he podido responder.");
      setMensajes([...historial, { rol: "assistant", texto: String(d.texto ?? "") }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No he podido responder.");
    } finally {
      setCargando(false);
    }
  }

  // Escala al equipo llevando la conversación como contexto (así no hay que repetirlo todo).
  async function enviarAHumano() {
    if (humano.trim().length < 3 || envio === "enviando") return;
    setEnvio("enviando");
    setError(null);
    const contexto = mensajes.slice(-6).map((m) => `${m.rol === "user" ? "Gestor" : "Asistente"}: ${m.texto}`).join("\n\n");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria: "otro",
          mensaje: contexto ? `${humano.trim()}\n\n--- Conversación con el asistente ---\n${contexto}` : humano.trim(),
          pagina: window.location.pathname,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo enviar.");
      }
      setEnvio("ok");
      window.setTimeout(cerrar, 2000);
    } catch (e) {
      setEnvio("idle");
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    }
  }

  return (
    <>
      {/* Botón flotante — encima de la nav móvil, esquina inferior derecha en escritorio */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir el asistente de Aproba"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 md:bottom-6 md:right-6 print:hidden"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span className="hidden sm:inline">Ayuda</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex max-h-[72vh] w-[calc(100vw-2rem)] max-w-sm flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-6 md:right-6 print:hidden">
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Asistente de Aproba</p>
              <p className="text-xs text-slate-400">{modo === "chat" ? "Pregúntame cómo hacer algo en el programa" : "Tu mensaje llega al equipo de Aproba"}</p>
            </div>
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="mt-0.5 shrink-0 text-slate-400 transition hover:text-slate-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {modo === "chat" ? (
            <>
              {/* Conversación */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {mensajes.length === 0 && (
                  <div>
                    <p className="text-sm text-slate-600">Te ayudo a desatascarte: dime qué quieres hacer.</p>
                    <div className="mt-3 space-y-1.5">
                      {SUGERENCIAS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => preguntar(s)}
                          className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mensajes.map((m, i) => (
                  <div key={i} className={m.rol === "user" ? "flex justify-end" : ""}>
                    <p className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      m.rol === "user" ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}>{m.texto}</p>
                  </div>
                ))}
                {cargando && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                    Pensando…
                  </p>
                )}
                {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                <div ref={finRef} />
              </div>

              {/* Entrada */}
              <div className="border-t border-slate-100 px-3 py-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); preguntar(entrada); } }}
                    rows={1}
                    maxLength={2000}
                    placeholder="Escribe tu pregunta…"
                    className="max-h-24 min-h-[40px] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
                  />
                  <button
                    type="button"
                    onClick={() => preguntar(entrada)}
                    disabled={cargando || !entrada.trim()}
                    aria-label="Enviar pregunta"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-aproba-600 text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /></svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setModo("humano"); setError(null); }}
                  className="mt-1.5 text-[11px] text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline"
                >
                  ¿No te resuelve? Hablar con una persona
                </button>
              </div>
            </>
          ) : envio === "ok" ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-aproba-100 text-aproba-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <p className="text-sm font-medium text-slate-700">¡Recibido! Te contestamos enseguida.</p>
            </div>
          ) : (
            <div className="px-4 py-3">
              <textarea
                value={humano}
                onChange={(e) => setHumano(e.target.value)}
                rows={4}
                maxLength={4000}
                autoFocus
                placeholder="Cuéntanos qué necesitas y te respondemos…"
                className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
              />
              {mensajes.length > 0 && <p className="mt-1 text-[11px] text-slate-400">Adjuntamos la conversación con el asistente para no hacerte repetir.</p>}
              {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setModo("chat"); setError(null); }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={enviarAHumano}
                  disabled={envio === "enviando" || humano.trim().length < 3}
                  className="flex-1 rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {envio === "enviando" ? "Enviando…" : "Enviar al equipo"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
