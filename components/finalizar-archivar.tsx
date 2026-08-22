"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadArchivados, setArchivadoServidor } from "@/lib/archivo";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { normalizarEstado } from "@/lib/progreso";
import { ArchivarButton } from "@/components/archivar-button";
import { useT } from "@/components/lang-provider";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// «FINALIZAR Y ARCHIVAR» (22/08, pedido de Matthias) — el cierre del expediente en UN
// gesto desde la columna Resultado. El popup pregunta si facturar lo que queda (solo si
// de verdad queda algo y no hay ya factura final ni plan de cuotas), y al confirmar:
//   1) factura final vía /api/pagos (sinEmail — irá dentro del correo de cierre)
//   2) estado → FINALIZADO vía /avanzar (sinAviso; solo desde RESUELTO — un denegado
//      ya ES un resultado y /avanzar lo rechazaría con razón)
//   3) email de finalización combinado (/finalizar-email) — con o sin factura
//   4) archivado (servidor + caché local, como el botón de la cabecera)
// Ya archivado, muestra el estado del ArchivarButton de siempre (chip + Restaurar).
export function FinalizarArchivar({ expedienteId, estado, resto, puedeFacturar, clienteEmail }: {
  expedienteId: string;
  estado: string;
  resto: number;         // pendiente de facturar (base sin IVA, ya con descuento y ×miembros)
  puedeFacturar: boolean; // resto > 0 ∧ sin factura final ∧ sin plan de cuotas
  clienteEmail: string;   // "" = sin email → se cierra sin enviar nada
}) {
  const t = useT();
  const router = useRouter();
  const [archivado, setArchivado] = useState(false);
  const [open, setOpen] = useState(false);
  const [facturar, setFacturar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fase, setFase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ enviado: string; factura: { numero: string; total: number } | null } | null>(null);

  useEffect(() => { setArchivado(loadArchivados().has(expedienteId)); }, [expedienteId]);

  if (archivado && !hecho) return <ArchivarButton id={expedienteId} />;

  if (hecho) {
    return (
      <div className="text-center text-sm">
        <p className="font-semibold text-aproba-800">✓ {t("Trámite finalizado y archivado")}</p>
        <p className="mt-1 text-xs text-slate-500">
          {hecho.enviado === "SIN_CONTACTO"
            ? t("Sin email del cliente: no se envió ningún correo.")
            : `${t("Email de finalización enviado a")} ${clienteEmail}${hecho.factura ? ` · ${t("factura")} ${hecho.factura.numero} (${eur(hecho.factura.total)})` : ""}`}
          {hecho.enviado === "SIMULADO" && ` · ${t("(simulado)")}`}
        </p>
      </div>
    );
  }

  async function confirmar() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      // 1) Liquidación final — solo si el gestor dijo que sí en el popup.
      let facturaId: string | undefined;
      if (puedeFacturar && facturar) {
        setFase(t("Emitiendo la factura…"));
        const rP = await fetch("/api/pagos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expedienteId, momento: "FINAL", sinEmail: true }),
        });
        const dP = await rP.json().catch(() => ({}));
        if (!rP.ok) throw new Error(dP.error ?? t("No se pudo emitir la factura."));
        facturaId = dP.facturaId;
      }

      // 2) RESUELTO → FINALIZADO (Vigía incluido). Denegado o ya finalizado: nada que mover.
      if (normalizarEstado(estado) === "RESUELTO") {
        setFase(t("Finalizando el trámite…"));
        const rA = await fetch(`/api/expedientes/${expedienteId}/avanzar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "finalizar", sinAviso: true }),
        });
        if (!rA.ok) { const d = await rA.json().catch(() => ({})); throw new Error(d.error ?? t("No se pudo finalizar el trámite.")); }
      }

      // 3) El correo de cierre (si hay a quién enviarlo).
      let enviado = "SIN_CONTACTO";
      let facturaOut: { numero: string; total: number } | null = null;
      if (clienteEmail) {
        setFase(t("Enviando el email al cliente…"));
        const rE = await fetch(`/api/expedientes/${expedienteId}/finalizar-email`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facturaId ? { facturaId } : {}),
        });
        const dE = await rE.json().catch(() => ({}));
        if (!rE.ok) throw new Error(dE.error ?? t("No se pudo enviar el email de finalización."));
        enviado = dE.enviado; facturaOut = dE.factura ?? null;
      }

      // 4) Archivar — mismo mecanismo que el botón de la cabecera (evento incluido).
      setFase(t("Archivando…"));
      await setArchivadoServidor(expedienteId, true);
      setArchivado(true);
      setHecho({ enviado, factura: facturaOut });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar el cierre."));
    } finally { setBusy(false); setFase(""); }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setError(null); }} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">
        {t("Finalizar y archivar")}
      </button>
      {open && (
        <Modal onClose={() => !busy && setOpen(false)}>
          <h2 className="text-lg font-bold text-slate-900">{t("Finalizar y archivar")}</h2>

          {puedeFacturar && (
            <div className="mt-4">
              <p className="text-sm text-slate-600">
                {t("Queda pendiente de facturar")} <strong>{eur(totalDe(r2(resto)))}</strong> <span className="text-slate-400">{t("IVA inc.")}</span>. {t("¿Quieres incluir la factura en el email de cierre?")}
              </p>
              <div className="mt-2.5 space-y-1.5">
                <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${facturar ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200"}`}>
                  <input type="radio" name="facturar" checked={facturar} onChange={() => setFacturar(true)} className="accent-aproba-600" />
                  <span className="text-slate-700">{t("Sí, facturar lo pendiente")}</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${!facturar ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200"}`}>
                  <input type="radio" name="facturar" checked={!facturar} onChange={() => setFacturar(false)} className="accent-aproba-600" />
                  <span className="text-slate-700">{t("No, cerrar sin facturar")}</span>
                </label>
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-slate-500">
            {clienteEmail
              ? `${t("Se enviará el email de finalización a")} ${clienteEmail} ${t("y el expediente se archivará.")}`
              : t("Este cliente no tiene email: se finalizará y archivará sin enviar nada.")}
          </p>

          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-3">
            <button onClick={() => setOpen(false)} disabled={busy} className="text-sm text-slate-500 transition hover:text-slate-800">{t("Cancelar")}</button>
            <button onClick={confirmar} disabled={busy} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
              {busy ? (fase || "…") : t("Finalizar y archivar")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useScrollBloqueado();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="mt-4 w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-left shadow-xl sm:my-8 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
