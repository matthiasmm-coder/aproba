"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

// FIRMA (Y SELLO) DEL PROFESIONAL — Ajustes › Hoja de encargo y mandato (despacho, o una sede
// con bloque propio). Una imagen que se imprime sobre la línea del profesional en la hoja de
// encargo, el presupuesto y el mandato (Luis, 02/10/2026). Se guarda en privado
// (/api/ajustes/firma, lib/firma-despacho): no hay enlace público a ella.
export function FirmaDespacho({ oficinaId = null, soyAdmin = true }: { oficinaId?: string | null; soyAdmin?: boolean }) {
  const t = useT();
  const qs = oficinaId ? `?oficina=${encodeURIComponent(oficinaId)}` : "";
  const [url, setUrl] = useState<string | null>(null);
  const [cargada, setCargada] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function cargar() {
    try {
      const r = await fetch(`/api/ajustes/firma${qs}`, { cache: "no-store" });
      const nueva = r.ok ? URL.createObjectURL(await r.blob()) : null;
      setUrl((vieja) => { if (vieja) URL.revokeObjectURL(vieja); return nueva; });
    } catch { /* sin firma a la vista: se puede subir igual */ }
    setCargada(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void cargar(); }, [qs]);

  async function subir(archivo: File) {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("firma", archivo);
      const r = await fetch(`/api/ajustes/firma${qs}`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar la firma."));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la firma."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function quitar() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/ajustes/firma${qs}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo quitar la firma."));
      setUrl((vieja) => { if (vieja) URL.revokeObjectURL(vieja); return null; });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo quitar la firma."));
    } finally { setBusy(false); }
  }

  const btn = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50";
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold text-slate-600">{t("Firma y sello (imagen)")}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{t("Se imprime sobre la línea del profesional en la hoja de encargo, el presupuesto y el mandato. Mejor un PNG con fondo transparente. Se guarda en privado: solo sale dentro de esos documentos.")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-56 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
          {url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt={t("Firma y sello")} className="max-h-full max-w-full object-contain" />
            : <span className="text-[11px] text-slate-400">{cargada ? t("Sin firma: la línea sale en blanco") : "…"}</span>}
        </div>
        {soyAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn}>
              {busy ? t("Guardando…") : url ? t("Cambiar la imagen") : t("Subir la imagen")}
            </button>
            {url && <button type="button" disabled={busy} onClick={quitar} className="text-xs font-semibold text-slate-500 transition hover:text-red-600 disabled:opacity-50">{t("Quitar")}</button>}
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
