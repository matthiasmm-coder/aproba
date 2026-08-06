"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Interruptor «Ocultar precios al cliente» — vive en la cabecera de la sección
// SERVICIOS de Ajustes (habla de los precios de los servicios, no del encargo).
// Guardado inmediato al conmutar (optimista, con reversión si el servidor falla):
// un switch que espera a un botón «Guardar» lejano se olvida activado a medias.
export function OcultarPreciosToggle({ inicial }: { inicial: boolean }) {
  const t = useT();
  const [activo, setActivo] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function conmutar() {
    const objetivo = !activo;
    setActivo(objetivo); setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("soloOcultarPrecios", "1");
      fd.set("portalOcultarPrecios", objetivo ? "1" : "0");
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
    } catch (e) {
      setActivo(!objetivo); // revertir: el estado en pantalla nunca miente sobre la BD
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{t("Ocultar precios al cliente")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          {t("El portal no muestra ningún importe en la selección de servicios (ni 0 €) y no pide el anticipo. Las facturas que emitas sí muestran su importe: el cliente ve lo que paga.")}
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={t("Ocultar precios al cliente")}
        disabled={saving}
        onClick={conmutar}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${activo ? "bg-aproba-600" : "bg-slate-300"} disabled:opacity-60`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
