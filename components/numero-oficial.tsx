"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { MAX_NUMERO_OFICIAL } from "@/lib/numero-oficial";

function EdificioIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6" /></svg>;
}

// Nº de expediente OFICIAL (el que asigna Extranjería) — petición de Jennifer, 23-24/09/2026.
// Se escribe donde se trabaja: en la FILA del expediente (Expedientes, en curso e historial)
// o en la cabecera de la ficha. Intro guarda, Escape cancela, vaciar el campo lo borra.
export function NumeroOficial({ expedienteId, inicial, variante, onGuardado, className = "" }: {
  expedienteId: string;
  inicial: string;
  variante: "fila" | "ficha";
  onGuardado?: (numero: string) => void;
  className?: string; // fila: colocación dentro de la fila (p. ej. su orden en el móvil)
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

  if (editando) {
    return (
      <span className={variante === "ficha" ? "inline-flex flex-wrap items-center gap-2" : `inline-flex shrink-0 items-center ${className}`}>
        <input
          autoFocus value={borrador} maxLength={MAX_NUMERO_OFICIAL} disabled={busy}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") { setBorrador(valor); setEditando(false); setError(null); } }}
          onBlur={() => { if (!busy) void guardar(); }}
          placeholder={t("p. ej. 08/123456/2026")}
          aria-label={t("Nº de expediente de Extranjería")}
          className={`rounded border border-aproba-400 bg-white px-1.5 py-0.5 font-mono text-[16px] sm:text-xs outline-none ring-2 ring-aproba-100 ${variante === "ficha" ? "w-56" : "w-40"}`}
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

  // Fila: el número, si lo hay, se lee siempre (clic = corregirlo). Si no lo hay, «+ Nº
  // expediente» aparece al pasar por la fila en escritorio — en cada fila fijo sería ruido;
  // en el móvil se añade desde la ficha.
  return valor ? (
    <button type="button" onClick={() => setEditando(true)} title={`${t("Nº de expediente de Extranjería")} · ${t("Editar")}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${className}`}>
      <EdificioIcon className="h-3 w-3 shrink-0 text-slate-400" />{valor}
    </button>
  ) : (
    <button type="button" onClick={() => setEditando(true)} title={t("Añadir el nº de expediente de Extranjería")}
      className={`hidden shrink-0 rounded px-1 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-aproba-700 focus:opacity-100 lg:inline-flex lg:opacity-0 lg:group-hover:opacity-100 ${className}`}>
      + {t("Nº expediente")}
    </button>
  );
}
