"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import type { NotaExpediente } from "@/lib/data/expedientes";

type Traducir = (k: string) => string;

// Una nota (a nivel de módulo, no dentro del render: así el estado de edición no se pierde
// al re-renderizar el padre). Editar en línea + borrar con confirmación.
function NotaItem({ nota, t, onDone }: { nota: NotaExpediente; t: Traducir; onDone: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.texto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const limpio = texto.trim();
    if (!limpio) return;
    if (limpio === nota.texto) { setEditando(false); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/notas/${nota.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: limpio }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 404) onDone(); throw new Error(d.error ?? t("No se pudo guardar la nota.")); }
      setEditando(false); setBusy(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la nota.")); setBusy(false);
    }
  }

  async function borrar() {
    if (!(await confirmar({ mensaje: t("¿Eliminar esta nota?"), titulo: t("Eliminar nota"), confirmarLabel: t("Eliminar"), peligro: true }))) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/notas/${nota.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 404) onDone(); throw new Error(d.error ?? t("No se pudo eliminar la nota.")); }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar la nota.")); setBusy(false);
    }
  }

  if (editando) {
    return (
      <li className="rounded-lg border border-aproba-200 bg-white p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={4000}
          autoFocus
          className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
        />
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex items-center justify-end gap-2">
          <button onClick={() => { setEditando(false); setTexto(nota.texto); setError(null); }} disabled={busy} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
          <button onClick={guardar} disabled={busy || !texto.trim()} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{busy ? "…" : t("Guardar")}</button>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-line text-sm text-slate-800">{nota.texto}</p>
        <div className="flex shrink-0 items-center gap-0.5 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button onClick={() => { setTexto(nota.texto); setEditando(true); }} disabled={busy} title={t("Editar")} aria-label={t("Editar nota")} className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          <button onClick={borrar} disabled={busy} title={t("Eliminar")} aria-label={t("Eliminar nota")} className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {nota.autor ? `${nota.autor} · ` : ""}{nota.fecha}{nota.editada ? ` · ${t("editada")}` : ""}
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

// Bloc de notas de trabajo del expediente (pedido de Juan). Se alimenta del servidor
// (`inicial`) y refresca tras cada cambio. Añadir arriba, lista de la más reciente a la más
// antigua.
export function NotasExpediente({ expedienteId, inicial }: { expedienteId: string; inicial: NotaExpediente[] }) {
  const t = useT();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => router.refresh();

  async function anadir() {
    const limpio = texto.trim();
    if (!limpio || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/notas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: limpio }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar la nota."));
      setTexto(""); setBusy(false);
      refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la nota.")); setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") anadir(); }}
          rows={2}
          maxLength={4000}
          placeholder={t("Añade una anotación (p. ej. «cita solicitada»)…")}
          className="min-w-0 flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
        />
        <button onClick={anadir} disabled={busy || !texto.trim()} className="shrink-0 rounded-lg bg-aproba-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          {busy ? "…" : t("Añadir")}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

      {inicial.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {inicial.map((n) => <NotaItem key={n.id} nota={n} t={t} onDone={refrescar} />)}
        </ul>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-400">{t("Sin notas todavía. Añade la primera anotación de este expediente.")}</p>
      )}
    </div>
  );
}
