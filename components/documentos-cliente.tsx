"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_LABEL } from "@/lib/tramites";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

export type DocSuelto = { id: string; tipo: string; nombreArchivo: string | null; createdAt: string };

// Tipos proposés dans le desplegable = les libellés humains du domaine (Pasaporte, TIE…).
const TIPOS = Object.values(DOC_LABEL);

// Documentos SUELTOS del cliente (sin expediente): el gestor elige el tipo en un desplegable
// y sube el archivo (pasaporte, TIE…). Lista + descarga + eliminación.
export function DocumentosCliente({ clienteId, docs }: { clienteId: string; docs: DocSuelto[] }) {
  const t = useT();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("tipo", tipo);
      fd.set("file", file);
      const res = await fetch(`/api/clientes/${clienteId}/documentos`, { method: "POST", body: fd });
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

  async function borrar(docId: string) {
    if (!(await confirmar({ mensaje: t("¿Eliminar este documento?"), peligro: true, confirmarLabel: t("Eliminar") }))) return;
    setBorrando(docId);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteId}/documentos/${docId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo eliminar.")); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar."));
    } finally {
      setBorrando(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Documentos")} ({docs.length})</h2>
      <p className="mt-1 text-sm text-slate-500">{t("Sube documentos del cliente (pasaporte, TIE…) sin necesidad de crear un expediente.")}</p>

      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-50 text-slate-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t(d.tipo)}</p>
                  {d.nombreArchivo && <p className="truncate text-xs text-slate-400">{d.nombreArchivo}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a href={`/api/clientes/${clienteId}/documentos/${d.id}`} download className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-300 hover:text-aproba-700">{t("Descargar")}</a>
                <button onClick={() => borrar(d.id)} disabled={borrando === d.id} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50" aria-label={t("Eliminar")}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600">
          {TIPOS.map((tp) => <option key={tp} value={tp}>{t(tp)}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={subiendo} className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          {subiendo ? t("Subiendo…") : t("Subir documento")}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
