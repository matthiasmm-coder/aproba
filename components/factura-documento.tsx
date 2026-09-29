"use client";

import { AprobaMark } from "./logo";
import { eur, IVA, totalesFactura, retencionDe, r2, type Factura } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";
import type { Emisor } from "@/components/factura-view";

// El PAPEL de una factura (lo que se imprime), sacado de components/factura-view.tsx el
// 29/09/2026 para que una PROFORMA sea exactamente el mismo documento: `titulo` («Factura
// proforma»), `etiquetaVence` («Válida hasta:») y `aviso` (no es una factura) la cambian.
// Una factura normal no pasa ninguno de los tres y sale como siempre.
export function FacturaDocumento({ f, emisor, qr = null, titulo, etiquetaVence, aviso }: {
  f: Factura; emisor: Emisor; qr?: string | null; titulo?: string; etiquetaVence?: string; aviso?: string | null;
}) {
  const t = useT();
  const esRect = Boolean(f.rectificaId ?? f.rectificaNumero);
  const contacto = [emisor.nif ? `${t("NIF/CIF")} ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean);
  // Líneas: el desglose si existe, si no una sola línea (concepto/base). Suplidos sin IVA.
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const suplidos = f.suplidos ?? [];
  const { base, iva, suplidosTotal, total } = totalesFactura(lineas, suplidos);
  // Retención de IRPF: la guardada al emitir; si solo hay tipo, se calcula sobre la base.
  const retencion = f.retencion != null ? r2(Number(f.retencion)) : retencionDe(base, f.retencionPct);
  const aPagar = r2(total - retencion);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex items-start justify-between">
        <div>
          {emisor.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emisor.logo} alt={emisor.nombre} className="mb-2 max-h-14 max-w-[180px] object-contain" />
          )}
          <p className="text-lg font-bold text-slate-900">{emisor.nombre}</p>
          {contacto.length > 0 && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {contacto.map((c, i) => (<span key={i}>{c}{i < contacto.length - 1 && <br />}</span>))}
            </p>
          )}
        </div>
        <div className="text-right">
          {/* Una rectificativa DEBE decirlo en el propio documento e identificar a la
              factura rectificada (RD 1619/2012, art. 15). */}
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo ?? (esRect ? t("Factura rectificativa") : t("Factura"))}</p>
          <p className="font-mono text-lg font-bold text-slate-900">{f.numero}</p>
          {esRect && f.rectificaNumero && (
            <p className="mt-0.5 text-xs font-medium text-slate-600">{t("Rectifica a la factura")} <span className="font-mono">{f.rectificaNumero}</span></p>
          )}
          <p className="mt-1 text-xs text-slate-500">{t("Fecha:")} {f.fecha}</p>
          {f.vence && <p className="text-xs text-slate-500">{etiquetaVence ?? t("Vencimiento:")} {f.vence}</p>}
        </div>
      </div>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 rounded-lg bg-cream-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("Facturar a")}</p>
          <p className="mt-1 font-medium text-slate-800">{f.cliente}</p>
          {/* Snapshot fiscal congelado al emitir (documento + dirección) — pedido de Juan. */}
          {f.clienteDatos?.documento && <p className="mt-0.5 text-sm text-slate-500">{f.clienteDatos.documento}</p>}
          {f.clienteDatos?.direccion && <p className="mt-0.5 text-sm text-slate-500">{f.clienteDatos.direccion}</p>}
        </div>
        {/* QR tributario (VERI*FACTU, art. 21 Orden HAC/1177/2024): 30-40 mm en papel. */}
        {qr && (
          <figure className="m-0 w-[132px] shrink-0 text-center">
            <figcaption className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{t("QR tributario")}</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={t("QR tributario")} width={120} height={120} className="mx-auto mt-0.5 h-[120px] w-[120px] print:h-[34mm] print:w-[34mm]" />
            <p className="mt-0.5 text-[8px] leading-tight text-slate-500">{t("Factura verificable en la sede electrónica de la AEAT")} · VERI*FACTU</p>
          </figure>
        )}
      </div>

      {/* Líneas */}
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="py-2 font-semibold">{t("Concepto")}</th>
            <th className="py-2 text-right font-semibold">{t("Base")}</th>
            <th className="py-2 text-right font-semibold">{t("IVA")}</th>
            <th className="py-2 text-right font-semibold">{t("Importe")}</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={`l${i}`} className="border-b border-slate-100">
              <td className="py-3 text-slate-700">{l.concepto}</td>
              <td className="py-3 text-right text-slate-700">{eur(l.base)}</td>
              <td className="py-3 text-right text-slate-500">{Math.round(IVA * 100)} %</td>
              <td className="py-3 text-right font-medium text-slate-800">{eur(l.base)}</td>
            </tr>
          ))}
          {suplidos.length > 0 && (
            <>
              <tr><td colSpan={4} className="pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("Suplidos (gastos sin IVA)")}</td></tr>
              {suplidos.map((s, i) => (
                <tr key={`s${i}`} className="border-b border-slate-100">
                  <td className="py-3 text-slate-700">{s.concepto}</td>
                  <td className="py-3 text-right text-slate-300">—</td>
                  <td className="py-3 text-right text-slate-400">{t("No sujeto")}</td>
                  <td className="py-3 text-right font-medium text-slate-800">{eur(s.importe)}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      {/* Totales */}
      <div className="mt-4 flex justify-end">
        <div className="w-60 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(base)}</span></div>
          <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(iva)}</span></div>
          {suplidosTotal > 0 && <div className="flex justify-between text-slate-500"><span>{t("Suplidos (sin IVA)")}</span><span>{eur(suplidosTotal)}</span></div>}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{retencion ? t("Total factura") : t("Total")}</span><span>{eur(total)}</span></div>
          {retencion ? (
            <>
              <div className="flex justify-between text-slate-500"><span>{t("Retención IRPF")}{f.retencionPct ? ` (${f.retencionPct} %)` : ""}</span><span>−{eur(Math.abs(retencion))}</span></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total a pagar")}</span><span>{eur(aPagar)}</span></div>
            </>
          ) : null}
        </div>
      </div>

      {f.notas && (
        <div className="mt-6 rounded-lg bg-cream-50 p-4 text-xs leading-relaxed text-slate-600">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("Notas")}</p>
          <p className="whitespace-pre-line">{f.notas}</p>
        </div>
      )}

      {/* Proforma (29/09/2026): el documento dice que NO es una factura. */}
      {aviso && <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800">{aviso}</p>}

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5"><AprobaMark size={14} /> {t("Generada con Aproba")}</span>
        <span>{t("Forma de pago: transferencia")}</span>
      </div>
    </div>
  );
}
