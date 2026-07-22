"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/facturas";
import { aplicarDescuento, type Descuento } from "@/lib/multi-servicio";
import { useT } from "@/components/lang-provider";

// Descuento de ESTE expediente (pedido por Juan: ajustar el presupuesto antes de enviar
// el enlace — packs familiares, varios servicios juntos). Porcentaje o importe fijo sobre
// los HONORARIOS (las tasas se repercuten por su importe exacto, nunca se descuentan).
// Mismo patrón discreto que «Ajustar tasas y suplidos»: enlace → editor → guardar/quitar.
export function DescuentoExpediente({ expedienteId, inicial, tarifa, nMiembros }: {
  expedienteId: string;
  inicial: Descuento | null;
  tarifa: { anticipo: number; resto: number }; // por persona, SIN ×N
  nMiembros: number;
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Descuento["tipo"]>(inicial?.tipo ?? "PORCENTAJE");
  const [valor, setValor] = useState<number>(inicial?.valor ?? 0);
  const [motivo, setMotivo] = useState(inicial?.motivo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previa = aplicarDescuento(tarifa, nMiembros, valor > 0 ? { tipo, valor } : null);

  async function enviar(descuento: Descuento | null) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/descuento`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descuento }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar el descuento."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el descuento."));
    } finally { setBusy(false); }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => { setTipo(inicial?.tipo ?? "PORCENTAJE"); setValor(inicial?.valor ?? 0); setMotivo(inicial?.motivo ?? ""); setError(null); setAbierto(true); }}
        className="-my-2 py-2 text-xs font-medium text-aproba-700 hover:underline sm:my-0 sm:py-0"
      >
        {inicial ? t("Editar descuento") : t("Aplicar descuento")}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full max-w-md rounded-lg border border-dashed border-slate-300 bg-cream-50/40 p-3">
      <p className="mb-2 text-xs text-slate-500">{t("Solo para este expediente: rebaja los honorarios en el portal, la hoja de encargo y la primera factura. Las tasas y suplidos no se descuentan.")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {(["PORCENTAJE", "IMPORTE"] as const).map((tp) => (
            <button key={tp} onClick={() => setTipo(tp)} className={`px-2.5 py-1.5 text-xs font-medium transition ${tipo === tp ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
              {tp === "PORCENTAJE" ? "%" : "€"}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            type="number" min={0} max={tipo === "PORCENTAJE" ? 100 : undefined} step={tipo === "PORCENTAJE" ? 1 : 5}
            value={valor || ""} placeholder="0" aria-label={t("Valor del descuento")} onFocus={(e) => e.target.select()}
            onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-xs tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{tipo === "PORCENTAJE" ? "%" : "€"}</span>
        </div>
        <input
          value={motivo} maxLength={120}
          placeholder={t("Motivo (p. ej. pack familiar) — opcional")}
          aria-label={t("Motivo del descuento")}
          onChange={(e) => setMotivo(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
        />
      </div>
      {valor > 0 && previa.rebaja > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {eur(previa.bruto)} → <span className="font-semibold text-slate-800">{eur(previa.bruto - previa.rebaja)}</span>{" "}
          <span className="text-aproba-700">(−{eur(previa.rebaja)})</span>
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {inicial && (
          <button onClick={() => enviar(null)} disabled={busy} className="mr-auto text-xs text-slate-400 transition hover:text-slate-600">{t("Quitar descuento")}</button>
        )}
        <button onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
        <button
          onClick={() => enviar({ tipo, valor, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) })}
          disabled={busy || valor <= 0 || (tipo === "PORCENTAJE" && valor > 100)}
          className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
        >
          {busy ? "…" : t("Guardar")}
        </button>
      </div>
    </div>
  );
}
