"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";

// Ajustes → Integraciones → «Recibir documentos por email» (03/09/2026; movida 06/09).
// Cada despacho tiene una dirección propia: lo que se reenvía a ella entra en Aproba,
// se reconoce al cliente por las pistas del email y los adjuntos caen en su expediente
// o en su ficha; si no está claro, aparecen en la bandeja de entrada (justo debajo).
export function RecibirDocumentosConfig({ direccion, pendientes = 0 }: { direccion: string | null; pendientes?: number }) {
  const t = useT();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!direccion) return;
    if (await copiarTexto(direccion)) { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }
  }

  return (
    <div id="recepcion" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{t("Recibir documentos por email")}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{t("Los emails con documentos que reenvíes aquí entran solos en Aproba.")}</p>
        </div>
        {pendientes > 0 && (
          <Link href="#bandeja" className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            {pendientes} {t(pendientes === 1 ? "email por asignar" : "emails por asignar")}
          </Link>
        )}
      </div>

      {direccion ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-cream-50 px-3 py-2 font-mono text-sm text-slate-800">{direccion}</code>
          <button type="button" onClick={copiar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
            {copiado ? t("Copiada") : t("Copiar")}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("La dirección estará disponible cuando se aplique la migración de la base de datos.")}</p>
      )}

      <ol className="mt-3 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-3">
        <li className="rounded-lg bg-cream-50 px-3 py-2"><b className="text-slate-800">1.</b> {t("Reenvía el email del cliente tal cual, con sus adjuntos (PDF o imagen, máx. 8 MB).")}</li>
        <li className="rounded-lg bg-cream-50 px-3 py-2"><b className="text-slate-800">2.</b> {t("Aproba reconoce al cliente y guarda cada documento en su expediente o en su ficha.")}</li>
        <li className="rounded-lg bg-cream-50 px-3 py-2"><b className="text-slate-800">3.</b> {t("Si no lo reconoce, lo asignas con un clic en la bandeja de abajo.")}</li>
      </ol>
      <p className="mt-2 text-[11px] text-slate-400">{t("Tus clientes también pueden escribir directamente a esta dirección.")}</p>
    </div>
  );
}
