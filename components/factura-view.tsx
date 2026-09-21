"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AprobaMark } from "./logo";
import { eur, IVA, FACTURA_ESTADO_META, totalesFactura, type Factura } from "@/lib/facturas";
import { CobroFacturaModal } from "@/components/cobro-factura-modal";
import { FacturaAcciones } from "@/components/factura-acciones";
import { useT } from "@/components/lang-provider";
import { EntregasCuenta } from "@/components/entregas-cuenta";
import type { Entrega } from "@/lib/entregas";

export type Emisor = { nombre: string; nif: string | null; domicilio?: string | null; email?: string | null; logo?: string | null };

// VERI*FACTU (17/09/2026): estado del registro en la AEAT y, si hay URL, el QR tributario
// que se imprime en la factura. `congelada`: el alta ya se envió → sin botón Editar.
export type VerifactuVista = {
  estado: string; label: string; pill: string; tono: "ok" | "pendiente" | "problema" | "bloqueado";
  motivo: string | null; url: string | null; qr: string | null; congelada: boolean; reintentable: boolean;
};

// `editable`: muestra el botón "Editar" (abre el popup de edición). Solo en la ficha de la
// factura; en la vista previa de "Nueva factura" se deja en false. `esAdmin`: habilita el
// borrado (archivar/eliminar); solo aplica en la ficha real.
// Altura común de la barra de acciones de la factura: la del botón «Editar» (h-10).
// Pedido de Matthias (18/09/2026): antes cada botón tenía la suya y «Marcar como pagada»
// e «Imprimir / PDF» partían el texto en dos líneas, dejando la fila desigual.
const BTN = "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition";

export function FacturaView({ f, emisor, editable = false, esAdmin = false, entregas = [], verifactu = null }: { f: Factura; emisor: Emisor; editable?: boolean; esAdmin?: boolean; entregas?: Entrega[]; verifactu?: VerifactuVista | null }) {
  const t = useT();
  const router = useRouter();
  const meta = FACTURA_ESTADO_META[f.estado];
  const esRect = Boolean(f.rectificaId ?? f.rectificaNumero);
  const [marcando, setMarcando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [errorVf, setErrorVf] = useState<string | null>(null);
  async function reintentarVerifactu() {
    setReintentando(true); setErrorVf(null);
    try {
      const res = await fetch(`/api/facturas/${f.id}/verifactu`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "reintentar" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo reenviar."));
      if (d.hecho === false && d.motivo) setErrorVf(d.motivo);
      router.refresh();
    } catch (e) {
      setErrorVf(e instanceof Error ? e.message : t("No se pudo reenviar."));
    } finally { setReintentando(false); }
  }
  const contacto = [emisor.nif ? `${t("NIF/CIF")} ${emisor.nif}` : null, emisor.domicilio, emisor.email].filter(Boolean);

  // Líneas: el desglose si existe, si no una sola línea (concepto/base). Suplidos sin IVA.
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const suplidos = f.suplidos ?? [];
  const { base, iva, suplidosTotal, total } = totalesFactura(lineas, suplidos);

  // El propio selector de método hace de confirmación (antes: diálogo sí/no y
  // TRANSFERENCIA grabada fija aunque el cliente pagara en efectivo).
  const [eligiendo, setEligiendo] = useState(false);
  async function marcarPagada(metodo: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO") {
    setEligiendo(false);
    setMarcando(true);
    try {
      const res = await fetch(`/api/facturas/${f.id}/pagada`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metodo }) });
      if (res.ok) router.refresh();
    } finally {
      setMarcando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Acciones — ocultas al imprimir. La flecha «Facturas» va en SU línea y los botones
          debajo (antes se apelotonaban a su lado). Todos comparten la misma altura, la del
          botón «Editar» (BTN), y no parten el texto en dos líneas. */}
      <div className="mb-6 print:hidden">
        <Link href="/app/facturas" className="inline-flex items-center gap-1 py-1 text-sm text-slate-500 transition hover:text-slate-800">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          {t("Facturas")}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-10 items-center rounded-full px-3 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
          {verifactu && (
            <>
              <span title={verifactu.motivo ?? undefined} className={`inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold ${verifactu.pill}`}>
                {verifactu.tono === "ok" ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : verifactu.tono === "pendiente" ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
                ) : (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                )}
                {t("AEAT")}: {t(verifactu.label)}
              </span>
              {verifactu.reintentable && (
                <button onClick={reintentarVerifactu} disabled={reintentando} className={`${BTN} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50`}>
                  {reintentando ? t("Enviando…") : t("Reenviar a la AEAT")}
                </button>
              )}
            </>
          )}
          {editable && f.estado !== "PAGADA" && !verifactu?.congelada && (
            <button onClick={() => setEditando(true)} className={`${BTN} border border-slate-300 text-slate-600 hover:border-aproba-300 hover:text-aproba-700`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              {t("Editar")}
            </button>
          )}
          {/* Un ABONO (rectificativa) no se cobra: se devuelve. Marcarlo «pagada»
              mandaría al cliente una confirmación de pago en negativo. */}
          {!esRect && f.estado === "EMITIDA" && (eligiendo ? (
            <>
              <span className="text-xs font-medium text-slate-500">{t("¿Cómo te ha pagado?")}</span>
              {([["EFECTIVO", t("Efectivo")], ["TRANSFERENCIA", t("Transferencia")], ["TARJETA", t("Tarjeta")], ["OTRO", t("Otro")]] as const).map(([m, lbl]) => (
                <button key={m} onClick={() => marcarPagada(m)} disabled={marcando} className={`${BTN} border border-aproba-200 bg-aproba-50 text-aproba-700 hover:bg-aproba-100 disabled:opacity-60`}>{lbl}</button>
              ))}
              <button onClick={() => setEligiendo(false)} className="px-1 text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
            </>
          ) : (
            <button onClick={() => setEligiendo(true)} disabled={marcando} className={`${BTN} border border-aproba-300 text-aproba-700 hover:bg-aproba-50 disabled:opacity-60`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {marcando ? t("Guardando…") : t("Marcar como pagada")}
            </button>
          ))}
          <button onClick={() => window.print()} className={`${BTN} bg-aproba-600 text-white hover:bg-aproba-700`}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
            {t("Imprimir / PDF")}
          </button>
          {editable && (
            <FacturaAcciones id={f.id} numero={f.numero} estado={f.estado} archivada={Boolean(f.archivado)} esAdmin={esAdmin} enBarra esRectificativa={esRect} rectificadaPor={f.rectificadaPor ?? null} metodoPago={f.metodoPago ?? null} onDone={() => { router.push("/app/facturas"); router.refresh(); }} />
          )}
        </div>
      </div>

      {verifactu && (verifactu.tono === "problema" || verifactu.tono === "bloqueado" || errorVf) && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 print:hidden">
          {errorVf ?? verifactu.motivo ?? t(verifactu.label)}
        </p>
      )}

      {/* Document facture */}
      {f.rectificadaPor && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 print:hidden">
          {t("Esta factura se rectificó con la")}{" "}
          <Link href={`/app/facturas/${f.rectificadaPor.id}`} className="font-mono font-semibold underline underline-offset-2">{f.rectificadaPor.numero}</Link>.
        </p>
      )}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{esRect ? t("Factura rectificativa") : t("Factura")}</p>
            <p className="font-mono text-lg font-bold text-slate-900">{f.numero}</p>
            {esRect && f.rectificaNumero && (
              <p className="mt-0.5 text-xs font-medium text-slate-600">{t("Rectifica a la factura")} <span className="font-mono">{f.rectificaNumero}</span></p>
            )}
            <p className="mt-1 text-xs text-slate-500">{t("Fecha:")} {f.fecha}</p>
            {f.vence && <p className="text-xs text-slate-500">{t("Vencimiento:")} {f.vence}</p>}
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
          {verifactu?.qr && (
            <figure className="m-0 w-[132px] shrink-0 text-center">
              <figcaption className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{t("QR tributario")}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={verifactu.qr} alt={t("QR tributario")} width={120} height={120} className="mx-auto mt-0.5 h-[120px] w-[120px] print:h-[34mm] print:w-[34mm]" />
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
                    <td className="py-3 text-right text-slate-400">{t("Exento")}</td>
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
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(total)}</span></div>
          </div>
        </div>

        {f.notas && (
          <div className="mt-6 rounded-lg bg-cream-50 p-4 text-xs leading-relaxed text-slate-600">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t("Notas")}</p>
            <p className="whitespace-pre-line">{f.notas}</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5"><AprobaMark size={14} /> {t("Generada con Aproba")}</span>
          <span>{t("Forma de pago: transferencia")}</span>
        </div>
      </div>

      {/* Entregas a cuenta: fuera del papel de la factura (print:hidden) — es el
          registro de caja del despacho, no un dato del documento fiscal. */}
      {!esRect && editable && <EntregasCuenta facturaId={f.id} total={total} estado={f.estado} inicial={entregas} />}

      {editando && <CobroFacturaModal modo="editar" facturaId={f.id} onClose={() => setEditando(false)} />}
    </div>
  );
}
