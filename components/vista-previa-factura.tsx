"use client";

import { useEffect } from "react";
import { FacturaDocumento } from "@/components/factura-documento";
import { useT } from "@/components/lang-provider";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";
import type { Emisor } from "@/components/factura-view";
import type { Factura } from "@/lib/facturas";

// VISTA PREVIA de una factura antes de emitirla (01/10/2026, Luis: «editar a la hora de hacer
// la factura»). El papel es el MISMO que verá después (FacturaDocumento) y los datos los
// prepara el servidor con el mismo código que la emisión (/api/facturas/vista-previa): aquí
// no se emite nada. «Seguir editando» vuelve al formulario; «Crear factura» la emite.
export function VistaPreviaFactura({ f, emisor, etiquetaCrear, onCrear, onCerrar }: {
  f: Factura; emisor: Emisor; etiquetaCrear: string; onCrear: () => void; onCerrar: () => void;
}) {
  const t = useT();
  useScrollBloqueado();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCerrar]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="vista-previa-titulo" className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={onCerrar}>
      <div className="mx-auto w-full max-w-3xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 bg-white px-4 py-3 sm:rounded-t-2xl sm:px-5">
          <div className="min-w-0">
            <h2 id="vista-previa-titulo" className="text-base font-bold text-slate-900">{t("Vista previa")}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t("Así saldrá la factura. Todavía no se ha emitido: no se emite nada hasta que pulses «Crear factura».")}</p>
          </div>
          <button onClick={onCerrar} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="bg-slate-100 p-2 sm:p-4">
          <FacturaDocumento f={f} emisor={emisor} />
        </div>
        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:rounded-b-2xl sm:px-5">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Seguir editando")}</button>
          <button type="button" onClick={onCrear} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{etiquetaCrear}</button>
        </div>
      </div>
    </div>
  );
}
