"use client";

import { useEffect, useMemo, useState } from "react";
import { AprobaMark } from "./logo";
import { DocumentosFamiliaPortal } from "@/components/documentos-familia-portal";
import type { MiembroInicial } from "@/components/datos-familia";
import { LANGS, makeT, esRTL, esLangSoportada, type Lang } from "@/lib/portal-i18n";

// ENLACE INDIVIDUAL DEL TRABAJADOR (/t/<token>, lote 3, 21/09/2026): dentro del expediente
// de su empresa, el trabajador ve SOLO lo suyo — sus documentos y su mandato para firmar.
// Ni la empresa, ni los otros trabajadores, ni el pago: eso vive en el enlace de la
// empresa (/j). Una sola página: documentos → «enviados».
const LANG_KEY = "aproba.portal.lang";

export function PortalTrabajador({ token, idiomaInicial, gestoria, logoUrl, empresa, clienteId, nombre, apellidos, docs, encargoActivo }: {
  token: string; idiomaInicial: string | null; gestoria: string; logoUrl: string | null; empresa: string;
  clienteId: string; nombre: string; apellidos: string | null; docs: string[]; encargoActivo: boolean;
}) {
  const [lang, setLang] = useState<Lang>(esLangSoportada(idiomaInicial) ? (idiomaInicial as Lang) : "es");
  const [listo, setListo] = useState(false);
  const t = useMemo(() => makeT(lang), [lang]);

  // Idioma: el de su ficha (lo puso la empresa), salvo que él ya eligiera otro en este navegador.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved && LANGS.some((x) => x.code === saved)) setLang(saved as Lang);
    } catch { /* sin storage */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = esRTL(lang) ? "rtl" : "ltr";
  }, [lang]);
  function elegirLang(l: Lang) {
    setLang(l);
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }

  const miembro: MiembroInicial = { id: clienteId, nombre, apellidos, parentesco: null, esSolicitante: true, ficha: {} };
  const iniciales = gestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt={gestoria} className="h-[38px] w-auto max-w-[180px] object-contain" />
              : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{iniciales}</span>}
            <span className="text-sm font-semibold text-slate-800">{gestoria}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <select
              value={lang}
              onChange={(e) => elegirLang(e.target.value as Lang)}
              aria-label={t("lang.selectLabel")}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[16px] sm:text-xs text-slate-600 outline-none focus:border-aproba-600"
            >
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
            <span className="flex items-center gap-1 text-[10px] text-slate-400">{t("header.con")} <AprobaMark size={13} /></span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-16 pt-6">
        {listo ? (
          <div className="rounded-2xl border border-aproba-200 bg-aproba-50 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-aproba-600 text-white">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">{t("trab.listo.titulo")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("trab.listo.texto")}</p>
            <button type="button" onClick={() => setListo(false)} className="mt-5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
          </div>
        ) : (
          <>
            <p className="text-lg font-bold text-slate-900">{t("trab.saludo", { nombre: nombre.split(" ")[0] || nombre })}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{t("trab.intro", { empresa, gestoria })}</p>
            <div className="mt-6">
              <DocumentosFamiliaPortal
                modo="trabajador"
                token={token}
                lang={lang}
                miembros={[miembro]}
                docsComunes={[]}
                docsPorMiembro={{ [clienteId]: docs }}
                encargoActivo={encargoActivo}
                endpointDocs="/api/trabajador/documentos"
                urlMandatoDe={() => `/api/trabajador/encargo?token=${token}`}
                onBack={() => {}}
                onContinue={() => { setListo(true); window.scrollTo({ top: 0 }); }}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
