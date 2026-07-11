"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";

// MODO INTERNO: el gestor sube él mismo un documento al expediente (el cliente ya se lo
// dio por email/WhatsApp), sin enviarle el enlace. Va por el MISMO pipeline IA que el portal
// (POST /api/expedientes/[id]/documentos): Vision valida y el expediente avanza igual.
export function SubirDocumentoGestor({ expedienteId, docsRequeridos }: { expedienteId: string; docsRequeridos: string[] }) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // Los docs del servicio primero; después el resto del catálogo (en etapas tardías se
  // suben cosas fuera de la checklist: una resolución, un doc suelto…).
  const otros = Object.values(DOC_LABEL).filter((l) => !docsRequeridos.includes(l));
  const opciones = [...docsRequeridos, ...otros];
  const [tipo, setTipo] = useState<string>(opciones[0] ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setSubiendo(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("label", tipo);
      fd.set("file", file);
      const res = await fetch(`/api/expedientes/${expedienteId}/documentos`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo subir el documento."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo subir el documento."));
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div id="subir-interno" className="mt-3 rounded-xl border border-dashed border-slate-300 bg-cream-50/40 p-4">
      <p className="text-xs font-medium text-slate-600">{t("¿Ya tienes la documentación? Súbela tú mismo, sin enviar el enlace al cliente.")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label={t("Tipo de documento")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100">
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
          {subiendo ? t("Subiendo…") : t("Subir documento")}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
      </div>
      {subiendo && <p className="mt-2 text-xs text-amber-600">⏳ {t("Subiendo y validando con IA…")}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
