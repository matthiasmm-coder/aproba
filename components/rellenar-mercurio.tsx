"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import type { MercurioCampo } from "@/lib/mercurio";

// URL de inicio de Mercurio (presentación telemática de extranjería).
const MERCURIO_URL = "https://sede.administracionespublicas.gob.es/mercurio/inicioMercurio.html";

export function RellenarMercurio({ campos, referencia, rellenos, total }: { campos: MercurioCampo[]; referencia: string; rellenos: number; total: number }) {
  const t = useT();
  // null = comprobando, true/false = extensión detectada o no.
  const [ext, setExt] = useState<boolean | null>(null);
  const enviado = useRef(false);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.source !== window) return;
      if (ev.data?.source === "aproba-mercurio-ext" && ev.data?.type === "pong") setExt(true);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "aproba-mercurio", type: "ping" }, window.location.origin);
    const tmo = window.setTimeout(() => setExt((e) => (e === null ? false : e)), 1000);
    return () => { window.removeEventListener("message", onMsg); window.clearTimeout(tmo); };
  }, []);

  function rellenar() {
    // Manda los datos a la extensión (su content script en esta página los recoge)
    // y abre Mercurio. La extensión rellena el formulario allí; el gestor firma.
    window.postMessage({ source: "aproba-mercurio", type: "expediente", referencia, campos }, window.location.origin);
    enviado.current = true;
    window.open(MERCURIO_URL, "_blank", "noopener");
  }

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-aproba-50 text-aproba-600">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-3 7h6l-3 7"/><path d="M5 13h4M15 13h4"/></svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t("Presentar en Mercurio")}</h2>
            <p className="text-xs text-slate-500">{t("Rellena el formulario en un clic desde este expediente")} · {rellenos}/{total} {t("datos listos")}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        {t("Abre Mercurio y rellena automáticamente los datos del solicitante. Revisa, adjunta los documentos y firma tú con tu certificado: Aproba no firma ni presenta por ti.")}
      </p>

      {ext === false ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-sm font-medium text-amber-800">{t("Instala la extensión «Aproba para Mercurio»")}</p>
          <p className="mt-0.5 text-xs text-amber-700">{t("Es necesaria para rellenar Mercurio automáticamente. Una vez instalada, recarga esta página.")}</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={rellenar} className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            {t("Rellenar en Mercurio")}
          </button>
          {ext === true && <span className="inline-flex items-center gap-1.5 text-xs text-aproba-700"><span className="h-1.5 w-1.5 rounded-full bg-aproba-500" />{t("Extensión detectada")}</span>}
          {ext === null && <span className="text-xs text-slate-400">{t("Comprobando extensión…")}</span>}
        </div>
      )}
    </div>
  );
}
