"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { esChunkPerimido, recargarPorChunkPerimido } from "@/lib/chunk-perimido";

// Error boundary de segment (Next.js). Évite la page blanche sur un crash React :
// affiche un message propre + reintentar. Trace en logs serveur + Sentry (no-op sans DSN).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recargando, setRecargando] = useState(false);
  useEffect(() => {
    // Chunk de un build viejo tras un deploy: recargar trae el build nuevo. No es un
    // fallo de la app y no debe asustar al gestor con «Algo ha fallado».
    if (esChunkPerimido(error) && recargarPorChunkPerimido()) { setRecargando(true); return; }
    console.error("[app error]", error.digest ?? "", error.message);
    Sentry.captureException(error);
  }, [error]);

  if (recargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-500">Hay una versión nueva de Aproba — actualizando…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
      </div>
      <h1 className="mt-5 text-xl font-bold text-slate-900">Algo ha fallado</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">Ha ocurrido un error inesperado. Puedes reintentar; si el problema persiste, escríbenos desde el botón de feedback.</p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">Reintentar</button>
        <a href="/app" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Volver al inicio</a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-slate-400">Ref: {error.digest}</p>}
    </div>
  );
}
