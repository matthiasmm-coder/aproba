"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { FacturaDocumento } from "@/components/factura-documento";
import type { Emisor } from "@/components/factura-view";
import { AVISO_PROFORMA, PROFORMA_ESTADO_META, proformaBorrable, proformaComoFactura, proformaViva, type Proforma } from "@/lib/proformas";

// FACTURA PROFORMA (pedido de Juan, 29/09/2026): el documento (el mismo papel que una
// factura, con su título y su aviso) y lo que se hace con él: enviarla al cliente,
// convertirla en factura al cobrar, editarla, anularla o borrarla. Ver lib/proformas.ts.

const BTN = "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60";
type Metodo = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO";

export function ProformaView({ p, emisor, emailCliente }: { p: Proforma; emisor: Emisor; emailCliente: string | null }) {
  const t = useT();
  const router = useRouter();
  const [panel, setPanel] = useState<"enviar" | "convertir" | null>(null);
  const [para, setPara] = useState(p.enviadaA ?? emailCliente ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const meta = PROFORMA_ESTADO_META[p.estado];
  const viva = proformaViva(p.estado);

  async function llamar(url: string, init: RequestInit, clave: string): Promise<Record<string, unknown> | null> {
    setOcupado(clave); setError(null); setAviso(null);
    try {
      const res = await fetch(url, init);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      return d as Record<string, unknown>;
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo guardar.")); return null; }
    finally { setOcupado(null); }
  }

  async function enviar() {
    const d = await llamar(`/api/proformas/${p.id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ para }) }, "enviar");
    if (!d) return;
    setPanel(null);
    setAviso(d.simulado ? t("Proforma marcada como enviada (en este entorno no salen emails).") : t("Proforma enviada a {email}.").replace("{email}", para));
    router.refresh();
  }

  async function convertir(cobrada: boolean, metodo?: Metodo) {
    const d = await llamar(`/api/proformas/${p.id}/convertir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cobrada, metodo }) }, "convertir");
    if (!d) return;
    router.push(`/app/facturas/${String(d.facturaId)}`);
    router.refresh();
  }

  async function anular() {
    if (!(await confirmar({ titulo: t("Anular la proforma"), mensaje: t("La proforma queda anulada y ya no se puede enviar ni convertir en factura. Su número no se reutiliza."), confirmarLabel: t("Anular"), peligro: true }))) return;
    if (await llamar(`/api/proformas/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "anular" }) }, "anular")) router.refresh();
  }

  async function eliminar() {
    if (!(await confirmar({ titulo: t("Eliminar la proforma"), mensaje: t("Se borra del todo. Solo se puede con una proforma que no se ha enviado al cliente (o ya anulada)."), confirmarLabel: t("Eliminar"), peligro: true }))) return;
    if (await llamar(`/api/proformas/${p.id}`, { method: "DELETE" }, "eliminar")) { router.push("/app/facturas?vista=proformas"); router.refresh(); }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 print:hidden">
        <Link href="/app/facturas?vista=proformas" className="inline-flex items-center gap-1 py-1 text-sm text-slate-500 transition hover:text-slate-800">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          {t("Proformas")}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-10 items-center rounded-full px-3 text-xs font-semibold ${meta.pill}`}>{t(meta.label)}</span>
          {viva && (
            <>
              <button type="button" onClick={() => setPanel(panel === "convertir" ? null : "convertir")} disabled={ocupado !== null} className={`${BTN} bg-aproba-600 text-white hover:bg-aproba-700`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                {t("Convertir en factura")}
              </button>
              <button type="button" onClick={() => setPanel(panel === "enviar" ? null : "enviar")} disabled={ocupado !== null} className={`${BTN} border border-aproba-300 text-aproba-700 hover:bg-aproba-50`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                {p.estado === "ENVIADA" ? t("Reenviar al cliente") : t("Enviar al cliente")}
              </button>
              <Link href={`/app/facturas/proformas/nueva?editar=${p.id}`} className={`${BTN} border border-slate-300 text-slate-600 hover:border-aproba-300 hover:text-aproba-700`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                {t("Editar")}
              </Link>
            </>
          )}
          <button type="button" onClick={() => window.print()} className={`${BTN} border border-slate-300 text-slate-600 hover:border-slate-400`}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
            {t("Imprimir / PDF")}
          </button>
          <span className="ml-auto flex items-center gap-3">
            {viva && <button type="button" onClick={anular} disabled={ocupado !== null} className="text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-50">{t("Anular")}</button>}
            {proformaBorrable(p.estado) && <button type="button" onClick={eliminar} disabled={ocupado !== null} className="text-xs font-semibold text-slate-500 transition hover:text-red-600 disabled:opacity-50">{t("Eliminar")}</button>}
          </span>
        </div>

        {panel === "enviar" && viva && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="block text-xs font-semibold text-slate-600">{t("Email del cliente")}
              <input type="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@email.com"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] font-normal outline-none focus:border-aproba-600 sm:text-sm" />
            </label>
            <p className="mt-2 text-xs text-slate-500">{t("Recibe la proforma en PDF, el importe a pagar y, si tu oficina tiene IBAN, cómo pagar por transferencia. Las respuestas llegan a tu email de facturación.")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={enviar} disabled={ocupado !== null || !para.trim()} className={`${BTN} bg-aproba-600 text-white hover:bg-aproba-700`}>{ocupado === "enviar" ? t("Enviando…") : t("Enviar")}</button>
              <button type="button" onClick={() => setPanel(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
            </div>
          </div>
        )}

        {panel === "convertir" && viva && (
          <div className="mt-3 rounded-xl border border-aproba-200 bg-aproba-50/50 p-4">
            <p className="text-sm font-semibold text-slate-800">{t("¿El cliente ya ha pagado?")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("Se emite la factura con el número siguiente de tu serie y la fecha de hoy, con los mismos importes. La proforma queda enlazada a ella.")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">{t("Sí, ha pagado en:")}</span>
              {([["TRANSFERENCIA", t("Transferencia")], ["EFECTIVO", t("Efectivo")], ["TARJETA", t("Tarjeta")], ["OTRO", t("Otro")]] as const).map(([m, lbl]) => (
                <button key={m} type="button" onClick={() => convertir(true, m)} disabled={ocupado !== null} className={`${BTN} border border-aproba-200 bg-white text-aproba-700 hover:bg-aproba-100`}>{lbl}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-aproba-100 pt-3">
              <button type="button" onClick={() => convertir(false)} disabled={ocupado !== null} className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline disabled:opacity-50">{t("Emitir la factura sin marcarla como cobrada")}</button>
              {ocupado === "convertir" && <span className="text-xs text-aproba-700">{t("Emitiendo la factura…")}</span>}
            </div>
          </div>
        )}

        {p.estado === "ENVIADA" && p.enviadaAt && !panel && (
          <p className="mt-3 text-xs text-slate-500">{t("Enviada a {email} el {fecha}.").replace("{email}", p.enviadaA ?? "").replace("{fecha}", new Date(p.enviadaAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" }))}</p>
        )}
        {p.estado === "CONVERTIDA" && p.facturaId && (
          <p className="mt-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-xs text-aproba-800">
            {t("Convertida en la factura")}{" "}
            <Link href={`/app/facturas/${p.facturaId}`} className="font-mono font-semibold underline underline-offset-2">{p.facturaNumero ?? t("ver factura")}</Link>.
          </p>
        )}
        {aviso && <p className="mt-3 rounded-lg bg-aproba-50 px-3 py-2 text-xs font-semibold text-aproba-700">{aviso}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      </div>

      <FacturaDocumento f={proformaComoFactura(p)} emisor={emisor} titulo={t("Factura proforma")} etiquetaVence={t("Válida hasta:")} aviso={t(AVISO_PROFORMA)} />
    </div>
  );
}
