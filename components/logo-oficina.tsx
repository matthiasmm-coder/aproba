"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

// Logo propio de UNA oficina (el de sus facturas, su hoja de encargo y sus emails; sin él,
// cae al del despacho). Sacado de components/oficina-facturacion.tsx el 30/09/2026 para
// poder cambiarlo también desde «Despacho y cuenta» (Luis: «dos despachos, dos logos»).
export function LogoOficina({ oficinaId, logoInicial = null, puedeEditar = true }: { oficinaId: string; logoInicial?: string | null; puedeEditar?: boolean }) {
  const t = useT();
  const [logoUrl, setLogoUrl] = useState<string | null>(logoInicial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function subir(file: File | null) {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("oficinaId", oficinaId);
      if (file) fd.set("logo", file); else fd.set("quitarLogo", "1");
      const r = await fetch("/api/oficinas/logo", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar el logo."));
      setLogoUrl(j.logoUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el logo."));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-300">{t("Sin logo propio")}</span>
          )}
        </div>
        {puedeEditar && (
          <div className="flex flex-col gap-0.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="text-left text-[11px] font-semibold text-aproba-700 hover:underline disabled:opacity-50">
              {busy ? t("Subiendo…") : logoUrl ? t("Cambiar logo") : t("Subir logo de esta oficina")}
            </button>
            {logoUrl && (
              <button type="button" onClick={() => subir(null)} disabled={busy}
                className="text-left text-[11px] text-slate-400 hover:text-red-600 disabled:opacity-50">
                {t("Quitar (usar el del despacho)")}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
