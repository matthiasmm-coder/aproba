"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { MAX_NUMERO_OFICIAL } from "@/lib/expedientes-tabla";

// Nº de expediente OFICIAL (el que asigna Extranjería) — petición de Jennifer, 23/09/2026.
// Se escribe donde se trabaja: directamente en la celda de la tabla (como en su Excel) o
// en la cabecera de la ficha. Intro guarda, Escape cancela, vaciar el campo lo borra.
export function NumeroOficial({ expedienteId, inicial, variante, onGuardado }: {
  expedienteId: string;
  inicial: string;
  variante: "celda" | "ficha";
  onGuardado?: (numero: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [valor, setValor] = useState(inicial);
  const [borrador, setBorrador] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (borrador.trim() === valor) { setEditando(false); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/numero-oficial`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numeroOficial: borrador }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar el número."));
      const nuevo = String(j.numeroOficial ?? "");
      setValor(nuevo); setBorrador(nuevo); setEditando(false);
      onGuardado?.(nuevo);
      if (variante === "ficha") router.refresh(); // el historial de la ficha enseña el cambio
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el número."));
    } finally { setBusy(false); }
  }

  const parar = (e: React.SyntheticEvent) => e.stopPropagation(); // en la tabla, la fila abre la ficha

  if (editando) {
    return (
      <span onClick={parar} className={variante === "ficha" ? "inline-flex flex-wrap items-center gap-2" : "inline-flex items-center"}>
        <input
          autoFocus value={borrador} maxLength={MAX_NUMERO_OFICIAL} disabled={busy}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") { setBorrador(valor); setEditando(false); setError(null); } }}
          onBlur={() => { if (!busy) void guardar(); }}
          placeholder={t("p. ej. 08/123456/2026")}
          aria-label={t("Nº de expediente de Extranjería")}
          className={`rounded border border-aproba-400 bg-white px-1.5 py-0.5 font-mono text-[16px] sm:text-xs outline-none ring-2 ring-aproba-100 ${variante === "ficha" ? "w-56" : "w-36"}`}
        />
        {error && <span role="alert" className="ml-1 text-[11px] text-red-600">{error}</span>}
      </span>
    );
  }

  if (variante === "ficha") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-slate-400">{t("Nº expediente (Extranjería)")}</span>
        {valor
          ? <button type="button" onClick={() => setEditando(true)} title={t("Editar")} className="font-mono font-semibold text-slate-800 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:decoration-slate-500">{valor}</button>
          : <button type="button" onClick={() => setEditando(true)} className="font-semibold text-aproba-700 hover:underline">+ {t("Añadir")}</button>}
      </span>
    );
  }

  return valor ? (
    <button type="button" onClick={(e) => { parar(e); setEditando(true); }} title={t("Editar")} className="font-mono text-xs text-slate-800 hover:underline hover:decoration-dotted">
      {valor}
    </button>
  ) : (
    <button type="button" onClick={(e) => { parar(e); setEditando(true); }} title={t("Añadir el nº de expediente de Extranjería")}
      className="group inline-flex h-5 w-24 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] font-semibold text-slate-300 transition hover:border-aproba-400 hover:text-aproba-700">
      <span className="opacity-0 group-hover:opacity-100">+ {t("Añadir")}</span>
    </button>
  );
}
