"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { subirConProgreso } from "@/lib/subir-con-progreso";
import { useT } from "@/components/lang-provider";

// MODO INTERNO — SUBIDA EN LOTE con clasificación automática (23/08, pedido de Matthias
// tras el email de Juan: «si me llega por email o en mano, no la subo a Aproba»). El
// gestor arrastra N archivos de golpe; cada uno pasa por el MISMO pipeline IA del portal
// (una sola pasada de Vision detecta el tipo Y valida) y cae solo en su casilla. Barra
// de progreso real por archivo (XHR) + fase de análisis. Treinta gestos → uno.
// El selector manual de siempre queda como repli plegado (documentos firmados, casos
// que la IA no reconoce, o cuando el gestor quiere decidir él).

type Fase = "esperando" | "subiendo" | "hecho" | "error";
type Item = {
  file: File;
  fase: Fase;
  prog: number;        // 0..100 (real: XHR + asintótico durante el análisis)
  label?: string;      // casilla asignada por la IA
  estadoDoc?: string;  // VALIDADO | RECHAZADO | PENDIENTE
  alerta?: string;
};

const ACEPTA = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;

export function SubirDocumentoGestor({ expedienteId, docsRequeridos }: { expedienteId: string; docsRequeridos: string[] }) {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [enCurso, setEnCurso] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const multiRef = useRef<HTMLInputElement>(null);
  const patch = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function procesarCola(files: File[]) {
    if (!files.length || enCurso) return;
    const base = files.map((file): Item =>
      file.size > MAX_BYTES
        ? { file, fase: "error", prog: 0, alerta: t("El archivo supera los 8 MB") }
        : { file, fase: "esperando", prog: 0 });
    setItems(base);
    setEnCurso(true);
    // SECUENCIAL a propósito: Vision tarda unos segundos por documento y la narración
    // (este archivo sube → se analiza → cae en tal casilla) se sigue mejor de uno en uno.
    for (let i = 0; i < base.length; i++) {
      if (base[i].fase === "error") continue;
      patch(i, { fase: "subiendo", prog: 0 });
      try {
        const { ok, data } = await subirConProgreso({
          url: `/api/expedientes/${expedienteId}/documentos`,
          form: { auto: "1" },
          file: base[i].file,
          onProgreso: (v) => patch(i, { prog: v }),
          errorRed: t("Fallo de red — vuelve a intentarlo."),
        });
        if (!ok || !data) throw new Error(data?.error ?? t("No se pudo subir el documento."));
        const d = data as { estado?: string; label?: string; alertas?: string[] };
        patch(i, { fase: "hecho", prog: 100, label: d.label, estadoDoc: d.estado, alerta: d.alertas?.[0] });
      } catch (e) {
        patch(i, { fase: "error", prog: 0, alerta: e instanceof Error ? e.message : t("No se pudo subir el documento.") });
      }
    }
    setEnCurso(false);
    router.refresh(); // una sola vez, al final: la lista de la ficha se repinta con todo
  }

  const hechos = items.filter((x) => x.fase === "hecho").length;
  const fallos = items.filter((x) => x.fase === "error").length;
  const totalValidos = items.length;

  return (
    <div id="subir-interno" className="mt-3">
      {/* Zona de arrastre — la entrada PRINCIPAL */}
      <button
        type="button"
        onClick={() => multiRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); procesarCola([...e.dataTransfer.files].filter((f) => ACEPTA.includes(f.type))); }}
        disabled={enCurso}
        className={`w-full rounded-xl border-2 border-dashed p-5 text-center transition ${arrastrando ? "border-aproba-500 bg-aproba-50/60" : "border-slate-300 bg-cream-50/40 hover:border-aproba-400 hover:bg-aproba-50/30"} disabled:cursor-default disabled:opacity-70`}
      >
        <svg className="mx-auto h-6 w-6 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
        <p className="mt-1.5 text-sm font-semibold text-slate-700">{t("Arrastra aquí todos los documentos (o haz clic)")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("La IA reconoce cada uno y lo coloca en su casilla. JPG, PNG, WebP o PDF · máx. 8 MB.")}</p>
      </button>
      <input ref={multiRef} type="file" multiple accept={ACEPTA} className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; procesarCola(fs); }} />

      {/* Cola de subida: una fila por archivo, con SU barra */}
      {items.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {items.map((x, i) => (
            <div key={`${x.file.name}-${i}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{x.file.name}</span>
                {x.fase === "esperando" && <span className="shrink-0 text-slate-400">{t("En cola…")}</span>}
                {x.fase === "subiendo" && <span className="shrink-0 tabular-nums text-aproba-700">{x.prog < 46 ? t("Subiendo…") : t("Analizando…")} {Math.round(x.prog)}%</span>}
                {x.fase === "hecho" && (
                  <span className={`shrink-0 font-semibold ${x.estadoDoc === "VALIDADO" ? "text-aproba-700" : "text-amber-600"}`}>
                    {x.estadoDoc === "VALIDADO" ? "✓ " : "⚠ "}{x.label ? t(x.label) : ""}
                  </span>
                )}
                {x.fase === "error" && <span className="shrink-0 font-semibold text-red-600">✕</span>}
              </div>
              {(x.fase === "subiendo" || x.fase === "esperando") && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200" style={{ width: `${x.prog}%` }} />
                </div>
              )}
              {x.fase === "hecho" && x.estadoDoc !== "VALIDADO" && x.alerta && (
                <p className="mt-1 text-[11px] leading-snug text-amber-700">{x.alerta}</p>
              )}
              {x.fase === "error" && x.alerta && <p role="alert" className="mt-1 text-[11px] leading-snug text-red-600">{x.alerta}</p>}
            </div>
          ))}
          {!enCurso && (
            <p className="text-center text-[11px] text-slate-500">
              {hechos}/{totalValidos} {t("procesados")}{fallos > 0 ? ` · ${fallos} ${t("con error")}` : ""}
            </p>
          )}
        </div>
      )}

      {/* Repli manual: documentos firmados o tipo elegido a mano */}
      <details className="mt-2">
        <summary className="cursor-pointer text-center text-[11px] text-slate-400 transition hover:text-slate-600">
          {t("¿Prefieres elegir el tipo tú mismo? (documentos firmados, casos especiales)")}
        </summary>
        <SubidaManual expedienteId={expedienteId} docsRequeridos={docsRequeridos} />
      </details>
    </div>
  );
}

// El flujo de siempre, intacto: selector de tipo + un archivo. Necesario para la hoja de
// encargo/mandato firmados (sin IA) y para forzar una casilla concreta.
function SubidaManual({ expedienteId, docsRequeridos }: { expedienteId: string; docsRequeridos: string[] }) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const otros = Object.values(DOC_LABEL).filter((l) => !docsRequeridos.includes(l));
  const opciones = [...docsRequeridos, ...otros];
  const [tipo, setTipo] = useState<string>(opciones[0] ?? "");
  const [prog, setProg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setProg(0); setError(null);
    try {
      const { ok, data } = await subirConProgreso({
        url: `/api/expedientes/${expedienteId}/documentos`,
        form: { label: tipo },
        file,
        onProgreso: setProg,
        errorRed: t("Fallo de red — vuelve a intentarlo."),
      });
      if (!ok || !data) throw new Error(data?.error ?? t("No se pudo subir el documento."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo subir el documento."));
    } finally {
      setProg(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const subiendo = prog !== null;
  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label={t("Tipo de documento")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] sm:text-sm text-slate-700 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100">
          {docsRequeridos.length > 0 ? (
            <>
              <optgroup label={t("Del trámite")}>
                {docsRequeridos.map((op) => <option key={op} value={op}>{t(op)}</option>)}
              </optgroup>
              <optgroup label={t("Otros")}>
                {otros.map((op) => <option key={op} value={op}>{t(op)}</option>)}
              </optgroup>
            </>
          ) : opciones.map((op) => <option key={op} value={op}>{t(op)}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={subiendo || !tipo} className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {subiendo ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          )}
          {subiendo ? `${Math.round(prog ?? 0)}%` : t("Subir documento")}
        </button>
        <input ref={fileRef} type="file" accept={ACEPTA} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
      </div>
      {subiendo && (
        <div className="mx-auto mt-2 h-1 max-w-xs overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200" style={{ width: `${prog}%` }} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
