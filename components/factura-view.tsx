"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FACTURA_ESTADO_META, totalesFactura, retencionDe, r2, type Factura } from "@/lib/facturas";
import { CobroFacturaModal } from "@/components/cobro-factura-modal";
import { FacturaAcciones } from "@/components/factura-acciones";
import { useT } from "@/components/lang-provider";
import { EntregasCuenta } from "@/components/entregas-cuenta";
import { FacturaDocumento } from "@/components/factura-documento";
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
  // Lo que se cobra (para las entregas a cuenta); el papel lo pinta FacturaDocumento.
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto, base: f.base }];
  const { base, total } = totalesFactura(lineas, f.suplidos ?? []);
  const retencion = f.retencion != null ? r2(Number(f.retencion)) : retencionDe(base, f.retencionPct);
  const aPagar = r2(total - retencion);

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
          {editable && !esRect && f.estado !== "PAGADA" && !verifactu?.congelada && (
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
      <FacturaDocumento f={f} emisor={emisor} qr={verifactu?.qr ?? null} />

      {/* Entregas a cuenta: fuera del papel de la factura (print:hidden) — es el
          registro de caja del despacho, no un dato del documento fiscal. */}
      {!esRect && editable && <EntregasCuenta facturaId={f.id} total={aPagar} estado={f.estado} inicial={entregas} />}

      {editando && <CobroFacturaModal modo="editar" facturaId={f.id} onClose={() => setEditando(false)} />}
    </div>
  );
}
