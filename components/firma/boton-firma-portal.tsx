"use client";

import { useState } from "react";

// «Firmar en línea» en el portal y el seguimiento del cliente (lib/firma): abre la página de
// firma de los documentos pendientes. La descarga para firmar a mano sigue debajo.
export function BotonFirmaPortal({ token, t }: { token: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ir = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/portal/firma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.token) { window.location.href = `/firma/${j.token}`; return; }
      setError(j.error === "sin_email" ? t("firmaE.portal.sinEmail") : t("firmaE.err.general"));
    } catch { setError(t("firmaE.err.general")); }
    setBusy(false);
  };
  return (
    <div className="mt-3">
      <button type="button" onClick={ir} disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-aproba-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700 disabled:opacity-60">
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>}
        {t("firmaE.portal.firmarLinea")}
      </button>
      <p className="mt-1.5 text-center text-xs text-aproba-700">{t("firmaE.portal.firmarLineaDesc")}</p>
      {error && <p role="alert" className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-aproba-700/80">{t("firmaE.portal.oDescargar")}</p>
    </div>
  );
}
