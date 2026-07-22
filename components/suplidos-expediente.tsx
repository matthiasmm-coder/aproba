"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";

type Sup = { concepto: string; importe: number };

// Editor de tasas y suplidos de ESTE expediente (pedido por Juan: ajustar el importe caso
// por caso, p. ej. TIE 16,08 €). Por defecto muestra los del servicio; al guardar se
// persiste un override que alimenta la hoja de encargo, la primera factura y el portal.
// Discreto: un enlace que despliega la lista editable + guardar / restablecer.
export function SuplidosExpediente({ expedienteId, inicial, esOverride }: {
  expedienteId: string;
  inicial: Sup[]; // suplidos resueltos actuales (override o del servicio), SIN ×N
  esOverride: boolean; // ¿el expediente ya tiene un override manual?
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Sup[]>(inicial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = filas.reduce((a, x) => a + (Number(x.importe) || 0), 0);

  // Normaliza para comparar la edición con los valores DEL SERVICIO (inicial cuando no hay
  // override). Si el gestor abre y guarda sin cambiar nada, NO se crea un override que
  // congelaría el expediente a los precios actuales del servicio: se manda null.
  const norm = (xs: Sup[]) => JSON.stringify(xs.filter((x) => x.concepto.trim() && Number(x.importe) > 0).map((x) => ({ concepto: x.concepto.trim(), importe: Number(x.importe) })));
  async function guardar() {
    const limpias = filas.filter((x) => x.concepto.trim() && Number(x.importe) > 0).map((x) => ({ concepto: x.concepto.trim(), importe: Number(x.importe) }));
    const igualAlServicio = !esOverride && norm(filas) === norm(inicial);
    await enviar(igualAlServicio ? null : limpias);
  }

  async function enviar(suplidos: Sup[] | null) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/suplidos`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suplidos }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }

  if (!abierto) {
    return (
      <button onClick={() => { setFilas(inicial.length ? inicial : [{ concepto: "", importe: 0 }]); setError(null); setAbierto(true); }} className="-my-2 py-2 text-xs font-medium text-aproba-700 hover:underline sm:my-0 sm:py-0">
        {t("Ajustar tasas y suplidos")}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-cream-50/40 p-3">
      <p className="mb-2 text-xs text-slate-500">{t("Solo para este expediente: sustituyen a las tasas del servicio y se aplican a la hoja de encargo, la primera factura y el presupuesto del cliente.")}</p>
      <div className="space-y-1.5">
        {filas.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={f.concepto}
              aria-label={t("Concepto (p. ej. Tasa 790-012)")}
              placeholder={t("Concepto (p. ej. Tasa 790-012)")}
              onChange={(e) => setFilas((xs) => xs.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))}
              className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
            />
            <div className="relative">
              <input type="number" min={0} step={0.01} value={f.importe || ""} placeholder="0" aria-label={t("Importe (€)")} onFocus={(e) => e.target.select()}
                onChange={(e) => setFilas((xs) => xs.map((x, j) => j === i ? { ...x, importe: Math.max(0, Number(e.target.value) || 0) } : x))}
                className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-xs tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
            </div>
            <button onClick={() => setFilas((xs) => xs.filter((_, j) => j !== i))} aria-label={`${t("Quitar")} ${f.concepto || t("suplido")}`} className="rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <button onClick={() => setFilas((xs) => [...xs, { concepto: "", importe: 0 }])} className="text-xs font-medium text-aproba-700 hover:underline">{t("+ Añadir tasa o suplido")}</button>
        <span className="text-xs text-slate-500">{t("Total")} <span className="font-semibold text-slate-700">{eur(total)}</span> <span className="text-slate-400">{t("(sin IVA)")}</span></span>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {esOverride && (
          <button onClick={() => enviar(null)} disabled={busy} className="mr-auto text-xs text-slate-400 transition hover:text-slate-600">{t("Restablecer a los del servicio")}</button>
        )}
        <button onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
        <button onClick={guardar} disabled={busy} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{busy ? "…" : t("Guardar")}</button>
      </div>
    </div>
  );
}
