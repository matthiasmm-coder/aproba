"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Identidad fiscal de UNA oficina (fase 6): razón social, NIF, domicilio, email y
// prefijo de serie. Si razón social o NIF están rellenos, las facturas de esta sede
// salen con ESTE bloque completo (nunca se mezclan campos de dos empresas).
type Datos = { razonSocial: string; nif: string; domicilio: string; emailFacturacion: string; prefijoSerie: string };

export function OficinaFacturacion({ oficinaId, nombre, inicial }: { oficinaId: string; nombre: string; inicial: Datos }) {
  const t = useT();
  const [d, setD] = useState<Datos>(inicial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setBusy(true); setError(null); setOk(false);
    try {
      const r = await fetch("/api/oficinas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "facturacion", oficinaId, ...d, prefijoSerie: d.prefijoSerie.toUpperCase() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      setD((x) => ({ ...x, prefijoSerie: x.prefijoSerie.toUpperCase() }));
      setOk(true); window.setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
  const lbl = "mb-1 block text-xs font-medium text-slate-500";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">{t("Datos de facturación de")} {nombre}</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        {t("Rellena razón social o NIF si esta oficina factura como empresa distinta. Vacío = factura con los datos comunes del despacho.")}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label className={lbl}>{t("Razón social")}</label>
          <input value={d.razonSocial} onChange={(e) => setD({ ...d, razonSocial: e.target.value })} maxLength={160} className={inp} /></div>
        <div><label className={lbl}>NIF</label>
          <input value={d.nif} onChange={(e) => setD({ ...d, nif: e.target.value })} maxLength={20} className={inp} /></div>
        <div className="sm:col-span-2"><label className={lbl}>{t("Domicilio fiscal")}</label>
          <input value={d.domicilio} onChange={(e) => setD({ ...d, domicilio: e.target.value })} maxLength={200} placeholder={t("Calle, nº, CP, ciudad")} className={inp} /></div>
        <div><label className={lbl}>{t("Email de facturación")}</label>
          <input value={d.emailFacturacion} onChange={(e) => setD({ ...d, emailFacturacion: e.target.value })} maxLength={120} type="email" className={inp} /></div>
        <div><label className={lbl}>{t("Prefijo de serie")} <span className="font-normal text-slate-400">({t("opcional")})</span></label>
          <input value={d.prefijoSerie} onChange={(e) => setD({ ...d, prefijoSerie: e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) })}
            placeholder="DG" className={inp} />
          <p className="mt-1 text-[11px] text-slate-400">
            {d.prefijoSerie ? `${t("Sus facturas irán numeradas")} ${d.prefijoSerie.toUpperCase()}-${new Date().getFullYear()}-0001…` : t("Sin prefijo: numeración común del despacho.")}
          </p></div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={busy}
          className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {busy ? t("Guardando…") : t("Guardar")}
        </button>
        {ok && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
