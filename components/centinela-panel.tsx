"use client";

import { useState } from "react";
import type { Revision, Hallazgo } from "@/lib/centinela";
import { useT } from "@/components/lang-provider";

// EL FUNCIONARIO FANTASMA — panel de revisión pre-presentación en la ficha del
// expediente. Regla de oro: VERDE = «no se ha detectado nada», NUNCA «preséntalo
// con seguridad» (el disclaimer es permanente).

const VERDICTO_META = {
  ROJO: { label: "Riesgo alto de requerimiento", dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200" },
  AMBAR: { label: "Riesgos a revisar", dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  VERDE: { label: "Nada detectado", dot: "bg-aproba-600", pill: "bg-aproba-50 text-aproba-700 border-aproba-200" },
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function imprimirEscrito(texto: string) {
  const w = window.open("", "_blank", "width=780,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Escrito de subsanación</title></head>
<body style="margin:0"><pre style="font:13.5px/1.7 Georgia,'Times New Roman',serif;white-space:pre-wrap;margin:56px 64px">${esc(texto)}</pre></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export function CentinelaPanel({ expedienteId, inicial }: { expedienteId: string; inicial: Revision | null }) {
  const t = useT();
  const [revision, setRevision] = useState<Revision | null>(inicial);
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escrito, setEscrito] = useState<string | null>(null);
  const [redactando, setRedactando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [reqAbierto, setReqAbierto] = useState(false);
  const [reqTexto, setReqTexto] = useState("");

  async function revisar() {
    setRevisando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/centinela`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("La revisión ha fallado. Vuelve a intentarlo."));
      setRevision(d.revision as Revision);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("La revisión ha fallado. Vuelve a intentarlo."));
    } finally {
      setRevisando(false);
    }
  }

  async function redactar(payload: { hallazgos?: Hallazgo[]; requerimientoTexto?: string }) {
    setRedactando(true);
    setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/subsanacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("La redacción ha fallado. Vuelve a intentarlo."));
      setEscrito(d.escrito as string);
      setReqAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("La redacción ha fallado. Vuelve a intentarlo."));
    } finally {
      setRedactando(false);
    }
  }

  const meta = revision ? VERDICTO_META[revision.verdicto] : null;
  const rojos = revision?.hallazgos.filter((h) => h.severidad === "ROJO") ?? [];
  const ambares = revision?.hallazgos.filter((h) => h.severidad === "AMBAR") ?? [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{t("Revisión «como Extranjería»")}</span>
        <button
          onClick={revisar}
          disabled={revisando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></svg>
          {revisando ? t("Revisando como el funcionario…") : revision ? t("Volver a revisar") : t("Revisar como Extranjería")}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {!revision && !revisando && (
          <p className="text-sm text-slate-500">
            {t("Antes de presentar, deja que la IA relea el expediente completo como lo haría el funcionario instructor: coherencia entre documentos, vigencias, requisitos del trámite, tasa… Detecta ahora lo que te llegaría como requerimiento dentro de 3 semanas.")}
          </p>
        )}
        {revisando && (
          <div className="flex items-center gap-3 py-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            {t("Cruzando identidad, vigencias y requisitos del trámite…")}
          </div>
        )}

        {revision && meta && !revisando && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${meta.pill}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                {t(meta.label)}
              </span>
              {revision.hallazgos.length > 0 && (
                <span className="text-xs text-slate-400">
                  {rojos.length > 0 && `${rojos.length} ${t("rojo(s)")}`}{rojos.length > 0 && ambares.length > 0 && " · "}{ambares.length > 0 && `${ambares.length} ${t("ámbar")}`}
                </span>
              )}
            </div>

            {revision.hallazgos.length > 0 && (
              <ul className="mt-4 space-y-3">
                {[...rojos, ...ambares].map((h, i) => (
                  <li key={i} className={`rounded-xl border p-3.5 ${h.severidad === "ROJO" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`text-sm font-semibold ${h.severidad === "ROJO" ? "text-red-800" : "text-amber-800"}`}>
                      {h.severidad === "ROJO" ? "🔴" : "🟡"} {h.titulo}
                    </p>
                    <p className={`mt-1 text-sm leading-relaxed ${h.severidad === "ROJO" ? "text-red-700" : "text-amber-700"}`}>{h.motivo}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {h.requisito}{h.documentos.length > 0 && <> · {h.documentos.join(", ")}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {(revision.comprobado.length > 0 || revision.noComprobable.length > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {revision.comprobado.length > 0 && (
                  <div className="rounded-xl bg-cream-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Comprobado sin problemas")}</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                      {revision.comprobado.map((c, i) => <li key={i}>✓ {c}</li>)}
                    </ul>
                  </div>
                )}
                {revision.noComprobable.length > 0 && (
                  <div className="rounded-xl bg-cream-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("No se ha podido comprobar")}</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-500">
                      {revision.noComprobable.map((c, i) => <li key={i}>? {c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {revision.hallazgos.length > 0 && (
              <button
                onClick={() => redactar({ hallazgos: revision.hallazgos })}
                disabled={redactando}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                {redactando ? t("Redactando…") : t("Generar escrito de subsanación")}
              </button>
            )}
          </div>
        )}

        {/* Requerimiento real recibido → borrador de contestación */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!reqAbierto ? (
            <button onClick={() => setReqAbierto(true)} className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
              {t("¿Has recibido un requerimiento? Pégalo aquí y redacto la contestación")}
            </button>
          ) : (
            <div>
              <textarea
                value={reqTexto}
                onChange={(e) => setReqTexto(e.target.value)}
                rows={5}
                placeholder={t("Pega aquí el texto del requerimiento recibido…")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => redactar({ requerimientoTexto: reqTexto })}
                  disabled={redactando || reqTexto.trim().length < 20}
                  className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  {redactando ? t("Redactando…") : t("Redactar contestación")}
                </button>
                <button onClick={() => setReqAbierto(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-slate-300">
                  {t("Cancelar")}
                </button>
              </div>
            </div>
          )}
        </div>

        {revision?.persistida === false && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {t("Esta revisión no se ha guardado: falta ejecutar la migración supabase/centinela.sql. Seguirá funcionando, pero sin histórico.")}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          {t("La revisión es una ayuda, no una garantía: «nada detectado» significa que no se ha encontrado ningún problema en los datos disponibles, no que la resolución vaya a ser favorable. Revisa siempre el expediente antes de presentarlo.")}
        </p>
      </div>

      {/* Modal del escrito */}
      {escrito && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setEscrito(null)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <p className="text-sm font-semibold text-slate-800">{t("Borrador de escrito de subsanación")}</p>
              <button onClick={() => setEscrito(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t("Cerrar")}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-serif text-[13.5px] leading-relaxed text-slate-800">{escrito}</pre>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
              <p className="text-[11px] text-slate-400">{t("Es un borrador: revísalo y complétalo antes de firmar.")}</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await navigator.clipboard.writeText(escrito).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300"
                >
                  {copiado ? t("Copiado ✓") : t("Copiar")}
                </button>
                <button onClick={() => imprimirEscrito(escrito)} className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                  {t("Imprimir / PDF")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
