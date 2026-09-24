"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";
import { faltaParaConsultar } from "@/lib/numero-oficial";

// «Consultar» el estado en Extranjería (Jennifer, 24/09/2026: «mirar si se puede revisar
// directamente»). Vivía en la vista Tabla, retirada ese día; ahora va junto al nº oficial,
// en la ficha. La web oficial (infoext2) pide NIE o nº de expediente, fecha de presentación
// y año de nacimiento, y exige un captcha: Aproba no puede ni debe consultarla sola. Aquí
// prepara los datos (un clic los copia) y abre la consulta; el captcha lo valida el gestor.
const INFOEXT = "https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html";

export function ConsultarExtranjeria({ nie, numeroOficial, fechaPresentacion, fechaNacimiento }: {
  nie: string;
  numeroOficial: string;
  fechaPresentacion: string; // dd/mm/aaaa ("" = aún no presentado)
  fechaNacimiento: string;   // ISO aaaa-mm-dd
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const faltan = faltaParaConsultar({ nie, numeroOficial, fechaPresentacion, fechaNacimiento }).map((x) => t(x));
  const copiar = async (etiqueta: string, valor: string) => {
    if (await copiarTexto(valor)) { setCopiado(etiqueta); window.setTimeout(() => setCopiado(null), 1500); }
  };
  if (faltan.length) {
    return <span title={`${t("Falta para consultar:")} ${faltan.join(", ")}`} className="cursor-help text-xs text-slate-300">{t("Consultar")}</span>;
  }
  const datos = ([[t("Nº expediente"), numeroOficial], [t("NIE"), nie], [t("Fecha de presentación"), fechaPresentacion], [t("Año de nacimiento"), fechaNacimiento.slice(0, 4)]] as [string, string][]).filter(([, v]) => v);
  return (
    <span className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-aproba-700 transition hover:border-aproba-300">
        {t("Consultar")}
      </button>
      {abierto && (
        <div className="absolute left-0 top-7 z-20 w-64 whitespace-normal rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Estado en Extranjería")}</p>
          {datos.map(([k, v]) => (
            <button key={k} type="button" onClick={() => copiar(k, v)} className="mt-1.5 flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
              <span className="text-slate-500">{k}</span>
              <span className="font-mono text-slate-900">{copiado === k ? `✓ ${t("copiado")}` : v}</span>
            </button>
          ))}
          <a href={INFOEXT} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-lg bg-aproba-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-aproba-700">
            {t("Abrir la consulta oficial")} ↗
          </a>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{t("La web oficial pide un captcha: lo validas tú. Aproba no puede consultarla por su cuenta.")}</p>
        </div>
      )}
    </span>
  );
}
