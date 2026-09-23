"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";

// Lo facturado ANTES de Aproba (migración, columna «Estado del cobro» — Luis, 24/09/2026).
// No es una factura de Aproba: se informa y, si está pendiente, se marca cobrado a mano.

type Cobro = "COBRADA" | "PENDIENTE";

async function guardarCobro(tipo: "servicio" | "expediente", id: string, cobro: Cobro): Promise<string | null> {
  try {
    const res = await fetch("/api/cobros-previos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, id, cobro }) });
    const d = await res.json().catch(() => ({}));
    return res.ok ? null : (d.error ?? "No se pudo guardar el cobro.");
  } catch {
    return "No se pudo guardar el cobro.";
  }
}

// Botón de la lista «Cobros pendientes»: marca cobrado y la fila desaparece al refrescar.
export function MarcarCobroPrevio({ tipo, id }: { tipo: "servicio" | "expediente"; id: string }) {
  const t = useT();
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);

  async function marcar() {
    if (estado !== "idle") return;
    setEstado("guardando"); setError(null);
    const err = await guardarCobro(tipo, id, "COBRADA");
    if (err) { setError(t(err)); setEstado("idle"); return; }
    setEstado("ok");
    router.refresh();
  }

  if (estado === "ok") return <span className="shrink-0 text-xs font-semibold text-aproba-700">{t("Cobrado")} ✓</span>;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button onClick={marcar} disabled={estado === "guardando"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60">
        {estado === "guardando" ? "…" : t("Marcar como cobrado")}
      </button>
      {error && <span className="max-w-[180px] text-right text-[11px] leading-tight text-red-600">{error}</span>}
    </div>
  );
}

// Línea de la ficha del expediente, sección «Cobro del expediente».
export function CobroPrevioFicha({ expedienteId, importe, cobro }: { expedienteId: string; importe: number | null; cobro: Cobro | null }) {
  const t = useT();
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(nuevo: Cobro) {
    setGuardando(true); setError(null);
    const err = await guardarCobro("expediente", expedienteId, nuevo);
    setGuardando(false);
    if (err) { setError(t(err)); return; }
    router.refresh();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg bg-cream-50/70 px-3 py-2 text-sm">
      <span className="text-slate-500">{t("Facturado antes de Aproba")}{importe != null ? ":" : ""}</span>
      {importe != null && <span className="font-semibold text-slate-800">{eur(importe)}</span>}
      {cobro === "PENDIENTE" && (
        <>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{t("Pendiente de cobro")}</span>
          <button onClick={() => cambiar("COBRADA")} disabled={guardando}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60">
            {guardando ? "…" : t("Marcar como cobrado")}
          </button>
        </>
      )}
      {cobro === "COBRADA" && (
        <>
          <span className="text-aproba-700">· {t("cobrado")}</span>
          <button onClick={() => cambiar("PENDIENTE")} disabled={guardando} className="text-[11px] font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
            {guardando ? "…" : t("Volver a pendiente")}
          </button>
        </>
      )}
      {error && <span className="w-full text-center text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
