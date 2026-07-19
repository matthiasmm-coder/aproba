"use client";

import { useEffect, useRef, useState } from "react";
import { AprobaMark } from "./logo";
import { LANGS, makeT, detectarLang, docLabel, docHelp, parentescoI18n, type Lang, esLangSoportada, esRTL } from "@/lib/portal-i18n";
import { subirConProgreso } from "@/lib/subir-con-progreso";

export type SegDoc = { label: string; status: "ok" | "procesando" | "rechazado" | "pendiente"; docId?: string; motivo?: string; errorRed?: boolean; clienteId?: string; grupo?: string };

const LANG_KEY = "aproba.portal.lang";
const ORDEN: Record<string, number> = { BORRADOR: 0, DOCS_PENDIENTES: 1, DOCS_VALIDADOS: 2, FORM_GENERADO: 3, PRESENTADO: 4, RESUELTO: 5, CITA_HUELLAS: 6, FINALIZADO: 7, RECHAZADO: 4 };
// AAAA-MM-JJ → JJ/MM/AAAA (date de cita stockée en ISO).
const fmtCita = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

function Check({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
function Download({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;
}

export function Seguimiento({
  token, gestoria, clienteNombre, idioma, referencia, estado, citaPresencial = false, citaQuien = "cliente", cita, docs: docsIniciales, formularios = [], tasaDisponible = false, miembros, gruposDocs,
}: {
  token: string; gestoria: string; clienteNombre: string; idioma: string; referencia: string; estado: string;
  citaPresencial?: boolean; citaQuien?: "cliente" | "gestor"; cita?: { fecha: string | null; hora: string | null; lugar: string | null; notas: string | null }; docs: SegDoc[]; formularios?: string[]; tasaDisponible?: boolean;
  // Expediente familiar: descargas por solicitante (formularios con sus datos + su tasa).
  miembros?: { id: string; nombre: string; tieneTasa: boolean; formularios?: string[] }[];
  // Familia: secciones de documentos (comunes + una por miembro) — los SegDoc llevan
  // grupo/clienteId y aquí solo se agrupan y pliegan. Sin esto: lista plana (individual).
  gruposDocs?: { id: string; nombre?: string; parentesco?: string | null }[];
}) {
  const [lang, setLang] = useState<Lang>((esLangSoportada(idioma) ? idioma : "es") as Lang);
  const [docs, setDocs] = useState<SegDoc[]>(docsIniciales);
  // TODAS las listas desplegables del portal llegan PLEGADAS (pedido de Matthias):
  // el cliente ve las cabeceras con su avance n/m y abre lo que necesita.
  const [plegados, setPlegados] = useState<Record<string, boolean>>(() => {
    const pl: Record<string, boolean> = {};
    for (const g of gruposDocs ?? []) pl[g.id] = true;
    return pl;
  });
  // Formularios por miembro: misma regla — desplegable por miembro, plegado por defecto.
  const [formAbiertos, setFormAbiertos] = useState<Record<string, boolean>>({});
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null); // % subida en curso (misma barra que /j)
  const fileRef = useRef<HTMLInputElement>(null);
  const pendienteRef = useRef<number | null>(null);
  const t = makeT(lang);

  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem(LANG_KEY)) as Lang | null;
    const efectivo = saved && LANGS.some((l) => l.code === saved) ? saved : esLangSoportada(idioma) ? (idioma as Lang) : detectarLang();
    setLang(efectivo);
    document.documentElement.lang = efectivo;
    document.documentElement.dir = esRTL(efectivo) ? "rtl" : "ltr";
  }, [idioma]);

  function elegirLang(l: Lang) {
    setLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = esRTL(l) ? "rtl" : "ltr";
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }

  const idx = ORDEN[estado] ?? 0;
  // Le jalon « cita » n'apparaît que si le service a une cita présentielle.
  const MILESTONES = [
    { key: "mil.recibido", at: 1 },
    { key: "mil.validado", at: 2 },
    { key: "mil.formularios", at: 3 },
    { key: "mil.presentado", at: 4 },
    { key: "mil.resuelto", at: 5 },
    ...(citaPresencial ? [{ key: "mil.cita", at: 6 }] : []),
    { key: "mil.tie", at: 7 },
  ];
  const inicial = gestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const faltan = docs.filter((d) => d.status === "pendiente" || d.status === "rechazado").length;

  function pedirArchivo(i: number) { pendienteRef.current = i; fileRef.current?.click(); }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const i = pendienteRef.current;
    if (!file || i === null) return;
    setSubiendo(i);
    setProgreso(0);
    try {
      const { ok: okRed, data } = await subirConProgreso({
        form: { token, label: docs[i].label, ...(docs[i].clienteId ? { clienteId: docs[i].clienteId! } : {}) },
        file,
        onProgreso: setProgreso,
        errorRed: t("s2.errorSubir"),
      });
      const ok = okRed && data?.estado === "VALIDADO";
      // El MOTIVO del rechazo (alertas de la IA) se muestra, como ya hace /j — «vuelve a
      // subirlo» sin explicar por qué condena al migrante a repetir el mismo error.
      const motivo = !ok ? String(data?.alertas?.[0] ?? data?.error ?? "") || undefined : undefined;
      setDocs((d) => d.map((x, j) => (j === i ? { ...x, status: ok ? "ok" : "rechazado", motivo, errorRed: false } : x)));
    } catch {
      // Fallo de RED ≠ documento rechazado: se conserva el estado y se pide reintentar
      // (antes un timeout 4G se mostraba como «rechazado» → re-subidas en bucle).
      setDocs((d) => d.map((x, j) => (j === i ? { ...x, errorRed: true } : x)));
    } finally {
      setSubiendo(null);
      setProgreso(null);
      pendienteRef.current = null;
    }
  }

  // Tarjeta de un documento — compartida por la lista plana (individual) y las
  // secciones desplegables de la familia (el índice i gobierna subida/progreso).
  const cartaDoc = (d: SegDoc, i: number) => {

              const ayuda = docHelp(d.label, lang);
              const subiendoEste = subiendo === i;
              return (
                <div key={`${d.grupo ?? ""}:${d.clienteId ?? ""}:${d.label}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${d.status === "ok" ? "bg-aproba-100 text-aproba-600" : d.status === "rechazado" ? "bg-red-100 text-red-600" : "bg-cream-50 text-slate-400"}`}>
                        {d.status === "ok" ? <Check className="h-4 w-4" /> : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{docLabel(d.label, lang)}</p>
                        <p className={`text-xs ${d.errorRed ? "text-amber-700" : d.status === "ok" ? "text-aproba-700" : d.status === "rechazado" ? "text-red-600" : d.status === "procesando" ? "text-amber-600" : "text-slate-400"}`}>
                          {d.errorRed ? t("seg.docReintenta") : d.status === "ok" ? t("seg.docOk") : d.status === "procesando" ? t("s2.analizando") : d.status === "rechazado" ? t("seg.docRechazado") : t("seg.docPendiente")}
                        </p>
                        {/* Motivo del rechazo (alerta de la IA) — mismo trato que /j. */}
                        {d.status === "rechazado" && d.motivo && !d.errorRed && (
                          <p className="mt-0.5 text-xs leading-snug text-red-500">{d.motivo}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.docId && (
                        <a href={`/api/seguimiento/${token}/documento/${d.docId}`} download aria-label={t("seg.descargar")} title={t("seg.descargar")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
                          <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("seg.descargar")}</span>
                        </a>
                      )}
                      {(d.status === "pendiente" || d.status === "rechazado" || d.status === "procesando") && (
                        <button onClick={() => pedirArchivo(i)} disabled={subiendoEste} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                          {subiendoEste ? t("s2.analizando") : t("s2.subir")}
                        </button>
                      )}
                    </div>
                  </div>
                  {subiendoEste && progreso !== null && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(progreso)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-aproba-600 transition-all duration-200" style={{ width: `${progreso}%` }} />
                    </div>
                  )}
                  {ayuda && (d.status === "pendiente" || d.status === "rechazado") && (
                    <p className="mt-2 rounded-lg bg-cream-50 px-3 py-2 text-xs leading-relaxed text-slate-500">{ayuda}</p>
                  )}
                </div>
              );
  };

  return (
    <div className="portal-mobile min-h-screen bg-cream-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{inicial}</span>
            <span className="text-sm font-semibold text-slate-800">{gestoria}</span>
          </div>
          <select
            value={lang}
            onChange={(e) => elegirLang(e.target.value as Lang)}
            aria-label={t("lang.selectLabel")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-aproba-600"
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pb-16 pt-6">
        <p className="text-xs font-mono text-slate-400">{referencia}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{t("seg.titulo")}</h1>
        <p className="mt-2 text-slate-600">{t("seg.intro")}</p>

        {/* Resolución desfavorable: la verdad, sobria y humana — nunca un timeline que
            sugiere «Resolución favorable» inminente sobre un expediente denegado. */}
        {estado === "RECHAZADO" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5" role="alert">
            <p className="text-sm font-bold text-red-800">{t("seg.rechazado.titulo")}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-red-700">{t("seg.rechazado.body", { gestoria })}</p>
          </div>
        )}

        {/* La PRÓXIMA ACCIÓN del migrante, arriba del todo: o le toca subir algo (ámbar,
            con botón), o puede estar tranquilo (verde). La cita ya tiene su tarjeta. */}
        {estado !== "RECHAZADO" && (faltan > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">{t("seg.next.titulo")}</p>
            <p className="mt-1 text-sm font-semibold text-amber-800">{t("seg.next.docs", { n: faltan })}</p>
            <button
              onClick={() => document.getElementById("seg-docs")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="mt-3 min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >{t("seg.next.subir")} ↓</button>
          </div>
        ) : estado !== "CITA_HUELLAS" && estado !== "FINALIZADO" ? (
          <div className="mt-6 rounded-2xl border border-aproba-200 bg-aproba-50 p-4">
            <p className="text-sm text-aproba-700">✓ {t("seg.next.ok")}</p>
          </div>
        ) : null)}

        {/* Milestones */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("seg.progreso")}</p>
          <ol className="space-y-0">
            {MILESTONES.map((m, i) => {
              const done = idx >= m.at;
              const current = !done && (i === 0 || idx >= MILESTONES[i - 1].at);
              // Expediente denegado: el jalón de resolución se muestra en rojo con la
              // verdad («desfavorable»), y los siguientes desaparecen del camino.
              const denegadoAqui = estado === "RECHAZADO" && m.key === "mil.resuelto";
              if (estado === "RECHAZADO" && m.at > 5) return null;
              return (
                <li key={m.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-white transition-colors ${denegadoAqui ? "bg-red-500" : done ? "bg-aproba-600" : current ? "bg-amber-400" : "bg-slate-200"}`}>
                      {denegadoAqui ? <span className="text-[10px] font-bold">✕</span> : done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {i < MILESTONES.length - 1 && !(estado === "RECHAZADO" && m.at >= 5) && <span className={`my-0.5 w-px flex-1 ${idx > m.at ? "bg-aproba-300" : "bg-slate-200"}`} style={{ minHeight: "18px" }} />}
                  </div>
                  <div className="pb-4">
                    <p className={`text-sm ${denegadoAqui ? "font-medium text-red-700" : done ? "font-medium text-slate-800" : current ? "font-medium text-amber-700" : "text-slate-400"}`}>{t(denegadoAqui ? "mil.desfavorable" : m.key)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Cita présentielle — détails complets (le client s'y rend) ou simple info de date (le gestor) */}
        {estado === "CITA_HUELLAS" && cita?.fecha && (
          <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-400">{t("mil.cita")}</p>
                <p className="text-sm font-medium text-purple-800">{t("seg.citaFecha")} {fmtCita(cita.fecha)}{cita.hora ? ` · ${cita.hora}` : ""}</p>
              </div>
            </div>
            {citaQuien === "cliente" ? (
              <div className="mt-2 space-y-1 border-t border-purple-100 pt-2 text-xs text-purple-700">
                {cita.lugar && <p>📍 {cita.lugar}</p>}
                {cita.notas && <p>{cita.notas}</p>}
                <p className="font-semibold">{t("seg.citaCliente")}</p>
              </div>
            ) : (
              <p className="mt-2 border-t border-purple-100 pt-2 text-xs text-purple-700">{t("seg.citaGestor")}</p>
            )}
          </div>
        )}

        {/* Documents */}
        <div className="mt-6 scroll-mt-16" id="seg-docs">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("seg.docsTitulo")}</h2>
            <span className={`text-xs font-medium ${faltan ? "text-amber-600" : "text-aproba-700"}`}>{faltan ? t("seg.faltan") : t("seg.todoAlDia")}</span>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onArchivo} />
          {docs.filter((d) => d.docId).length >= 2 && (
            <a
              href={`/api/seguimiento/${token}/documentos-zip`}
              download
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700"
            >
              <Download className="h-3.5 w-3.5" />{t("seg.zipDocs")}
            </a>
          )}
          {gruposDocs?.length ? (
            <div className="space-y-3">
              {gruposDocs.map((g) => {
                const del = docs.map((d, i) => ({ d, i })).filter((x) => x.d.grupo === g.id);
                if (!del.length) return null;
                const okN = del.filter((x) => x.d.status === "ok").length;
                const abierta = !plegados[g.id];
                return (
                  <div key={g.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <button type="button" onClick={() => setPlegados((pl) => ({ ...pl, [g.id]: !pl[g.id] }))} aria-expanded={abierta} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {g.id !== "comunes" && <span className="shrink-0 rounded-full bg-cream-50 px-2 py-0.5 normal-case text-slate-500">{parentescoI18n(g.parentesco ?? null, lang) || t("fam.miembro")}</span>}
                        <span className="truncate">{g.id === "comunes" ? t("fam.docs.comunes") : g.nombre || t("fam.miembro")}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs font-semibold tabular-nums ${okN === del.length ? "text-aproba-700" : "text-slate-400"}`}>{okN}/{del.length}</span>
                        <svg className={`h-4 w-4 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </span>
                    </button>
                    {abierta && (
                      <div className="space-y-2 px-3 pb-3">
                        {g.id === "comunes" && <p className="px-1 text-[11px] leading-relaxed text-slate-400">{t("fam.docs.comunesHint")}</p>}
                        {del.map((x) => cartaDoc(x.d, x.i))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">{docs.map((d, i) => cartaDoc(d, i))}</div>
          )}
        </div>

        {/* Formularios oficiales generados por la gestoría — descargables uno a uno.
            Expediente familiar (miembros) : un bloque por solicitante (formularios con SUS
            datos + su tasa nominativa). */}
        {(() => {
          const LinkTasa = ({ clienteId, etiqueta }: { clienteId?: string; etiqueta?: string }) => (
            <a
              href={`/api/seguimiento/${token}/tasa${clienteId ? `?clienteId=${clienteId}` : ""}`}
              download
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-400 hover:shadow-sm"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
                </span>
                <span className="truncate text-sm font-medium text-slate-800">{etiqueta ?? "Tasa 790-012"} <span className="text-xs font-normal text-aproba-700">PDF</span></span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-aproba-700">
                <Download className="h-3.5 w-3.5" />{t("seg.descargar")}
              </span>
            </a>
          );
          const LinkForm = ({ f, clienteId }: { f: string; clienteId?: string }) => (
            <a
              href={`/api/seguimiento/${token}/formulario?tipo=${encodeURIComponent(f)}${clienteId ? `&clienteId=${clienteId}` : ""}`}
              download
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-400 hover:shadow-sm"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aproba-100 text-aproba-600">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </span>
                <span className="truncate text-sm font-medium text-slate-800">{f} <span className="text-xs font-normal text-aproba-700">PDF</span></span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-aproba-700">
                <Download className="h-3.5 w-3.5" />{t("seg.descargar")}
              </span>
            </a>
          );
          // Todo lo del miembro (o del expediente individual) en un único ZIP.
          const LinkZip = ({ clienteId }: { clienteId?: string }) => (
            <a
              href={`/api/seguimiento/${token}/formularios-zip${clienteId ? `?clienteId=${clienteId}` : ""}`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-aproba-300 bg-aproba-50 px-3 py-2 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-100"
            >
              <Download className="h-3.5 w-3.5" />{t("seg.zipTodo")}
            </a>
          );
          const esFamilia = Boolean(miembros?.length);
          const hayContenido = formularios.length > 0 || tasaDisponible || (esFamilia && miembros!.some((m) => (m.formularios ?? formularios).length > 0 || m.tieneTasa));
          if (!hayContenido) return null;
          return (
            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("seg.formularios")}</h2>
              <p className="mt-0.5 text-xs text-slate-400">{t("seg.formulariosSub")}</p>
              {esFamilia ? (
                <div className="mt-2 space-y-4">
                  {miembros!.map((m) => {
                    const suyos = m.formularios ?? formularios;
                    const nArchivos = suyos.length + (m.tieneTasa ? 1 : 0);
                    if (!nArchivos) return null;
                    const abierta = Boolean(formAbiertos[m.id]);
                    return (
                      <div key={m.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <button type="button" onClick={() => setFormAbiertos((p) => ({ ...p, [m.id]: !p[m.id] }))} aria-expanded={abierta} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{m.nombre}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs font-semibold tabular-nums text-slate-400">{nArchivos} PDF</span>
                            <svg className={`h-4 w-4 text-slate-400 transition-transform ${abierta ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                          </span>
                        </button>
                        {abierta && (
                          <div className="space-y-2 px-3 pb-3">
                            {m.tieneTasa && <LinkTasa clienteId={m.id} etiqueta={`Tasa 790-012 · ${m.nombre.split(" ")[0]}`} />}
                            {suyos.map((f) => <LinkForm key={`${m.id}:${f}`} f={f} clienteId={m.id} />)}
                            {nArchivos >= 2 && <LinkZip clienteId={m.id} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {tasaDisponible && <LinkTasa />}
                  {formularios.map((f) => <LinkForm key={f} f={f} />)}
                  {formularios.length + (tasaDisponible ? 1 : 0) >= 2 && <LinkZip />}
                </div>
              )}
            </div>
          );
        })()}

        <p className="mt-8 flex items-center justify-center gap-1 text-xs text-slate-400">{t("header.con")} <AprobaMark size={13} /> aproba</p>
      </div>
    </div>
  );
}
