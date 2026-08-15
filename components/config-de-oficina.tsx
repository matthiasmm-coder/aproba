"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { borrarScope, guardarAvisos } from "@/lib/config-browser";
import type { Aviso } from "@/lib/avisos";

// Estado de la config de UNA sede (servicios o avisos) : heredando de la gestoría,
// vinculada a otra oficina («usar los mismos que X»), o con config PROPIA. El editor
// real llega como children; aquí solo se gobierna el modo.
export function ConfigDeOficina({
  oficinaId,
  nombre,
  tabla,               // ServicioConfig | AvisoConfig
  propios,             // ¿tiene filas propias?
  comoOficinaId,       // puntero «mismas que» (solo avisos; null en servicios)
  conPuntero,          // ¿esta sección admite «usar los mismos que X»?
  otras,               // las demás oficinas (para duplicar / apuntar)
  accionPersonalizar,  // "duplicarServicios" | null (avisos personaliza con semilla)
  semillaAvisos,       // avisos efectivos actuales → base al personalizar (solo avisos)
  editor,              // el editor con las filas propias
}: {
  oficinaId: string;
  nombre: string;
  tabla: "ServicioConfig" | "AvisoConfig";
  propios: boolean;
  comoOficinaId: string | null;
  conPuntero: boolean;
  otras: { id: string; nombre: string }[];
  accionPersonalizar: "duplicarServicios" | null;
  semillaAvisos?: Aviso[];
  editor: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const onCambiado = () => router.refresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState<string>("");
  const [como, setComo] = useState<string>(comoOficinaId ?? "");

  const llamar = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/oficinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      onCambiado();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  };

  // ── vinculada a otra oficina ──
  if (conPuntero && comoOficinaId) {
    const ref = otras.find((o) => o.id === comoOficinaId);
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p>{t("Esta oficina usa los mismos que")} <strong>{ref?.nombre ?? "otra oficina"}</strong>.</p>
        <button type="button" disabled={busy} onClick={() => llamar({ action: "avisosComo", oficinaId, comoOficinaId: null })}
          className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
          {t("Desvincular")}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── heredando de la gestoría (sin filas propias) ──
  if (!propios) {
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">{nombre}: {t("usando la configuración de la gestoría")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("Mientras no tenga la suya propia, esta oficina hereda automáticamente la de la gestoría.")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {accionPersonalizar === "duplicarServicios" && (
            <>
              <select value={desde} onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                <option value="">{t("Copiar los de la gestoría")}</option>
                {otras.map((o) => <option key={o.id} value={o.id}>{t("Copiar los de")} {o.nombre}</option>)}
              </select>
              <button type="button" disabled={busy}
                onClick={() => llamar({ action: "duplicarServicios", oficinaId, desdeOficinaId: desde || null })}
                className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                {busy ? t("Copiando…") : t("Duplicar y personalizar")}
              </button>
            </>
          )}
          {semillaAvisos && (
            <button type="button" disabled={busy}
              onClick={async () => {
                setBusy(true); setError(null);
                try { await guardarAvisos(semillaAvisos, oficinaId); onCambiado(); }
                catch (e) { setError(e instanceof Error ? e.message : t("No se pudo.")); }
                finally { setBusy(false); }
              }}
              className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
              {busy ? t("Creando…") : t("Personalizar los de esta oficina")}
            </button>
          )}
          {conPuntero && otras.length > 0 && (
            <>
              <select value={como} onChange={(e) => setComo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                <option value="">{t("Usar los mismos que…")}</option>
                {otras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <button type="button" disabled={busy || !como}
                onClick={() => llamar({ action: "avisosComo", oficinaId, comoOficinaId: como })}
                className="rounded-lg border border-aproba-600 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-50">
                {t("Vincular")}
              </button>
            </>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── config propia ──
  return (
    <div>
      {editor}
      <div className="mt-4">
        <button type="button" disabled={busy}
          onClick={async () => {
            if (!(await confirmar(t("¿Quitar la configuración propia de esta oficina? Volverá a heredar la de la gestoría.")))) return;
            setBusy(true); setError(null);
            try { await borrarScope(tabla, oficinaId); onCambiado(); }
            catch (e) { setError(e instanceof Error ? e.message : t("No se pudo.")); }
            finally { setBusy(false); }
          }}
          className="text-xs font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-50">
          {t("Quitar configuración propia (volver a heredar)")}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
