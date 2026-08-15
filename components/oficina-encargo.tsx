"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Hoja de encargo/mandato de UNA sede. Tres modos:
// · heredar (hojaEncargoActiva null) — lo de la gestoría, sin más;
// · «los mismos que X» — puntero a otra oficina;
// · propio — decisión activa/inactiva + mandatario + formas de pago de ESTA sede.
type Datos = { hojaEncargoActiva: boolean | null; mandatarioNombre: string; mandatarioDni: string; mandatarioColegiado: string; mandatarioColegio: string; encargoFormasPago: string };

export function OficinaEncargo({ oficinaId, nombre, inicial, comoOficinaId, otras }: {
  oficinaId: string; nombre: string; inicial: Datos; comoOficinaId: string | null;
  otras: { id: string; nombre: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [d, setD] = useState<Datos>(inicial);
  const [como, setComo] = useState<string>(comoOficinaId ?? "");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propio = d.hojaEncargoActiva !== null;

  async function llamar(body: Record<string, unknown>) {
    setBusy(true); setError(null); setOk(false);
    try {
      const r = await fetch("/api/oficinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      setOk(true); window.setTimeout(() => setOk(false), 2500);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
  const lbl = "mb-1 block text-xs font-medium text-slate-500";

  // ── vinculada a otra oficina ──
  if (comoOficinaId) {
    const ref = otras.find((o) => o.id === comoOficinaId);
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p>{t("Esta oficina usa la misma hoja de encargo que")} <strong>{ref?.nombre ?? "otra oficina"}</strong>.</p>
        <button type="button" disabled={busy} onClick={() => llamar({ action: "encargoComo", oficinaId, comoOficinaId: null })}
          className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
          {t("Desvincular")}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{t("Hoja de encargo de")} {nombre}</h3>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={propio}
            onChange={(e) => {
              if (!e.target.checked) { setD({ ...d, hojaEncargoActiva: null }); llamar({ action: "encargo", oficinaId, hojaEncargoActiva: null }); }
              else setD({ ...d, hojaEncargoActiva: true });
            }}
            className="h-4 w-4 rounded border-slate-300 accent-aproba-600" />
          {t("Configuración propia")}
        </label>
      </div>

      {!propio ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">{t("Heredando la configuración de la gestoría.")}</p>
          {otras.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={como} onChange={(e) => setComo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                <option value="">{t("Usar la misma que…")}</option>
                {otras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
              <button type="button" disabled={busy || !como} onClick={() => llamar({ action: "encargoComo", oficinaId, comoOficinaId: como })}
                className="rounded-lg border border-aproba-600 px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-50">
                {t("Vincular")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(d.hojaEncargoActiva)}
              onChange={(e) => setD({ ...d, hojaEncargoActiva: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-aproba-600" />
            {t("Hoja de encargo activada (el cliente firma desde su portal)")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>{t("Profesional que firma el mandato")}</label>
              <input value={d.mandatarioNombre} onChange={(e) => setD({ ...d, mandatarioNombre: e.target.value })} maxLength={120} className={inp} /></div>
            <div><label className={lbl}>DNI/NIE</label>
              <input value={d.mandatarioDni} onChange={(e) => setD({ ...d, mandatarioDni: e.target.value })} maxLength={20} className={inp} /></div>
            <div><label className={lbl}>{t("Nº colegiado")}</label>
              <input value={d.mandatarioColegiado} onChange={(e) => setD({ ...d, mandatarioColegiado: e.target.value })} maxLength={40} className={inp} /></div>
            <div><label className={lbl}>{t("Colegio profesional")}</label>
              <input value={d.mandatarioColegio} onChange={(e) => setD({ ...d, mandatarioColegio: e.target.value })} maxLength={120} className={inp} /></div>
            <div className="sm:col-span-2"><label className={lbl}>{t("Formas de pago (una por línea)")}</label>
              <textarea value={d.encargoFormasPago} onChange={(e) => setD({ ...d, encargoFormasPago: e.target.value })} rows={3} className={inp} /></div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy}
              onClick={() => llamar({ action: "encargo", oficinaId, ...d })}
              className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
              {busy ? t("Guardando…") : t("Guardar")}
            </button>
            {ok && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
