"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";
import { LANGS, makeT, detectarLang, servicioLabel, esLangSoportada, esRTL, type Lang } from "@/lib/portal-i18n";

// PROPUESTA DE RENOVACIÓN (11/09/2026) — lo que ve el cliente en /j/[token] mientras la
// renovación está PROPUESTA: qué trámite, cuánto cuesta y dos botones. UN clic en el email
// basta (decisión Matthias): si la URL trae ?r=aceptar|rechazar, la respuesta se registra
// al abrirse la página (POST desde el navegador — un escáner que solo sigue la URL no
// responde por el cliente) y se enseña el resultado. Sin ?r (enlace reenviado, espacio /c)
// quedan los dos botones. Con el contacto del despacho para quien tenga dudas.
export type ServicioPropuesto = { id: string; label: string; total: number | null; anticipo: number | null };
export type ContactoProp = { email: string | null; telefono: string | null };

export function PropuestaRenovacion({ token, gestoria, logoUrl = null, idioma, tipo, fecha, servicio, preseleccion = null, estado, contacto = null }: {
  token: string; gestoria: string; logoUrl?: string | null; idioma: string;
  tipo: string; fecha: string | null; servicio: ServicioPropuesto | null;
  preseleccion?: "aceptar" | "rechazar" | null; estado: "PROPUESTA" | "RECHAZADA"; contacto?: ContactoProp | null;
}) {
  const [lang, setLang] = useState<Lang>((esLangSoportada(idioma) ? idioma : "es") as Lang);
  const auto = estado === "PROPUESTA" && preseleccion ? preseleccion : null;
  const [fase, setFase] = useState<"idle" | "enviando" | "aceptada" | "rechazada">(estado === "RECHAZADA" ? "rechazada" : auto ? "enviando" : "idle");
  const [error, setError] = useState<string | null>(null);
  const t = makeT(lang);
  // Respuesta traída por el enlace del email: se registra nada más abrir, una sola vez.
  useEffect(() => { if (auto) void responder(auto === "aceptar" ? "ACEPTADA" : "RECHAZADA", true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("aproba.portal.lang")) as Lang | null;
    const efectivo = saved && LANGS.some((l) => l.code === saved) ? saved : esLangSoportada(idioma) ? (idioma as Lang) : detectarLang();
    setLang(efectivo);
    document.documentElement.lang = efectivo;
    document.documentElement.dir = esRTL(efectivo) ? "rtl" : "ltr";
  }, [idioma]);

  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const tipoTr = t(`notif.renov.tipo.${tipo}`) === `notif.renov.tipo.${tipo}` ? tipo : t(`notif.renov.tipo.${tipo}`);
  const fechaTxt = fecha ? new Date(fecha).toLocaleDateString(lang === "en" ? "en-GB" : lang) : null;
  const inicial = gestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  async function responder(respuesta: "ACEPTADA" | "RECHAZADA", desdeEmail = false) {
    if (!desdeEmail && respuesta === "RECHAZADA" && !window.confirm(t("prop.confirmarRechazo", { gestoria }))) return;
    setFase("enviando"); setError(null);
    try {
      const res = await fetch("/api/portal/renovacion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, respuesta }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("prop.error"));
      // Ya respondida antes (doble apertura del email): se respeta lo que hay.
      const efectiva = d.yaRespondida ? (d.estado === "TRAMITANDO" ? "ACEPTADA" : d.respuesta ?? respuesta) : respuesta;
      if (efectiva === "ACEPTADA") { setFase("aceptada"); setTimeout(() => { window.location.href = `/j/${token}`; }, 900); }
      else setFase("rechazada");
    } catch (e) {
      setFase("idle"); setError(e instanceof Error ? e.message : t("prop.error"));
    }
  }
  const contactoLinea = contacto && (contacto.email || contacto.telefono) ? (
    <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
      {t("prop.dudas", { gestoria })}{" "}
      {contacto.email && <a href={`mailto:${contacto.email}`} className="font-semibold text-aproba-700">{contacto.email}</a>}
      {contacto.email && contacto.telefono && " · "}
      {contacto.telefono && <a href={`tel:${contacto.telefono.replace(/\s+/g, "")}`} className="font-semibold text-aproba-700">{contacto.telefono}</a>}
    </p>
  ) : null;

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt={gestoria} className="h-[38px] w-auto max-w-[180px] object-contain" />
              : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{inicial}</span>}
            <span className="text-sm font-semibold text-slate-800">{gestoria}</span>
          </div>
          <select value={lang} onChange={(e) => { const l = e.target.value as Lang; setLang(l); document.documentElement.lang = l; document.documentElement.dir = esRTL(l) ? "rtl" : "ltr"; try { localStorage.setItem("aproba.portal.lang", l); } catch { /* */ } }} aria-label={t("lang.selectLabel")} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-16 pt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold tracking-tightest text-slate-900">{t("prop.titulo")}</h1>
          {fechaTxt && <p className="mt-2 text-sm text-slate-600">{t("prop.caduca", { tipo: tipoTr, fecha: fechaTxt })}</p>}

          {fase === "rechazada" ? (
            <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{t("prop.rechazada", { gestoria })}</p>
          ) : fase === "aceptada" ? (
            <p className="mt-5 rounded-xl border border-aproba-200 bg-aproba-50 px-4 py-3 text-sm font-medium text-aproba-700">{t("prop.aceptada")}</p>
          ) : auto && fase === "enviando" ? (
            <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{t("prop.registrando")}</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-slate-600">{t("prop.intro", { gestoria })}</p>
              <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                <div className="flex items-baseline justify-between gap-3 px-4 py-3"><dt className="text-sm text-slate-500">{t("prop.tramite")}</dt><dd className="text-right text-sm font-semibold text-slate-900">{servicio ? servicioLabel(servicio.id, servicio.label, lang) : "—"}</dd></div>
                <div className="flex items-baseline justify-between gap-3 px-4 py-3"><dt className="text-sm text-slate-500">{t("prop.honorarios")}</dt><dd className="text-right text-sm font-semibold text-slate-900">{servicio?.total != null ? eur(servicio.total) : t("prop.sinPrecio")}</dd></div>
                {servicio?.anticipo != null && <div className="flex items-baseline justify-between gap-3 px-4 py-3"><dt className="text-sm text-slate-500">{t("prop.anticipo")}</dt><dd className="text-right text-sm font-semibold text-slate-900">{eur(servicio.anticipo)}</dd></div>}
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">{t("prop.nota")}</p>
              {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" autoFocus disabled={fase === "enviando"} onClick={() => responder("ACEPTADA")}
                  className="min-h-[48px] rounded-xl bg-aproba-600 px-4 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                  {fase === "enviando" ? t("prop.enviando") : t("prop.aceptar")}
                </button>
                <button type="button" disabled={fase === "enviando"} onClick={() => responder("RECHAZADA")}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-50">
                  {t("prop.rechazar")}
                </button>
              </div>
            </>
          )}
          {contactoLinea}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-400">con <AprobaMark size={13} /> aproba</p>
      </main>
    </div>
  );
}
