"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import type { FacturaEstado } from "@/lib/facturas";

// Acciones por factura: archivar/restaurar (no destructivo, cualquier miembro) y eliminar
// (definitivo, solo admin). Reutilizado en la tabla de la lista y en la ficha de la factura.
// El diálogo de borrado avisa del efecto contable en facturas ya emitidas/pagadas.
export function FacturaAcciones({
  id, numero, estado, archivada, esAdmin, onDone,
}: {
  id: string;
  numero: string;
  estado: FacturaEstado;
  archivada: boolean;
  esAdmin: boolean;
  onDone?: () => void; // p.ej. redirigir tras borrar desde la ficha
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "archivar" | "borrar">(null);
  const [error, setError] = useState<string | null>(null);

  async function archivar() {
    setBusy("archivar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}/archivar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivado: !archivada }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo archivar la factura."));
      router.refresh();
      setBusy(null); // los sub-componentes ya no se remontan: hay que resetear a mano
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo archivar la factura."));
      setBusy(null);
    }
  }

  async function borrar() {
    // Aviso reforzado para facturas ya emitidas/pagadas: rompe la numeración correlativa.
    const emitida = estado !== "BORRADOR";
    const mensaje = emitida
      ? t("Vas a eliminar la factura {n} de forma definitiva. Es una factura ya emitida: borrarla rompe la numeración correlativa (lo habitual es emitir una rectificativa). ¿Continuar?").replace("{n}", numero)
      : t("Vas a eliminar el borrador de factura {n} de forma definitiva. ¿Continuar?").replace("{n}", numero);
    if (!(await confirmar({ mensaje, titulo: t("Eliminar factura"), confirmarLabel: t("Eliminar"), peligro: true }))) return;
    setBusy("borrar"); setError(null);
    try {
      const res = await fetch(`/api/facturas/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar la factura."));
      if (onDone) { onDone(); return; } // navega fuera: no reseteamos (se desmonta)
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar la factura."));
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={archivar}
        disabled={busy !== null}
        title={archivada ? t("Restaurar") : t("Archivar")}
        aria-label={archivada ? t("Restaurar factura {n}").replace("{n}", numero) : t("Archivar factura {n}").replace("{n}", numero)}
        className="rounded p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
      >
        {archivada ? (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8" /></svg>
        ) : (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>
        )}
      </button>
      {esAdmin && (
        <button
          onClick={borrar}
          disabled={busy !== null}
          title={t("Eliminar")}
          aria-label={t("Eliminar factura {n}").replace("{n}", numero)}
          className="rounded p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      )}
      {error && <span role="alert" className="ml-1 max-w-[160px] text-right text-[11px] leading-tight text-red-600">{error}</span>}
    </div>
  );
}
