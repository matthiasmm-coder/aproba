"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

// Fila «Nombre» del bloque Despacho (Ajustes), editable inline por administradores.
// El nombre del Workspace se propaga a todo: portal del cliente, emails, facturas.
export function RenombrarDespacho({ nombre, puedeEditar }: { nombre: string; puedeEditar: boolean }) {
  const t = useT();
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(nombre);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState(nombre);

  async function guardar() {
    const limpio = draft.trim().replace(/\s+/g, " ");
    if (limpio === actual) { setEditando(false); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "renombrarDespacho", nombre: limpio }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo cambiar el nombre."));
      setActual(String(d.nombre));
      setEditando(false);
      router.refresh(); // cabecera, sidebar y demás superficies con el nombre
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo cambiar el nombre."));
    } finally {
      setBusy(false);
    }
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">{t("Nombre")}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-slate-800">{actual}</span>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => { setDraft(actual); setError(null); setEditando(true); }}
              title={t("Cambiar el nombre del despacho")}
              aria-label={t("Cambiar el nombre del despacho")}
              className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-aproba-700"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-slate-500">{t("Nombre")}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") setEditando(false); }}
          maxLength={80}
          autoFocus
          disabled={busy}
          className="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium text-slate-800 outline-none focus:border-aproba-600"
        />
        <button onClick={guardar} disabled={busy} className="shrink-0 rounded-lg bg-aproba-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {busy ? "…" : t("Guardar")}
        </button>
        <button onClick={() => setEditando(false)} disabled={busy} className="shrink-0 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-600">✕</button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
