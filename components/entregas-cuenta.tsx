"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur } from "@/lib/facturas";
import { METODOS, saldoPendiente, totalEntregado, type Entrega } from "@/lib/entregas";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// ENTREGAS A CUENTA — el cliente paga a plazos (Gesadmbcn, 17/08/2026).
// Se anota lo que entra, el saldo baja solo, y cuando llega a 0 la factura queda
// PAGADA por el mismo camino que un cobro normal (lo decide el servidor).
//
// Solo se pinta si la factura admite entregas (EMITIDA/VENCIDA) o si ya tiene
// alguna anotada — en una factura pagada el histórico sigue siendo consultable.
export function EntregasCuenta({ facturaId, total, estado, inicial = [] }: {
  facturaId: string; total: number; estado: string; inicial?: Entrega[];
}) {
  const t = useT();
  const router = useRouter();
  const [entregas, setEntregas] = useState<Entrega[]>(inicial);
  const [importe, setImporte] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const vivo = estado === "EMITIDA" || estado === "VENCIDA";
  if (!vivo && entregas.length === 0) return null;

  const pagado = totalEntregado(entregas);
  const saldo = saldoPendiente(total, entregas);
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;

  async function anotar() {
    const n = Number(String(importe).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setError(t("Indica un importe mayor que cero."));
    setBusy(true); setError(null); setAviso(null);
    try {
      const res = await fetch(`/api/facturas/${facturaId}/entregas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importe: n, metodo, nota }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo anotar la entrega."));
      const r = await fetch(`/api/facturas/${facturaId}/entregas`);
      const dd = await r.json().catch(() => ({ entregas: [] }));
      setEntregas(dd.entregas ?? []);
      setImporte(""); setNota("");
      if (d.excede) setAviso(t("Anotado. El importe supera el saldo: la diferencia queda a favor del cliente."));
      if (d.pagada) { setAviso(t("Saldada: la factura queda como PAGADA.")); router.refresh(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo anotar la entrega."));
    } finally { setBusy(false); }
  }

  async function borrar(id: string) {
    if (!(await confirmar({
      titulo: t("Eliminar la entrega"),
      mensaje: t("Se borrará este cobro del historial de la factura. Las entregas no se editan: se borran y se vuelven a anotar."),
      confirmarLabel: t("Eliminar"), peligro: true,
    }))) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/facturas/${facturaId}/entregas`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregaId: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t("No se pudo eliminar."));
      setEntregas((l) => l.filter((e) => e.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar."));
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 print:hidden">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">{t("Entregas a cuenta")}</h2>
        <p className="text-sm">
          <span className="text-slate-500">{t("Pendiente")}: </span>
          <span className={`font-bold ${saldo === 0 ? "text-aproba-700" : "text-slate-900"}`}>{eur(saldo)}</span>
          {pagado > 0 && <span className="text-slate-400"> · {t("cobrado")} {eur(pagado)} {t("de")} {eur(total)}</span>}
        </p>
      </div>

      {pagado > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-aproba-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {entregas.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {entregas.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold text-slate-800">{eur(Number(e.importe))}</span>
                <span className="text-slate-400"> · {e.fecha?.slice(0, 10)} · {t(METODOS.find(([k]) => k === e.metodo)?.[1] ?? e.metodo)}</span>
                {e.nota && <span className="block truncate text-xs text-slate-400">{e.nota}</span>}
              </span>
              <button onClick={() => borrar(e.id)} disabled={busy} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                {t("Eliminar")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {vivo && !abierto && (
        <button onClick={() => setAbierto(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-aproba-300 px-3 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50">
          + {t("Anotar una entrega")}
        </button>
      )}

      {vivo && abierto && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-cream-50/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_10rem_1fr]">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Importe")}</span>
              <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="50"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm" />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Método")}</span>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] outline-none focus:border-aproba-600 sm:text-sm">
                {METODOS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Nota (opcional)")}</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder={t("p. ej. entregado en mano")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={anotar} disabled={busy} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
              {busy ? t("Guardando…") : t("Anotar")}
            </button>
            <button onClick={() => { setAbierto(false); setError(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400">
              {t("Cancelar")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {aviso && <p className="mt-2 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm text-aproba-800">{aviso}</p>}
    </div>
  );
}
