"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";
import { faltaParaConsultar } from "@/lib/numero-oficial";

// «Consultar» el estado en Extranjería (Jennifer, 24/09/2026: «mirar si se puede revisar
// directamente»), en la sección «Estado en Extranjería» de la ficha. La web oficial
// (infoext2) pide NIE o nº de expediente, fecha de presentación y año de nacimiento, y exige
// un captcha: Aproba no puede ni debe consultarla sola. El botón está SIEMPRE (Matthias,
// 24/09: «je ne vois plus le consultar»): la ventanita enseña los datos que hay (un clic los
// copia), dice cuáles faltan y abre la consulta; el captcha lo valida el gestor.
const INFOEXT = "https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html";

function LupaIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}

export function ConsultarExtranjeria({ nie, numeroOficial, fechaPresentacion, fechaNacimiento, alinear = "izquierda" }: {
  nie: string;
  numeroOficial: string;
  fechaPresentacion: string; // dd/mm/aaaa ("" = aún no presentado)
  fechaNacimiento: string;   // ISO aaaa-mm-dd
  alinear?: "izquierda" | "derecha"; // hacia dónde se abre la ventanita (que no se salga de la carta)
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const caja = useRef<HTMLSpanElement>(null);

  // Clic fuera o Escape: se cierra (una ventanita que no se va molesta más que ayuda).
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const faltan = faltaParaConsultar({ nie, numeroOficial, fechaPresentacion, fechaNacimiento }).map((x) => t(x));
  const copiar = async (etiqueta: string, valor: string) => {
    if (await copiarTexto(valor)) { setCopiado(etiqueta); window.setTimeout(() => setCopiado(null), 1500); }
  };
  const datos = ([[t("Nº expediente"), numeroOficial], [t("NIE"), nie], [t("Fecha de presentación"), fechaPresentacion], [t("Año de nacimiento"), fechaNacimiento.slice(0, 4)]] as [string, string][]).filter(([, v]) => v);
  return (
    <span ref={caja} className="relative inline-flex">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-aproba-700 shadow-sm transition hover:border-aproba-300 hover:bg-aproba-50/40">
        <LupaIcon className="h-4 w-4" />
        {t("Consultar")}
      </button>
      {abierto && (
        <div className={`absolute ${alinear === "derecha" ? "right-0" : "left-0"} top-10 z-20 w-72 whitespace-normal rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Datos para la consulta oficial")}</p>
          {datos.map(([k, v]) => (
            <button key={k} type="button" onClick={() => copiar(k, v)} className="mt-1.5 flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
              <span className="text-slate-500">{k}</span>
              <span className="font-mono text-slate-900">{copiado === k ? `✓ ${t("copiado")}` : v}</span>
            </button>
          ))}
          {faltan.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">{t("Falta para consultar:")} {faltan.join(", ")}</p>
          )}
          <a href={INFOEXT} target="_blank" rel="noopener noreferrer" className="mt-2.5 block rounded-lg bg-aproba-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-aproba-700">
            {t("Abrir la consulta oficial")} ↗
          </a>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{t("La web oficial pide un captcha: lo validas tú. Aproba no puede consultarla por su cuenta.")}</p>
        </div>
      )}
    </span>
  );
}
