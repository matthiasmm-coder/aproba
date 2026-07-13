"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

// Diálogo de confirmación del design system — reemplaza window.confirm en toda la app.
// API imperativa 1:1: `if (!(await confirmar("¿Seguro?"))) return;`
//  • <dialog> nativo: Escape, foco contenido y backdrop gratis (WAI-ARIA sin plomería).
//  • Botones ≥44 px (regla táctil), variante `peligro` (rojo) para acciones destructivas.
//  • Si el host no está montado (páginas fuera de /app), repli transparente a
//    window.confirm — ningún flujo puede romperse por el refactor.

type Opciones = {
  mensaje: string;
  titulo?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  peligro?: boolean;
};

let abrirGlobal: ((o: Opciones) => Promise<boolean>) | null = null;

export function confirmar(o: Opciones | string): Promise<boolean> {
  const opts = typeof o === "string" ? { mensaje: o } : o;
  if (abrirGlobal) return abrirGlobal(opts);
  return Promise.resolve(typeof window !== "undefined" ? window.confirm(opts.mensaje) : false);
}

export function ConfirmHost() {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const [opts, setOpts] = useState<Opciones | null>(null);

  useEffect(() => {
    abrirGlobal = (o) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current?.(false); // un diálogo nuevo pisa al anterior
        resolverRef.current = resolve;
        setOpts(o);
      });
    return () => { abrirGlobal = null; };
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (opts && d && !d.open) d.showModal();
  }, [opts]);

  const cerrar = (v: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(v);
    dialogRef.current?.close();
    setOpts(null);
  };

  if (!opts) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-titulo"
      onCancel={(e) => { e.preventDefault(); cerrar(false); }}
      onClose={() => { if (resolverRef.current) cerrar(false); }}
      onClick={(e) => { if (e.target === dialogRef.current) cerrar(false); }}
      className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <h2 id="confirm-titulo" className="text-base font-bold text-slate-900">
          {opts.titulo ?? t("Confirmar")}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{opts.mensaje}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => cerrar(false)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-400"
          >
            {opts.cancelarLabel ?? t("Cancelar")}
          </button>
          <button
            autoFocus
            onClick={() => cerrar(true)}
            className={`min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white transition ${
              opts.peligro ? "bg-red-600 hover:bg-red-700" : "bg-aproba-600 hover:bg-aproba-700"
            }`}
          >
            {opts.confirmarLabel ?? t("Confirmar")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
