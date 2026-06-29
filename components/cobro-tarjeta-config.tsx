"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";

// Ajustes › Cobro con tarjeta. El despacho pega su clave secreta Stripe (idealmente
// RESTRINGIDA). Se guarda cifrada vía /api/ajustes/stripe; aquí solo se ve el estado
// (modo + cola), nunca la clave completa. Activa el botón «Pagar con tarjeta» en los
// emails de factura — los cobros van directamente a la cuenta Stripe de la gestoría.

type Estado = { configurado: boolean; activa: boolean; modo: "live" | "test" | null; cola: string | null };

export function CobroTarjetaConfig() {
  const t = useT();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [editando, setEditando] = useState(false);
  const [clave, setClave] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ajustes/stripe").then((r) => r.json()).then((d) => setEstado(d.error ? { configurado: false, activa: false, modo: null, cola: null } : d)).catch(() => setEstado({ configurado: false, activa: false, modo: null, cola: null }));
  }, []);

  async function guardar() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/ajustes/stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secretKey: clave.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setEstado(d); setEditando(false); setClave("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }

  async function desactivar() {
    if (!window.confirm(t("¿Desactivar el cobro con tarjeta? El email volverá a ofrecer solo transferencia."))) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/ajustes/stripe", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t("No se pudo desactivar."));
      setEstado(d); setEditando(false); setClave("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo desactivar."));
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aproba-50 text-aproba-700">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800">{t("Cobro con tarjeta")}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {t("Añade un botón «Pagar con tarjeta» en los emails de factura. Los cobros van directamente a tu cuenta Stripe.")}
          </p>
        </div>
        {estado?.configurado && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.activa ? "bg-aproba-100 text-aproba-700" : "bg-slate-100 text-slate-500"}`}>
            {estado.activa ? t("Activado") : t("Inactivo")}{estado.modo ? ` · ${estado.modo}` : ""}
          </span>
        )}
      </div>

      {estado === null ? (
        <p className="mt-4 text-sm text-slate-400">{t("Cargando…")}</p>
      ) : estado.configurado && !editando ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm text-slate-600">
            {estado.modo === "live" ? "sk_live_" : estado.modo === "test" ? "sk_test_" : "sk_"}••••{estado.cola}
          </span>
          <button onClick={() => { setEditando(true); setError(null); }} disabled={busy} className="text-sm font-semibold text-aproba-700 hover:underline disabled:opacity-50">{t("Cambiar clave")}</button>
          <button onClick={desactivar} disabled={busy} className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50">{t("Desactivar")}</button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Clave secreta de Stripe")}</label>
          <input
            type="password"
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="sk_live_… o rk_live_…"
            className="w-full rounded-md border border-slate-300 px-2.5 py-2 font-mono text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            {t("Recomendado: una clave RESTRINGIDA (Stripe › Desarrolladores › Claves API) con permiso de escritura solo en «Checkout» y «PaymentIntents». La clave se guarda cifrada y nunca se muestra.")}
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={guardar} disabled={busy || !clave.trim()} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {busy ? t("Guardando…") : t("Activar cobro con tarjeta")}
            </button>
            {(estado.configurado || editando) && (
              <button onClick={() => { setEditando(false); setClave(""); setError(null); }} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Cancelar")}</button>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
