"use client";

import { useState } from "react";
import { copiarTexto } from "@/lib/copiar";
import { INFOEXT2_ACCESO, SMS_INFOEXT_LEGIBLE, TELEFONO_INFOEXT, enlaceSms, fechaDMA, type DatosConsulta } from "@/lib/consulta-estado";

// «Consulta el estado de tu expediente» (28/09/2026, pedido de Jennifer): su «Guía para
// clientes» de GESADM, en la página de seguimiento del cliente y con SUS datos ya puestos.
// Solo sale con el expediente presentado y los datos completos (lib/consulta-estado.ts).
// Los rótulos de la web oficial («Entrar formulario», «Consultar») van en español en todos
// los idiomas: es lo que el cliente verá en la pantalla oficial.
export function ConsultaEstadoCliente({ datos, gestoria, t }: {
  datos: DatosConsulta;
  gestoria: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  // Números dentro de una frase: aislados de izquierda a derecha y sin cortes. En árabe
  // (RTL), «651 714 610» partido en dos líneas salía con los bloques desordenados.
  const numero = (v: string) => `\u2066${v.replace(/ /g, "\u00a0")}\u2069`;
  const filas = ([
    ["cons.nie", datos.nie],
    ["cons.expediente", datos.numeroExpediente],
    ["cons.fecha", fechaDMA(datos.fechaPresentacion)],
    ["cons.anio", datos.anioNacimiento],
  ] as [string, string][]).filter(([, v]) => v);
  const copiar = async (clave: string, valor: string) => {
    if (await copiarTexto(valor)) { setCopiado(clave); window.setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 1500); }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aproba-50 text-aproba-600">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("cons.titulo")}</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("cons.intro")}</p>

      <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {filas.map(([clave, valor]) => (
          <div key={clave} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-xs text-slate-500">{t(clave)}</dt>
            <dd className="flex items-center gap-2">
              <span dir="ltr" className="font-mono text-sm font-semibold text-slate-900">{valor}</span>
              <button type="button" onClick={() => void copiar(clave, valor)}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:border-aproba-300 hover:text-aproba-700">
                {copiado === clave ? `✓ ${t("cons.copiado")}` : t("cons.copiar")}
              </button>
            </dd>
          </div>
        ))}
      </dl>

      <a href={INFOEXT2_ACCESO} target="_blank" rel="noopener noreferrer"
        className="mt-4 block w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700">
        {t("cons.abrir")} ↗
      </a>

      <ol className="mt-4 space-y-2 text-sm leading-snug text-slate-600">
        {["cons.paso1", "cons.paso2", "cons.paso3"].map((k, i) => (
          <li key={k} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{i + 1}</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>

      {datos.sms && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-snug text-slate-600">
          <p>{t("cons.sms", { texto: numero(datos.sms), numero: numero(SMS_INFOEXT_LEGIBLE) })}</p>
          {/* En el móvil, un toque abre la app de mensajes con el texto ya escrito. */}
          <a href={enlaceSms(datos.sms)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-aproba-300 sm:hidden">
            {t("cons.smsBoton")}
          </a>
        </div>
      )}

      <p className="mt-3 text-xs leading-snug text-slate-400">
        {t("cons.telefono", { telefono: numero(TELEFONO_INFOEXT) })} {t("cons.nota", { gestoria })}
      </p>
    </div>
  );
}
