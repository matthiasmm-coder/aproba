"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Caveat, Dancing_Script, Great_Vibes } from "next/font/google";
import { LANGS, detectarLang, esLangSoportada, esRTL, makeT, type Lang } from "@/lib/portal-i18n";
import type { SobrePublico } from "@/lib/firma/publico";
import type { DocFirmable } from "@/lib/firma/sobre";
import { PadFirma, type PadFirmaHandle } from "@/components/firma/pad-firma";
import dynamic from "next/dynamic";
// pdf.js (y su worker) solo en el navegador: el servidor no lo necesita ni sabe resolverlo.
const VisorPdf = dynamic(() => import("@/components/firma/visor-pdf").then((m) => m.VisorPdf), { ssr: false });

// LA PÁGINA DE FIRMA del cliente (lib/firma): revisar cada documento → firmar una vez (a mano
// en pantalla o escribiendo el nombre) → confirmar con el código del email → hecho, con la copia
// firmada. En el idioma del cliente, a la medida del móvil, con la marca del despacho.

const dancing = Dancing_Script({ subsets: ["latin", "latin-ext"], weight: "600", display: "swap" });
const caveat = Caveat({ subsets: ["latin", "latin-ext"], weight: "600", display: "swap" });
const vibes = Great_Vibes({ subsets: ["latin", "latin-ext"], weight: "400", display: "swap" });
const ESTILOS = [dancing, caveat, vibes];
const TINTA = "#1a2b6d";

type Fase = "revisar" | "firmar" | "codigo" | "hecho";
type Metodo = "dibujada" | "escrita";

async function pngDeTexto(texto: string, familia: string): Promise<string | null> {
  const txt = texto.trim();
  if (!txt) return null;
  const size = 120;
  try { await document.fonts.load(`${size}px ${familia}`, txt); } catch { /* fuente del sistema */ }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d"); if (!ctx) return null;
  ctx.font = `${size}px ${familia}`;
  const w = Math.ceil(ctx.measureText(txt).width + size * 0.7);
  c.width = Math.min(w, 2400); c.height = Math.ceil(size * 1.7);
  ctx.font = `${size}px ${familia}`; ctx.fillStyle = TINTA; ctx.textBaseline = "middle";
  ctx.fillText(txt, size * 0.35, c.height / 2);
  return c.toDataURL("image/png");
}

function Icono({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const I_DOC = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4";
const I_OK = "m5 12 5 5L20 7";
const I_CANDADO = "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z";
const I_FLECHA = "m9 6 6 6-6 6";
const I_ATRAS = "m15 6-6 6 6 6";
const I_BAJAR = "M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2";

export function FirmaCliente({ token, inicial }: { token: string; inicial: SobrePublico | null }) {
  const [lang, setLang] = useState<Lang>(() => (inicial && esLangSoportada(inicial.idioma) ? inicial.idioma as Lang : "es"));
  useEffect(() => { if (!inicial) setLang(detectarLang()); }, [inicial]);
  const t = useMemo(() => makeT(lang), [lang]);
  const [sobre, setSobre] = useState<SobrePublico | null>(inicial);
  const [fase, setFase] = useState<Fase>(inicial?.estado === "firmado" ? "hecho" : "revisar");
  const [revisados, setRevisados] = useState<Set<DocFirmable>>(new Set());
  const [visor, setVisor] = useState<DocFirmable | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("dibujada");
  const [padVacio, setPadVacio] = useState(true);
  const [estilo, setEstilo] = useState(0);
  const [nombre, setNombre] = useState(() => (inicial && !inicial.firmante.esEmpresa ? inicial.firmante.nombre : ""));
  const [acepta, setAcepta] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [destino, setDestino] = useState(inicial?.firmante.email ?? "");
  const [espera, setEspera] = useState(0);
  const [ocupado, setOcupado] = useState<"" | "codigo" | "firmar">("");
  const [error, setError] = useState("");
  const firmaPng = useRef<string | null>(null);
  const pad = useRef<PadFirmaHandle>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  // La apertura queda en las pruebas desde el navegador (los robots que abren enlaces de correo
  // no ejecutan JavaScript): así «abierto» es una persona, no un escáner.
  useEffect(() => {
    fetch(`/api/firma/${token}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((s) => { if (s) setSobre(s); }).catch(() => {});
  }, [token]);
  useEffect(() => {
    if (espera <= 0) return;
    const id = window.setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [espera]);
  useEffect(() => {
    document.documentElement.lang = lang;
    // La misma clave que el portal: el aviso de cookies (y el portal) hablan el mismo idioma.
    try { window.localStorage.setItem("aproba.portal.lang", lang); } catch { /* modo privado */ }
  }, [lang]);

  const gestoria = sobre?.despacho.nombre || "—";
  const docs = sobre?.documentos ?? [];
  const todoRevisado = docs.length > 0 && docs.every((d) => revisados.has(d.doc));
  const dir = esRTL(lang) ? "rtl" : "ltr";
  const pdfUrl = (doc: DocFirmable, firmado = false, descargar = false) => `/api/firma/${token}/pdf?doc=${doc}${firmado ? "&firmado=1" : ""}${descargar ? "&descargar=1" : ""}`;
  const errorDe = (e: string, extra?: { restantes?: number; reenvioEn?: number }) => ({
    codigo: t("firmaE.err.codigo", { n: extra?.restantes ?? 0 }), codigo_caducado: t("firmaE.err.caducado"), intentos: t("firmaE.err.intentos"),
    limite: t("firmaE.err.limite", { gestoria }), envio: t("firmaE.err.envio"), caducado: t("firmaE.caducado", { gestoria }),
    anulado: t("firmaE.anulado", { gestoria }),
  } as Record<string, string>)[e] ?? t("firmaE.err.general");

  const pedirCodigo = useCallback(async () => {
    setOcupado("codigo"); setError("");
    try {
      const r = await fetch(`/api/firma/${token}/codigo`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setDestino(j.destino ?? destino); setEspera(j.reenvioEn ?? 30); setFase("codigo"); window.setTimeout(() => codigoRef.current?.focus(), 80); return; }
      if (j.error === "espera") { setEspera(j.reenvioEn ?? 30); setFase("codigo"); return; }
      if (j.error === "firmado") { setFase("hecho"); return; }
      setError(errorDe(j.error));
    } catch { setError(t("firmaE.err.general")); } finally { setOcupado(""); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, destino, t]);

  const continuar = async () => {
    setError("");
    let png: string | null;
    if (metodo === "dibujada") png = pad.current?.png() ?? null;
    else png = await pngDeTexto(nombre, ESTILOS[estilo].style.fontFamily);
    if (!png) { setError(t("firmaE.faltaFirma")); return; }
    if (nombre.trim().length < 3) { setError(t("firmaE.faltaNombre")); return; }
    if (!acepta) { setError(t("firmaE.faltaAcepto")); return; }
    firmaPng.current = png;
    await pedirCodigo();
  };

  const firmar = async (cod = codigo) => {
    if (ocupado || !/^\d{6}$/.test(cod)) return;
    setOcupado("firmar"); setError("");
    try {
      const r = await fetch(`/api/firma/${token}/firmar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: cod, firma: firmaPng.current, metodo, nombre: nombre.trim(), acepta }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setSobre((s) => (s ? { ...s, estado: "firmado", firmadoAt: j.firmadoAt, documentos: s.documentos.map((d) => ({ ...d, firmado: true })) } : s));
        setFase("hecho");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (j.error === "firmado") { setFase("hecho"); return; }
      setError(errorDe(j.error, j));
      if (j.error === "codigo") { setCodigo(""); codigoRef.current?.focus(); }
    } catch { setError(t("firmaE.err.general")); } finally { setOcupado(""); }
  };

  // ── Pantallas sin firma posible ──
  const aviso = (texto: string) => (
    <Marco t={t} lang={lang} setLang={setLang} dir={dir} sobre={sobre} gestoria={gestoria}>
      <div className="mx-auto mt-10 max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/70">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Icono d="M12 8v5M12 16.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" className="h-7 w-7" /></div>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-700">{texto}</p>
      </div>
    </Marco>
  );
  if (!sobre) return aviso(t("firmaE.noValido"));
  if (sobre.estado === "anulado") return aviso(t("firmaE.anulado", { gestoria }));
  if (sobre.estado === "caducado") return aviso(t("firmaE.caducado", { gestoria }));

  const paso = fase === "revisar" ? 0 : fase === "firmar" ? 1 : fase === "codigo" ? 2 : 3;
  const intro = sobre.firmante.esEmpresa ? t("firmaE.introEmpresa", { gestoria, empresa: sobre.firmante.nombre })
    : docs.length === 1 ? t("firmaE.introUno", { gestoria }) : t("firmaE.introVarios", { gestoria, n: docs.length });

  return (
    <Marco t={t} lang={lang} setLang={setLang} dir={dir} sobre={sobre} gestoria={gestoria}>
      {fase !== "hecho" && <Pasos t={t} paso={paso} />}

      {/* ── 1 · REVISAR ── */}
      {fase === "revisar" && (
        <section className="pb-32">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{t("firmaE.titulo")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{intro}</p>
          <ul className="mt-6 space-y-3">
            {docs.map((d) => {
              const ok = revisados.has(d.doc);
              return (
                <li key={d.doc}>
                  <button type="button" onClick={() => setVisor(d.doc)} aria-label={`${t(`firmaE.doc.${d.doc}`)} · ${ok ? t("firmaE.revisado") : t("firmaE.porRevisar")}`} className={`group flex w-full items-start gap-3.5 rounded-2xl border bg-white p-4 text-start shadow-sm transition hover:shadow-md ${ok ? "border-aproba-200" : "border-slate-200 hover:border-slate-300"}`}>
                    <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ok ? "bg-aproba-50 text-aproba-600" : "bg-slate-100 text-slate-500"}`}><Icono d={ok ? I_OK : I_DOC} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-slate-900">{t(`firmaE.doc.${d.doc}`)}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-slate-500">{t(`firmaE.explica.${d.doc}`, { gestoria })}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${ok ? "bg-aproba-50 text-aproba-700" : "bg-amber-50 text-amber-700"}`}>{ok ? `✓ ${t("firmaE.revisado")}` : t("firmaE.porRevisar")}</span>
                        <span className="text-slate-400">{d.paginas === 1 ? t("firmaE.pagina1") : t("firmaE.paginas", { n: d.paginas })}</span>
                      </span>
                    </span>
                    <span className="mt-3 text-slate-300 transition group-hover:text-slate-500 rtl:rotate-180"><Icono d={I_FLECHA} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
          {lang !== "es" && <p className="mt-4 text-xs leading-relaxed text-slate-400">{t("firmaE.idiomaDoc")}</p>}
          <BarraAccion>
            {!todoRevisado && <p className="mb-2 text-center text-xs text-slate-500">{t("firmaE.revisaAntes")}</p>}
            <Boton onClick={() => { setFase("firmar"); window.scrollTo({ top: 0 }); }} disabled={!todoRevisado}>{t("firmaE.irAFirmar")}</Boton>
          </BarraAccion>
        </section>
      )}

      {/* ── 2 · FIRMAR ── */}
      {fase === "firmar" && (
        <section className="pb-36">
          <button type="button" onClick={() => setFase("revisar")} className="-ms-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <span className="rtl:rotate-180"><Icono d={I_ATRAS} className="h-4 w-4" /></span>{t("firmaE.volverRevisar")}
          </button>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{t("firmaE.tuFirma")}</h1>

          <div role="tablist" className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {(["dibujada", "escrita"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={metodo === m} type="button" onClick={() => { setMetodo(m); setError(""); }}
                className={`rounded-lg py-2 transition ${metodo === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                {m === "dibujada" ? t("firmaE.dibujar") : t("firmaE.escribir")}
              </button>
            ))}
          </div>

          {/* Las dos pestañas quedan montadas: cambiar de una a otra no borra la firma dibujada. */}
          <div className={metodo === "dibujada" ? "mt-4" : "hidden"} dir="ltr">
            <PadFirma ref={pad} placeholder={t("firmaE.firmaAqui")} onCambio={setPadVacio} />
            <div className="mt-2 flex justify-end gap-1 text-sm">
              <button type="button" onClick={() => pad.current?.deshacer()} disabled={padVacio} className="rounded-lg px-3 py-1.5 font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-30">{t("firmaE.deshacer")}</button>
              <button type="button" onClick={() => pad.current?.borrar()} disabled={padVacio} className="rounded-lg px-3 py-1.5 font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-30">{t("firmaE.borrar")}</button>
            </div>
          </div>
          {metodo === "escrita" && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("firmaE.estilo")}</p>
              <div className="grid gap-2" dir="ltr">
                {ESTILOS.map((f, i) => (
                  <button key={i} type="button" onClick={() => setEstilo(i)} aria-pressed={estilo === i}
                    className={`flex h-20 items-center overflow-hidden rounded-2xl border-2 bg-white px-5 text-left transition ${estilo === i ? "border-aproba-500 ring-4 ring-aproba-100" : "border-slate-200 hover:border-slate-300"}`}>
                    <span className={`${f.className} truncate leading-none`} style={{ color: TINTA, fontSize: nombre.trim().length > 18 ? 24 : nombre.trim().length > 13 ? 29 : 34 }}>{nombre.trim() || "Firma"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{sobre.firmante.esEmpresa ? t("firmaE.nombreEmpresa", { empresa: sobre.firmante.nombre }) : t("firmaE.nombre")}</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[16px] text-slate-900 outline-none transition focus:border-aproba-500 focus:ring-4 focus:ring-aproba-100" />
          </label>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
            <span className="text-sm leading-relaxed text-slate-700">{t("firmaE.acepto")}</span>
          </label>

          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <BarraAccion>
            <Boton onClick={continuar} cargando={ocupado === "codigo"} textoCargando={t("firmaE.enviando")}>{t("firmaE.continuar")}</Boton>
          </BarraAccion>
        </section>
      )}

      {/* ── 3 · CONFIRMAR CON EL CÓDIGO ── */}
      {fase === "codigo" && (
        <section className="pb-36">
          <button type="button" onClick={() => { setFase("firmar"); setError(""); }} className="-ms-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <span className="rtl:rotate-180"><Icono d={I_ATRAS} className="h-4 w-4" /></span>{t("firmaE.tuFirma")}
          </button>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-aproba-50 text-aproba-600"><Icono d="M4 6h16v12H4zM4 7l8 6 8-6" className="h-7 w-7" /></div>
          <h1 className="mt-4 text-center text-[26px] font-bold tracking-tight text-slate-900">{t("firmaE.confirma")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-[15px] leading-relaxed text-slate-600" dir="auto">{t("firmaE.codigoEnviado", { email: destino })}</p>

          <label className="mx-auto mt-6 block max-w-xs">
            <span className="sr-only">{t("firmaE.codigo")}</span>
            <input ref={codigoRef} value={codigo} dir="ltr"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCodigo(v); setError(""); if (v.length === 6) void firmar(v); }}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="······"
              className="w-full rounded-2xl border-2 border-slate-300 bg-white py-4 text-center font-mono text-[32px] font-bold tracking-[0.45em] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-aproba-500 focus:ring-4 focus:ring-aproba-100" />
          </label>
          <div className="mt-4 text-center text-sm">
            {espera > 0 ? <span className="text-slate-400">{t("firmaE.reenviarEn", { s: espera })}</span>
              : <button type="button" onClick={pedirCodigo} disabled={ocupado !== ""} className="font-semibold text-aproba-700 hover:underline disabled:opacity-40">{ocupado === "codigo" ? t("firmaE.enviando") : t("firmaE.reenviar")}</button>}
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">{t("firmaE.revisaSpam")}</p>
          {error && <p role="alert" className="mx-auto mt-4 max-w-sm rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>}
          <BarraAccion>
            <Boton onClick={() => firmar()} disabled={codigo.length !== 6} cargando={ocupado === "firmar"} textoCargando={t("firmaE.firmando")}>
              {docs.length === 1 ? t("firmaE.firmarUno") : t("firmaE.firmar")}
            </Boton>
          </BarraAccion>
        </section>
      )}

      {/* ── 4 · HECHO ── */}
      {fase === "hecho" && (
        <section className="pb-16 pt-6 text-center">
          <div className="firma-ok mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-aproba-600 text-white shadow-lg shadow-aproba-600/25">
            <Icono d={I_OK} className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-[28px] font-bold tracking-tight text-slate-900">{docs.length === 1 ? t("firmaE.hechoUno") : t("firmaE.hecho")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-slate-600" dir="auto">{t("firmaE.hechoTexto", { gestoria, email: destino || sobre.firmante.email })}</p>
          <ul className="mx-auto mt-8 max-w-md space-y-2.5 text-start">
            {docs.map((d) => (
              <li key={d.doc} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aproba-50 text-aproba-600"><Icono d={I_OK} /></span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">{t(`firmaE.doc.${d.doc}`)}</span>
                <a href={pdfUrl(d.doc, true, true)} aria-label={`${t("firmaE.descargarFirmado")} · ${t(`firmaE.doc.${d.doc}`)}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
                  <Icono d={I_BAJAR} className="h-4 w-4" /><span className="hidden sm:inline">{t("firmaE.descargarFirmado")}</span><span className="sm:hidden">PDF</span>
                </a>
              </li>
            ))}
          </ul>
          {sobre.portalToken && (
            <a href={`/s/${sobre.portalToken}`} className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              {t("firmaE.volver")}<span className="rtl:rotate-180"><Icono d={I_FLECHA} className="h-4 w-4" /></span>
            </a>
          )}
        </section>
      )}

      {visor && (() => {
        const lista = docs.map((d) => d.doc);
        const pendiente = lista.find((x) => x !== visor && !revisados.has(x));
        return (
          <VisorPdf key={visor} url={pdfUrl(visor)} titulo={t(`firmaE.doc.${visor}`)} t={t} descargarUrl={pdfUrl(visor, false, true)}
            textoListo={t("firmaE.visor.listo")}
            onCerrar={() => setVisor(null)}
            onListo={() => { setRevisados((s) => new Set(s).add(visor)); setVisor(pendiente ?? null); }} />
        );
      })()}
    </Marco>
  );
}

// ── Piezas de la página ──

function Marco({ children, t, lang, setLang, dir, sobre, gestoria }: {
  children: React.ReactNode; t: ReturnType<typeof makeT>; lang: Lang; setLang: (l: Lang) => void; dir: "rtl" | "ltr"; sobre: SobrePublico | null; gestoria: string;
}) {
  const ini = gestoria.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "·";
  return (
    <div dir={dir} className="min-h-[100dvh] bg-[#f6f7f4]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          {sobre?.despacho.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={sobre.despacho.logoUrl} alt={gestoria} className="h-8 w-auto max-w-[120px] object-contain" />
            : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">{ini}</span>}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{gestoria}</p>
          <label className="relative">
            <span className="sr-only">Idioma</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pe-7 ps-2.5 text-[16px] text-slate-700 outline-none focus:border-aproba-500 sm:text-sm">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
            </select>
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-slate-400"><Icono d="m6 9 6 6 6-6" className="h-3.5 w-3.5" /></span>
          </label>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-5">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200/70">
          <Icono d={I_CANDADO} className="h-3.5 w-3.5 text-aproba-600" />{t("firmaE.seguro")}
        </p>
        {children}
        <footer className="mt-10 border-t border-slate-200 py-6 text-center text-[11px] leading-relaxed text-slate-400">
          {t("firmaE.pie", { gestoria })}
          <span className="mt-1 block font-semibold text-slate-400" dir="ltr">Aproba</span>
        </footer>
      </main>
    </div>
  );
}

function Pasos({ t, paso }: { t: ReturnType<typeof makeT>; paso: number }) {
  const nombres = [t("firmaE.paso.revisar"), t("firmaE.paso.firmar"), t("firmaE.paso.confirmar")];
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2">
      {nombres.map((n, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <span className={`h-1.5 rounded-full transition-colors ${i <= paso ? "bg-aproba-600" : "bg-slate-200"}`} />
          <span className={`text-[11px] font-semibold ${i === paso ? "text-aproba-700" : i < paso ? "text-slate-500" : "text-slate-400"}`}>{i < paso ? "✓ " : ""}{n}</span>
        </li>
      ))}
    </ol>
  );
}

function BarraAccion({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto max-w-xl">{children}</div>
    </div>
  );
}

function Boton({ children, onClick, disabled, cargando, textoCargando }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; cargando?: boolean; textoCargando?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || cargando}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-aproba-600 px-4 py-4 text-[16px] font-semibold text-white shadow-sm shadow-aproba-600/20 transition hover:bg-aproba-700 active:scale-[0.99] disabled:bg-slate-300 disabled:shadow-none">
      {cargando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {cargando ? textoCargando : children}
    </button>
  );
}
