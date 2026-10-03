"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// CADUCIDAD DE LA TIE del titular, editable en la cabecera de la ficha del EXPEDIENTE
// (Jennifer, 03/10/2026: «poder poner la fecha de caducidad a mano en la ficha del
// expediente»). Es el MISMO dato que la ficha del cliente (CaducidadTie): al guardar,
// Cliente.fechaCaducidad + vencimiento REAL de Vigía (/api/clientes/caducidad).
const ddmmaaaa = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };

export function CaducidadExpediente({ clienteId, fechaActual }: { clienteId: string; fechaActual: string | null }) {
  const t = useT();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(fechaActual ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dias = fechaActual ? Math.ceil((Date.parse(fechaActual) - Date.now()) / 864e5) : null;

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const res = await fetch("/api/clientes/caducidad", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ clienteId, fecha }] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setGuardando(false); }
  }

  if (editando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="text-slate-400">{t("Caducidad TIE")}</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus aria-label={t("Caducidad de la TIE")}
          className="rounded-md border border-slate-300 px-1.5 py-0.5 text-[16px] outline-none focus:border-aproba-600 sm:text-sm" />
        <button type="button" onClick={guardar} disabled={!fecha || guardando} className="text-xs font-semibold text-aproba-700 hover:underline disabled:opacity-50">
          {guardando ? t("Guardando…") : t("Guardar")}
        </button>
        <button type="button" onClick={() => { setEditando(false); setFecha(fechaActual ?? ""); setError(null); }} className="text-xs text-slate-400 hover:text-slate-600">{t("Cancelar")}</button>
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setEditando(true)} title={t("Caducidad de la TIE del titular: Vigía avisará cuando toque renovar.")} className="group text-left">
      <span className="text-slate-400">{t("Caducidad TIE")} </span>
      {fechaActual && dias !== null
        ? <span className={`font-medium ${dias < 0 ? "text-red-600" : dias <= 60 ? "text-amber-700" : "text-slate-700"}`}>{ddmmaaaa(fechaActual)}</span>
        : <span className="font-medium text-aproba-700">{t("Añadir")}</span>}
      <span className="ml-1 text-xs text-slate-300 transition group-hover:text-slate-500" aria-hidden>✎</span>
    </button>
  );
}
