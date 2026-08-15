"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

// Identidad fiscal de UNA oficina (fase 6): razón social, NIF, domicilio, email y
// prefijo de serie. Si razón social o NIF están rellenos, las facturas de esta sede
// salen con ESTE bloque completo (nunca se mezclan campos de dos empresas).
type Datos = { razonSocial: string; nif: string; domicilio: string; emailFacturacion: string; prefijoSerie: string };

export function OficinaFacturacion({ oficinaId, nombre, inicial, logoInicial = null }: { oficinaId: string; nombre: string; inicial: Datos; logoInicial?: string | null }) {
  const t = useT();
  const [d, setD] = useState<Datos>(inicial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(logoInicial);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function subirLogo(file: File | null) {
    setLogoBusy(true); setError(null);
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
    } finally { setLogoBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

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
      {/* Logo de facturación propio de la sede (cae al del despacho si no hay). */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-slate-300">{t("Sin logo propio")}</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={logoBusy}
            className="text-left text-[11px] font-semibold text-aproba-700 hover:underline disabled:opacity-50">
            {logoBusy ? t("Subiendo…") : logoUrl ? t("Cambiar logo") : t("Subir logo de esta oficina")}
          </button>
          {logoUrl && (
            <button type="button" onClick={() => subirLogo(null)} disabled={logoBusy}
              className="text-left text-[11px] text-slate-400 hover:text-red-600 disabled:opacity-50">
              {t("Quitar (usar el del despacho)")}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subirLogo(f); }} />
        </div>
      </div>

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
