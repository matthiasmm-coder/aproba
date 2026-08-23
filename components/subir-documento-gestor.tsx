"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirConProgreso } from "@/lib/subir-con-progreso";
import { useT } from "@/components/lang-provider";

// MODO INTERNO — SUBIDA EN LOTE con clasificación automática (23/08, pedido de Matthias
// tras el email de Juan: «si me llega por email o en mano, no la subo a Aproba»). El
// gestor arrastra N archivos de golpe; cada uno pasa por el MISMO pipeline IA del portal
// (una sola pasada de Vision detecta el tipo Y valida) y cae solo en su casilla. Barra
// de progreso real por archivo (XHR) + fase de análisis. Treinta gestos → uno.
// El viejo selector «elige tú el tipo» se retiró el 23/08: cada documento esperado
// (incluidos la hoja de encargo y el mandato firmados) tiene YA su casilla con su
// botón Subir, y lo que no está en la lista se añade con «Pedir otro documento».

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

export function SubirDocumentoGestor({ expedienteId }: { expedienteId: string }) {
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
                    {x.estadoDoc === "VALIDADO" ? "✓" : "⚠"}
                  </span>
                )}
                {x.fase === "error" && <span className="shrink-0 font-semibold text-red-600">✕</span>}
              </div>
              {(x.fase === "subiendo" || x.fase === "esperando") && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200" style={{ width: `${x.prog}%` }} />
                </div>
              )}
              {x.fase === "hecho" && (x.label || x.alerta) && (
                <p className={`mt-1 text-[11px] leading-snug ${x.estadoDoc === "VALIDADO" ? "text-aproba-700" : "text-amber-700"}`}>
                  {[x.label ? t(x.label) : null, x.estadoDoc !== "VALIDADO" ? x.alerta : null].filter(Boolean).join(" — ")}
                </p>
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
    </div>
  );
}
