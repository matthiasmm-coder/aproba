"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Eliminación DEFINITIVA de un expediente (pruebas / creados por error). Confirmación
// explícita en modal con la referencia — no es un archivado: borra documentos y eventos.
// Las facturas emitidas se conservan (solo se desvinculan). Solo administradores (la ruta
// devuelve 403 al resto). Foco gestionado como en editar-cliente: trampa de Tab, Escape,
// restauración al cerrar.
export function EliminarExpedienteButton({ id, referencia }: { id: string; referencia: string }) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  function abrir() {
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    setError(null); setAbierto(true);
  }
  function cerrar() { if (!borrando) setAbierto(false); }

  // Foco dentro del diálogo al abrir (en «Cancelar», la opción segura), trampa de Tab,
  // Escape, y restauración del foco al cerrar.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    const focusables = () => panel ? [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')] : [];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prevFocus.current?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, borrando]);

  async function eliminar() {
    setBorrando(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar el expediente."));
      router.push("/app/expedientes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar el expediente."));
      setBorrando(false);
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        title={t("Eliminar definitivamente")}
        aria-label={t("Eliminar definitivamente")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></svg>
      </button>

      {abierto && (
        <div role="dialog" aria-modal="true" aria-label={t("Eliminar expediente")} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
          <div ref={panelRef} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("¿Eliminar este expediente?")}</h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-mono text-xs text-slate-500">{referencia}</span> — {t("se eliminarán definitivamente sus documentos y su historial. Esta acción no se puede deshacer.")}
            </p>
            <p className="mt-2 text-xs text-slate-400">{t("Las facturas emitidas se conservan (quedan desvinculadas del expediente).")}</p>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={cerrar} disabled={borrando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{t("Cancelar")}</button>
              <button onClick={eliminar} disabled={borrando} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-slate-300">
                {borrando ? t("Eliminando…") : t("Eliminar definitivamente")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
