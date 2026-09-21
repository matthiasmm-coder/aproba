"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";

// ARRANQUE DE SERIE (Luis, Asenjo 21/09/2026): quien viene de Excel u otro programa ya ha
// emitido facturas este año. Escribe el último número y Aproba sigue desde el siguiente.
// La serie solo AVANZA (numeración correlativa): la route rechaza cualquier retroceso.
// Sin oficinaId = serie común del despacho; con oficinaId = la serie del prefijo de esa sede.
export function SerieFacturas({ oficinaId = null, prefijo = "" }: { oficinaId?: string | null; prefijo?: string }) {
  const t = useT();
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const year = new Date().getFullYear();
  const base = prefijo.trim() ? `${prefijo.trim().toUpperCase()}-${year}` : `${year}`;
  const inputId = `serie-ultimo-${oficinaId ?? "despacho"}`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/facturas/numero${oficinaId ? `?oficina=${encodeURIComponent(oficinaId)}` : ""}`);
        const j = await r.json().catch(() => ({}));
        if (vivo && r.ok && j.numero) setSiguiente(String(j.numero));
      } catch { /* sin red: el bloque sigue usable */ }
    })();
    return () => { vivo = false; };
  }, [oficinaId]);

  async function fijar() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/facturas/numero", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oficinaId, ultimo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo fijar la numeración."));
      setSiguiente(String(j.siguiente)); setUltimo("");
      setMsg({ ok: true, texto: j.sinCambios ? t("La serie ya iba por ese número.") : `${t("Hecho: la siguiente factura será la")} ${j.siguiente}.` });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : t("No se pudo fijar la numeración.") });
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50/60 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Numeración de la serie")}</p>
      <p className="mt-1 text-sm text-slate-600">
        {t("Siguiente factura:")} <span className="font-mono font-semibold text-slate-900">{siguiente ?? "…"}</span>
      </p>
      <p className="mt-2 text-xs text-slate-500">{t("¿Vienes de Excel o de otro programa? Escribe el último número que emitiste este año y Aproba seguirá desde el siguiente. La serie solo avanza: nunca retrocede ni reutiliza un número.")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-sm text-slate-600">{t("La serie continúa desde el nº")}</label>
        <input
          id={inputId} value={ultimo} onChange={(e) => setUltimo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ultimo.trim() && !busy) void fijar(); }}
          placeholder={`${base}-0312`} inputMode="numeric" autoComplete="off"
          className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[16px] sm:text-sm outline-none focus:border-aproba-600"
        />
        <button type="button" onClick={fijar} disabled={busy || !ultimo.trim()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60">
          {busy ? t("Fijando…") : t("Fijar")}
        </button>
      </div>
      {msg && <p role={msg.ok ? undefined : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-aproba-700" : "text-red-600"}`}>{msg.texto}</p>}
    </div>
  );
}
