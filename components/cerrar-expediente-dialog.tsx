"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/lang-provider";
import { SALIDAS, type Salida } from "@/lib/types";
import { eur } from "@/lib/facturas";

// «ARCHIVAR» (flujo v4; renombrado el 18/09/2026 a petición de Marta Asenjo: «Facturar y
// archivar» hacía creer que el botón facturaba siempre — la factura es una CASILLA de este popup): un solo popup para cerrar el expediente.
// Pregunta la SALIDA (así los archivados se leen por categorías y Vigía sabe qué sembrar),
// recuerda la factura final si queda resto y deja elegir si se avisa al cliente.
// Desde el tablero (`sinFactura`) solo se pregunta la salida: el dinero se toca en la ficha.
export function CerrarExpedienteDialog({ referencia, cliente, factura, sinFactura = false, salidaFijada = null, busy = false, fase = "", error = null, onConfirm, onClose }: {
  referencia: string;
  cliente?: string;
  factura?: { resto: number; puedeFacturar: boolean; clienteEmail: string } | null;
  sinFactura?: boolean;
  // Resolución ya registrada en la ficha (favorable/desfavorable, 18/09/2026): el popup
  // no vuelve a preguntar la salida — solo el dinero que queda y el aviso al cliente.
  salidaFijada?: Salida | null;
  busy?: boolean;
  fase?: string;
  error?: string | null;
  onConfirm: (r: { salida: Salida; facturar: boolean; avisar: boolean }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [salida, setSalida] = useState<Salida>(salidaFijada ?? "en_tramite");
  const [facturar, setFacturar] = useState(true);
  const [avisar, setAvisar] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const puedeFacturar = !sinFactura && Boolean(factura?.puedeFacturar);
  const conEmail = Boolean(factura?.clienteEmail);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cerrar-exp-titulo" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="cerrar-exp-titulo" className="text-base font-bold text-slate-900">{t("Archivar expediente")}</h2>
        <p className="mt-0.5 text-xs text-slate-500"><span className="font-mono">{referencia}</span>{cliente ? ` · ${cliente}` : ""}</p>

        {salidaFijada ? (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {t("Resolución")}:
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${salidaFijada === "concedido" ? "bg-aproba-100 text-aproba-700" : "bg-red-50 text-red-600"}`}>
              {salidaFijada === "concedido" ? t("Resolución favorable") : t("Resolución desfavorable")}
            </span>
          </p>
        ) : (
          <>
        <p className="mt-4 text-sm font-medium text-slate-800">{t("¿Cómo termina este expediente?")}</p>
        <div className="mt-2 grid gap-1.5">
          {SALIDAS.map((o) => (
            <label key={o.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${salida === o.key ? "border-aproba-500 bg-aproba-50/60" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" name="salida" value={o.key} checked={salida === o.key} onChange={() => setSalida(o.key)} className="mt-1 accent-aproba-600" disabled={busy} />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{t(o.label)}</span>
                <span className="block text-xs text-slate-500">{t(o.ayuda)}</span>
              </span>
            </label>
          ))}
        </div>
          </>
        )}

        {!sinFactura && (
          <div className="mt-4 grid gap-2 rounded-lg bg-cream-50 px-3 py-2.5 text-xs text-slate-600">
            {puedeFacturar ? (
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={facturar} onChange={(e) => setFacturar(e.target.checked)} className="mt-0.5 accent-aproba-600" disabled={busy} />
                <span>{t("Queda por facturar")} <b>{eur(factura!.resto)}</b> + IVA. {t("Emitir ahora la factura final.")}</span>
              </label>
            ) : (
              <span>{t("El resto ya está facturado: nada pendiente.")}</span>
            )}
            <label className={`flex items-start gap-2 ${conEmail ? "cursor-pointer" : "opacity-60"}`}>
              <input type="checkbox" checked={avisar && conEmail} onChange={(e) => setAvisar(e.target.checked)} className="mt-0.5 accent-aproba-600" disabled={busy || !conEmail} />
              <span>{conEmail ? t("Avisar al cliente por email") : t("El cliente no tiene email: no se le avisará.")}</span>
            </label>
            {salida === "concedido" && <span className="text-slate-500">{t("Vigía sembrará la caducidad estimada de la tarjeta nueva.")}</span>}
          </div>
        )}
        {sinFactura && <p className="mt-4 text-xs text-slate-500">{t("Para facturar el resto o avisar al cliente, cierra desde la ficha.")}</p>}

        {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        {busy && fase && <p className="mt-3 text-xs text-slate-500">{fase}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60">{t("Cancelar")}</button>
          <button type="button" onClick={() => onConfirm({ salida, facturar: puedeFacturar && facturar, avisar: avisar && conEmail })} disabled={busy} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
            {busy ? "…" : t("Archivar")}
          </button>
        </div>
      </div>
    </div>
  );
}
