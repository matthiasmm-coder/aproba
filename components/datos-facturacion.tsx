"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { Despacho } from "@/lib/data/config";

// Datos de facturación del despacho (émetteur des factures) éditables depuis le menu
// Facturas. Si domicilio/email manquent → invite ambre ouverte ; sinon carte repliée.
export function DatosFacturacion({ despacho }: { despacho: Despacho }) {
  const t = useT();
  const router = useRouter();
  const incompleto = !despacho.domicilio || !despacho.emailFacturacion;
  const [open, setOpen] = useState(incompleto);
  const [nif, setNif] = useState(despacho.nif ?? "");
  const [domicilio, setDomicilio] = useState(despacho.domicilio ?? "");
  const [email, setEmail] = useState(despacho.emailFacturacion ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nif, domicilio, emailFacturacion: email }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo guardar.")); }
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
  const resumen = [despacho.nif, despacho.domicilio, despacho.emailFacturacion].filter(Boolean).join(" · ");

  return (
    <div className={`mb-5 rounded-xl border p-4 ${incompleto ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{t("Datos de facturación")}</p>
          <p className="truncate text-xs text-slate-500">
            {incompleto ? t("Completa el domicilio y el email para que aparezcan en tus facturas.") : (resumen || despacho.nombre)}
          </p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
          {open ? t("Cerrar") : incompleto ? t("Completar") : t("Editar")}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <label className="block text-xs text-slate-500">{t("NIF / CIF")}
            <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345678" className={input} />
          </label>
          <label className="block text-xs text-slate-500">{t("Domicilio")}
            <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder={t("C/ Mayor 1, 28013 Madrid")} className={input} />
          </label>
          <label className="block text-xs text-slate-500">{t("Email de facturación")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="facturacion@tudespacho.es" className={input} />
          </label>
          <div className="flex items-center gap-3">
            <button onClick={guardar} disabled={saving} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{saving ? t("Guardando…") : t("Guardar")}</button>
            {saved && <span className="text-xs text-aproba-700">{t("Guardado ✓")}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
