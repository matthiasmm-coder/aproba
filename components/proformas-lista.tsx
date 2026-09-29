"use client";

import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { aCobrar, eur } from "@/lib/facturas";
import { PROFORMA_ESTADO_META, proformaViva, type Proforma } from "@/lib/proformas";

// Pestaña «Proformas» de Facturas (pedido de Juan, 29/09/2026): lo pendiente de cobro arriba,
// cada proforma con su estado y, si ya se convirtió, su factura. Ver lib/proformas.ts.
export function ProformasLista({ items, faltaMigracion }: { items: Proforma[]; faltaMigracion: boolean }) {
  const t = useT();
  if (faltaMigracion) {
    return <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("Las proformas necesitan una actualización de la base de datos. Avisa al soporte de Aproba.")}</p>;
  }
  const vivas = items.filter((p) => proformaViva(p.estado));
  const pendiente = vivas.reduce((s, p) => s + aCobrar({ total: p.total, retencion: p.retencion }), 0);

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{t("Aún no hay proformas en este periodo")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t("Una proforma le dice al cliente cuánto va a pagar, sin emitir todavía la factura. Cuando pague, la conviertes en factura con un clic.")}</p>
        <Link href="/app/facturas/proformas/nueva" className="mt-4 inline-block rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nueva proforma")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Pendiente de cobro")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{eur(pendiente)}</p>
          <p className="text-xs text-slate-500">{vivas.length === 1 ? t("1 proforma sin convertir") : t("{n} proformas sin convertir").replace("{n}", String(vivas.length))}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Convertidas en factura")}</p>
          <p className="mt-1 text-2xl font-bold text-aproba-700">{items.filter((p) => p.estado === "CONVERTIDA").length}</p>
          <p className="text-xs text-slate-500">{t("No cuentan como facturas hasta que se convierten.")}</p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((p) => {
          const meta = PROFORMA_ESTADO_META[p.estado];
          return (
            <li key={p.id}>
              <Link href={`/app/facturas/proformas/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-cream-50">
                <span className="w-32 shrink-0 font-mono text-sm font-semibold text-slate-800">{p.numero}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{p.cliente}</span>
                  <span className="block truncate text-xs text-slate-500">{p.concepto} · {p.fecha}{p.facturaNumero ? ` · ${t("factura")} ${p.facturaNumero}` : ""}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}>{t(meta.label)}</span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-900">{eur(aCobrar({ total: p.total, retencion: p.retencion }))}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
