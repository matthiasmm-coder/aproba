"use client";

import { useEffect } from "react";

// Error boundary de segment (Next.js). Évite la page blanche sur un crash React :
// affiche un message propre + reintentar. La trace part dans les logs serveur
// (Vercel) ; brancher Sentry.captureException ici quand le DSN sera configuré.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", error.digest ?? "", error.message);
  }, [error]);

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
