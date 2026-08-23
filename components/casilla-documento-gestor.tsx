"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirConProgreso } from "@/lib/subir-con-progreso";
import { useT } from "@/components/lang-provider";

// Casilla VACÍA de un documento que el trámite exige. El gestor ve lo que falta sin
// abrir el portal del cliente, y sube el archivo directamente en su hueco (llega por
// email o en mano casi siempre — el motivo por el que Juan no subía nada). Mismo
// pipeline que el portal: el tipo ya lo fija la casilla, la IA solo valida y extrae.

const ACEPTA = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;

export function CasillaDocumentoGestor({
  expedienteId, label, quitable = false, docsExtra = [],
}: {
  expedienteId: string;
  label: string;
  quitable?: boolean;      // pedido a mano → se puede retirar de este expediente
  docsExtra?: string[];
}) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [prog, setProg] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState(false);

  // Retirar SOLO de este expediente (la lista del servicio no se toca).
  async function quitar() {
    setQuitando(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: docsExtra.filter((d) => d !== label) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
      setQuitando(false);
    }
  }

  async function subir(file: File) {
    if (file.size > MAX_BYTES) { setError(t("El archivo supera los 8 MB")); return; }
    setProg(0); setError(null);
    try {
      const { ok, data } = await subirConProgreso({
        url: `/api/expedientes/${expedienteId}/documentos`,
        form: { label },
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
    <div className="rounded-xl border border-dashed border-slate-200 bg-cream-50/30 p-5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-300">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          </span>
          <span className="min-w-0 text-sm font-medium leading-snug text-slate-500 line-clamp-2 sm:line-clamp-1">{t(label)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={subiendo}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-300 hover:bg-aproba-50 hover:text-aproba-700 disabled:opacity-60 sm:min-h-0"
          >
            {subiendo ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            )}
            {subiendo ? `${Math.round(prog ?? 0)}%` : t("Subir")}
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">{t("Falta")}</span>
          {quitable && (
            <button
              type="button"
              onClick={quitar}
              disabled={quitando}
              title={t("Dejar de pedir este documento")}
              aria-label={t("Dejar de pedir este documento")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:h-7 sm:w-7"
            >
              {quitando ? <span className="text-xs">…</span> : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              )}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept={ACEPTA} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
      </div>
      {subiendo && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200" style={{ width: `${prog}%` }} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}
