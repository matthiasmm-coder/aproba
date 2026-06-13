"use client";

import Link from "next/link";
import { AprobaMark } from "./logo";
import { eur, ivaDe, totalDe, IVA, FACTURA_ESTADO_META, type Factura } from "@/lib/facturas";

const EMISOR = { nombre: "Gestoría Vallès", cif: "B-65432109", dir: "C/ Indústria 45, 08025 Barcelona", email: "facturacion@gestoriavalles.es" };

export function FacturaView({ f }: { f: Factura }) {
  const meta = FACTURA_ESTADO_META[f.estado];
  return (
    <div className="mx-auto max-w-2xl">
      {/* Actions — cachées à l'impression */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/app/facturas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Facturas
        </Link>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pill}`}>{meta.label}</span>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Document facture */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-slate-900">{EMISOR.nombre}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">CIF {EMISOR.cif}<br />{EMISOR.dir}<br />{EMISOR.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Factura</p>
            <p className="font-mono text-lg font-bold text-slate-900">{f.numero}</p>
            <p className="mt-1 text-xs text-slate-500">Fecha: {f.fecha}</p>
            {f.vence && <p className="text-xs text-slate-500">Vencimiento: {f.vence}</p>}
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-cream-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Facturar a</p>
          <p className="mt-1 font-medium text-slate-800">{f.cliente}</p>
        </div>

        {/* Líneas */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-2 font-semibold">Concepto</th>
              <th className="py-2 text-right font-semibold">Base</th>
              <th className="py-2 text-right font-semibold">IVA</th>
              <th className="py-2 text-right font-semibold">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-3 text-slate-700">{f.concepto}</td>
              <td className="py-3 text-right text-slate-700">{eur(f.base)}</td>
              <td className="py-3 text-right text-slate-500">{Math.round(IVA * 100)} %</td>
              <td className="py-3 text-right font-medium text-slate-800">{eur(f.base)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totales */}
        <div className="mt-4 flex justify-end">
          <div className="w-56 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Base imponible</span><span>{eur(f.base)}</span></div>
            <div className="flex justify-between text-slate-500"><span>IVA ({Math.round(IVA * 100)} %)</span><span>{eur(ivaDe(f.base))}</span></div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Total</span><span>{eur(totalDe(f.base))}</span></div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><AprobaMark size={14} /> Generada con Aproba</span>
          <span>Forma de pago: transferencia / domiciliación</span>
        </div>
      </div>
    </div>
  );
}
