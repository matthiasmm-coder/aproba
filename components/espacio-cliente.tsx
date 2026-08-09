"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";
import { LANGS, makeT, detectarLang, servicioLabel, esLangSoportada, esRTL, type Lang } from "@/lib/portal-i18n";
import { agruparPorTema, fmtPct, normTema, packPct, packRebajado } from "@/lib/servicios";
import { TemaPlegable } from "@/components/tema-plegable";

// ESPACIO PERSISTENTE DEL CLIENTE — la cara visible de /c/[token]: sus trámites en curso
// y terminados (incluido el histórico pre-migración) + solicitar un trámite nuevo, en su
// idioma (8 lenguas, mismas convenciones visuales que /j y /s).

export type EspacioExp = {
  referencia: string;
  servicioId: string | null;
  label: string;
  extras: { id: string; label: string }[];
  denegado: boolean;
  enCurso: boolean;
  url: string | null;   // /s/<token> del expediente (null = histórico importado)
  fecha: string;        // dd/mm/aaaa
};
export type EspacioServicio = { id: string; label: string; precio: number; precioOculto?: boolean; porcentaje?: number; porcentajeSobre?: string; categoria?: string };
export type EspacioPack = { id: string; nombre: string; desc: string; servicioIds: string[]; precioDesde: number; descuentoPct?: number; porcentaje?: number; porcentajeSobre?: string; precioOculto?: boolean; categoria?: string };

const LANG_KEY = "aproba.portal.lang";
const fmtEur = (n: number) => `${(Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","))} €`;

export function EspacioCliente({ token, gestoria, nombre, idioma, enCurso, terminados, servicios, packs = [] }: {
  token: string; gestoria: string; nombre: string; idioma: string;
  enCurso: EspacioExp[]; terminados: EspacioExp[]; servicios: EspacioServicio[]; packs?: EspacioPack[];
}) {
  const [lang, setLang] = useState<Lang>((esLangSoportada(idioma) ? idioma : "es") as Lang);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [packId, setPackId] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);
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
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* privado */ }
  }

  const nombreServicio = (id: string | null, original: string) => (id ? servicioLabel(id, original, lang) : original);
  // Un pack puede citar servicios que el despacho borró después: solo cuentan los vivos.
  const svDe = (ids: string[]) => ids.filter((id) => servicios.some((sv) => sv.id === id));
  const packSel = packs.find((pk) => pk.id === packId) ?? null;
  const enPack = (id: string) => svDe(packSel?.servicioIds ?? []).includes(id);
  // Lo que se pide: servicios del pack + los marcados aparte, en orden de catálogo.
  const pedido = servicios.filter((s) => enPack(s.id) || sel.has(s.id)).map((s) => s.id);

  function toggle(id: string) {
    if (enPack(id)) return; // ya viene en el pack: marcarlo no cambiaría nada
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    setError(null);
  }

  async function solicitar() {
    if (!pedido.length || estado !== "idle") return;
    setEstado("enviando");
    setError(null);
    try {
      const res = await fetch("/api/espacio/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `pack` va como ID: el % lo lee el servidor del catálogo del despacho.
        body: JSON.stringify({ token, servicios: pedido, ...(packId ? { pack: packId } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.codigo === "ya_en_curso") throw new Error(t("esp.yaEnCurso", { servicio: nombreServicio(d.servicio ?? null, d.servicioLabel ?? "") }));
        throw new Error(d.error ?? t("esp.error"));
      }
      setEstado("ok");
      window.location.href = d.url; // directo a /j para subir documentos
    } catch (e) {
      setEstado("idle");
      setError(e instanceof Error ? e.message : t("esp.error"));
    }
  }

  // Carrito = servicios del pack + los marcados aparte, sin duplicados y en orden
  // de catálogo (el primero será el principal del expediente).
  const seleccion = servicios.filter((s) => pedido.includes(s.id));
  // Si algún servicio elegido es «precio a consultar», un total parcial mentiría.
  const totalOculto = seleccion.some((s) => s.precioOculto);
  // El descuento del pack se aplica al PEDIDO entero: es lo que el servidor guarda
  // en el expediente, así que pantalla y factura no pueden divergir.
  const bruto = seleccion.reduce((sum, s) => sum + s.precio, 0);
  const total = totalOculto ? 0 : (packSel ? packRebajado(bruto, packSel) : bruto);

  // Elegir un pack NO marca sus servicios (pedido de Matthias): es UNA elección,
  // no un atajo que rellena casillas. UNO a la vez — dos packs se solaparían.
  // Lo que se pide = servicios del pack + los marcados aparte.
  const packDentro = (pk: EspacioPack) => packId === pk.id;
  function togglePack(pk: EspacioPack) {
    if (!svDe(pk.servicioIds).length) return;
    setPackId(packId === pk.id ? null : pk.id);
    setError(null);
  }

  const Item = ({ e }: { e: EspacioExp }) => {
    // El nombre del trámite ocupa su PROPIA línea y puede envolver: en móviles de 320 px
    // competía con el chip y el «Ver →» y se cortaba («Nationalité espagno…»), justo el
    // dato que el cliente necesita leer. El chip baja a la línea de meta.
    const cuerpo = (
      <>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            {nombreServicio(e.servicioId, e.label)}
            {e.extras.length > 0 && <span className="font-normal text-slate-500"> + {e.extras.map((x) => nombreServicio(x.id, x.label)).join(" + ")}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            {e.referencia && <span className="font-mono">{e.referencia}</span>}
            {e.fecha && <span>{e.fecha}</span>}
            <span className={`rounded-full px-2 py-0.5 font-semibold ${
              e.enCurso ? "bg-aproba-100 text-aproba-700" : e.denegado ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
            }`}>
              {e.enCurso ? t("esp.encurso") : e.denegado ? t("esp.chipDenegado") : t("esp.chipTerminado")}
            </span>
          </div>
        </div>
        {e.url && <span className="shrink-0 self-center text-sm font-semibold text-aproba-700">{t("esp.ver")} →</span>}
      </>
    );
    return e.url ? (
      <a href={e.url} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-aproba-400">{cuerpo}</a>
    ) : (
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">{cuerpo}</div>
    );
  };

  return (
    <div className="min-h-screen bg-cream-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        {/* Cabecera: gestoría + idioma */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-aproba-700">{gestoria}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">
              {nombre ? `${t("esp.titulo")} · ${nombre.split(" ")[0]}` : t("esp.titulo")}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("esp.subtitulo", { gestoria })}</p>
          </div>
          <select
            value={lang}
            onChange={(e) => elegirLang(e.target.value as Lang)}
            aria-label={t("lang.selectLabel")}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-aproba-600"
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
          </select>
        </div>

        {/* En curso */}
        <h2 className="mt-7 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("esp.encurso")} ({enCurso.length})</h2>
        <div className="mt-2 space-y-2">
          {enCurso.map((e, i) => <Item key={i} e={e} />)}
          {enCurso.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-400">{t("esp.sinTramites")}</p>}
        </div>

        {/* Terminados (incluye el histórico pre-migración) */}
        {terminados.length > 0 && (
          <>
            <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("esp.terminados")} ({terminados.length})</h2>
            <div className="mt-2 space-y-2">
              {terminados.map((e, i) => <Item key={i} e={e} />)}
            </div>
          </>
        )}

        {/* Solicitar un nuevo trámite */}
        {servicios.length > 0 && (
          <div className="mt-8 rounded-2xl border border-aproba-200 bg-white p-5">
            <h2 className="text-base font-bold tracking-tightest text-slate-900">{t("esp.nuevo")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("esp.nuevoDesc")}</p>
            {/* Catálogo: si el despacho puso temas, cada tema es un desplegable PLEGADO
                con SUS packs y SUS servicios dentro. Sin temas → packs y lista, como antes. */}
            {(() => {
              const tarjetaPack = (pk: EspacioPack) => {
                  const dentro = packDentro(pk);
                  return (
                    <button
                      key={pk.id}
                      type="button"
                      aria-pressed={dentro}
                      onClick={() => togglePack(pk)}
                      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${dentro ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      {/* Mismo lenguaje que el portal /j: el verde solo para lo elegido,
                          y un distintivo gris para distinguir un pack de un servicio. */}
                      <span className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("tema.pack")}</span>
                        {packPct(pk) > 0 && !pk.precioOculto && (
                          <span dir="ltr" className="rounded-full bg-aproba-100 px-2 py-0.5 text-[10px] font-bold text-aproba-700">−{fmtPct(packPct(pk))} %</span>
                        )}
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0 text-sm font-bold text-slate-900">{pk.nombre}</span>
                        {/* Precio calculado: suma de los servicios incluidos menos el
                            descuento del pack. Nada que teclear, nada que divergir. */}
                        {(() => {
                          const svs = svDe(pk.servicioIds).map((id) => servicios.find((x) => x.id === id)).filter((x): x is EspacioServicio => Boolean(x));
                          if (pk.precioOculto || svs.some((sv) => sv.precioOculto)) {
                            return <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{t("precio.consultar")}</span>;
                          }
                          const brutoPk = svs.reduce((a, sv) => a + sv.precio, 0);
                          if (brutoPk <= 0) return null;
                          const pct = packPct(pk);
                          return (
                            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-aproba-700">
                              {pct > 0 && <span className="mr-1.5 font-normal text-slate-400 line-through">{fmtEur(brutoPk)}</span>}
                              {fmtEur(packRebajado(brutoPk, pk))}
                            </span>
                          );
                        })()}
                      </div>
                      {pk.desc && <p className="mt-0.5 text-xs text-slate-500">{pk.desc}</p>}
                      {Boolean(pk.porcentaje) && !pk.precioOculto && (
                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                          {pk.porcentajeSobre?.trim() ? t("precio.pctSobre", { pct: fmtPct(pk.porcentaje ?? 0), sobre: pk.porcentajeSobre.trim() }) : `+ ${fmtPct(pk.porcentaje ?? 0)} %`}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-400">{t("esp.packIncluye", { lista: svDe(pk.servicioIds).map((id) => { const sv = servicios.find((x) => x.id === id); return sv ? servicioLabel(sv.id, sv.label, lang) : null; }).filter(Boolean).join(" · ") })}</p>
                    </button>
                  );
              };
              const filaServicio = (s: EspacioServicio) => {
                // Ya incluido en el pack elegido: casilla marcada pero inerte — pulsarla
                // no cambiaría ni el pedido ni el precio.
                const incluido = enPack(s.id);
                return (
                <label key={s.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${incluido ? "border-slate-200 bg-slate-50" : `cursor-pointer ${sel.has(s.id) ? "border-aproba-600 bg-aproba-50" : "border-slate-200 hover:border-slate-300"}`}`}>
                  <input type="checkbox" checked={sel.has(s.id)} disabled={incluido} onChange={() => toggle(s.id)} className="h-4 w-4 accent-aproba-600 disabled:opacity-40" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {servicioLabel(s.id, s.label, lang)}
                    {/* En su PROPIA línea: en línea con el nombre se parte en dos a 375 px. */}
                    {incluido && <span className="mt-1 block"><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("sel.enPack")}</span></span>}
                    {Boolean(s.porcentaje) && !s.precioOculto && (
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        {s.porcentajeSobre?.trim() ? t("precio.pctSobre", { pct: fmtPct(s.porcentaje ?? 0), sobre: s.porcentajeSobre.trim() }) : `+ ${fmtPct(s.porcentaje ?? 0)} %`}
                      </span>
                    )}
                  </span>
                  {s.precioOculto
                    ? <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{t("precio.consultar")}</span>
                    : s.precio > 0 && <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-slate-600">{fmtEur(s.precio)}</span>}
                </label>
              );
              };
              // Pack sin ningún servicio vivo = tarjeta que no se puede pedir: fuera.
              const packsVivos = packs.filter((pk) => svDe(pk.servicioIds).length > 0);
              const gruposSrv = agruparPorTema(servicios);
              const gruposPack = agruparPorTema(packsVivos);
              const conTema = [...gruposSrv, ...gruposPack].some((g) => g.clave);
              if (!conTema) {
                return (
                  <>
                    {packsVivos.length > 0 && <div className="mt-3 space-y-2">{packsVivos.map(tarjetaPack)}</div>}
                    <div className="mt-3 space-y-2">{servicios.map(filaServicio)}</div>
                  </>
                );
              }
              // Orden de los temas: el del catálogo de servicios; los temas que solo
              // existen en packs se añaden después. «Sin tema» siempre al final.
              const claves: string[] = [];
              for (const g of [...gruposSrv, ...gruposPack]) if (g.clave && !claves.includes(g.clave)) claves.push(g.clave);
              const tituloDe = (c: string) => [...gruposSrv, ...gruposPack].find((g) => g.clave === c)?.titulo || "";
              const sueltos = { packs: packsVivos.filter((p) => !normTema(p.categoria)), servicios: servicios.filter((x) => !normTema(x.categoria)) };
              return (
                <div className="mt-3 space-y-2">
                  {claves.map((c) => {
                    const ps = packsVivos.filter((p) => normTema(p.categoria) === c);
                    const ss = servicios.filter((x) => normTema(x.categoria) === c);
                    const n = ps.length + ss.length;
                    return (
                      <TemaPlegable key={c} titulo={tituloDe(c)} resumen={n === 1 ? t("tema.unTramite") : t("tema.nTramites", { n })}>
                        {ps.map(tarjetaPack)}
                        {ss.map(filaServicio)}
                      </TemaPlegable>
                    );
                  })}
                  {(sueltos.packs.length > 0 || sueltos.servicios.length > 0) && (
                    <TemaPlegable
                      titulo={t("tema.otros")}
                      resumen={sueltos.packs.length + sueltos.servicios.length === 1 ? t("tema.unTramite") : t("tema.nTramites", { n: sueltos.packs.length + sueltos.servicios.length })}
                    >
                      {sueltos.packs.map(tarjetaPack)}
                      {sueltos.servicios.map(filaServicio)}
                    </TemaPlegable>
                  )}
                </div>
              );
            })()}
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {estado === "ok" ? (
              <p className="mt-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm font-medium text-aproba-700">{t("esp.redirigiendo")}</p>
            ) : (
              <button
                type="button"
                onClick={solicitar}
                disabled={!pedido.length || estado !== "idle"}
                className="mt-4 w-full rounded-xl bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                {estado === "enviando" ? t("esp.enviando") : `${t("esp.solicitar")}${total > 0 ? ` · ${fmtEur(total)}` : ""}`}
              </button>
            )}
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-1 text-xs text-slate-400">{t("header.con")} <AprobaMark size={13} /> aproba</p>
      </div>
    </div>
  );
}
