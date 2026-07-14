"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// Eliminación DEFINITIVA de un cliente desde su ficha (espejo del botón de expediente).
// El servidor bloquea (409) si el cliente tiene expedientes o pertenece a una familia:
// mostramos ESE mensaje, que dice exactamente qué hacer antes. Solo administradores.
export function EliminarClienteButton({ clienteId, nombre }: { clienteId: string; nombre: string }) {
  const t = useT();
  const router = useRouter();
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    if (!(await confirmar({
      mensaje: t("¿Eliminar a {nombre}? Esta acción no se puede deshacer.").replace("{nombre}", nombre),
      titulo: t("Eliminar cliente"),
      confirmarLabel: t("Eliminar"),
      peligro: true,
    }))) return;
    setBorrando(true); setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar el cliente."));
      router.push("/app/clientes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar el cliente."));
      setBorrando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={eliminar}
        disabled={borrando}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        {borrando ? t("Eliminando…") : t("Eliminar cliente")}
      </button>
      {error && <p role="alert" className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
