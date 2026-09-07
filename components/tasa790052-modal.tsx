"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// Tasa 790-052 (autorizaciones de residencia — Delegaciones y Subdelegaciones del Gobierno).
// Misma factura que el modal de la 012: datos pre-rellenados y editables, línea de tasa a
// elegir, captcha de la Sede y descarga del PDF oficial con código de barras. Dos pasos de
// red: /iniciar (prefill, sin red) y /preparar (sesión + impreso + captcha para la provincia
// y el reglamento elegidos), luego /descargar.

type Epigrafe = { id: string; codigo: string; label: string; importe: string; seccion: string; porDia?: string };
type Prep = { sid: string; idProvincia: string; reglamento: string; justificante: string; epigrafes: Epigrafe[]; nacionalidades: string[]; provinciasDom: string[]; captcha: string };
type Inicio = { prefill: Record<string, string> & { nacionalidadCandidatas?: string[] }; reglamentos: { value: string; label: string }[]; provincias: { id: string; nombre: string }[]; tiposVia: string[] };
type Campos = Record<string, string>;

const CAMPOS: { k: string; label: string; w: string; req?: boolean; max?: number }[] = [
  { k: "numId", label: "NIE / Pasaporte", w: "third", req: true },
  { k: "apellido1", label: "Primer apellido", w: "third", req: true },
  { k: "apellido2", label: "Segundo apellido", w: "third" },
  { k: "nombre", label: "Nombre", w: "third", req: true, max: 20 },
  { k: "via", label: "Nombre de la vía", w: "third", req: true },
  { k: "numero", label: "Número", w: "sixth", req: true, max: 3 },
  { k: "piso", label: "Piso", w: "sixth", max: 3 },
  { k: "municipio", label: "Municipio", w: "third", req: true },
  { k: "cp", label: "C.P.", w: "sixth", req: true, max: 5 },
  { k: "telefono", label: "Teléfono (9 cifras)", w: "third", max: 9 },
  { k: "ciudad", label: "Localidad de firma", w: "third", req: true },
  { k: "numExpediente", label: "Nº de expediente (si lo hay)", w: "third", max: 15 },
];
const W: Record<string, string> = { half: "sm:col-span-3", third: "sm:col-span-2", sixth: "sm:col-span-1" };
const SEL = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm";

// clienteId (expediente familiar): la tasa es NOMINATIVA, una por solicitante.
// expedienteId opcional: desde la ficha del cliente se genera sin archivar.
export function Tasa790052Modal({ expedienteId, clienteId, etiqueta }: { expedienteId?: string; clienteId?: string; etiqueta?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useScrollBloqueado(open);
  const [cargando, setCargando] = useState(false);
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [campos, setCampos] = useState<Campos>({});
  const [epigrafeId, setEpigrafeId] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function preparar(idProvincia: string, reglamento: string, base?: Inicio) {
    setCargando(true); setError(null); setFallback(null); setCaptcha("");
    const r = await fetch("/api/tasa790052/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idProvincia, reglamento }) });
    const j = await r.json().catch(() => ({}));
    setCargando(false);
    if (!r.ok) { setError(j.error ?? t("No se pudo abrir el generador oficial.")); setFallback(j.fallback ?? null); setPrep(null); return; }
    const p = j as Prep;
    setPrep(p);
    // Nacionalidad y provincia del domicilio: solo valores que existan en los desplegables oficiales.
    const ini = base ?? inicio;
    setCampos((c) => {
      const nac = c.nacionalidad && p.nacionalidades.includes(c.nacionalidad) ? c.nacionalidad
        : (ini?.prefill.nacionalidadCandidatas ?? []).find((n) => p.nacionalidades.includes(n)) ?? "";
      const prov = c.provinciaDom && p.provinciasDom.includes(c.provinciaDom) ? c.provinciaDom
        : p.provinciasDom.find((n) => n === (ini?.prefill.provinciaDom ?? "")) ?? "";
      return { ...c, nacionalidad: nac, provinciaDom: prov };
    });
  }

  async function iniciar() {
    setOpen(true); setInicio(null); setPrep(null); setCargando(true); setError(null); setFallback(null); setEpigrafeId(""); setCaptcha("");
    const r = await fetch("/api/tasa790052/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expedienteId, clienteId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setCargando(false); setError(j.error ?? t("No se pudieron cargar los datos.")); return; }
    const ini = j as Inicio;
    setInicio(ini);
    const { nacionalidadCandidatas: _omit, ...pre } = ini.prefill; void _omit;
    setCampos({ ...pre, reglamento: "RD1155/2024", idProvincia: ini.prefill.idProvincia ?? "28" });
    await preparar(ini.prefill.idProvincia ?? "28", "RD1155/2024", ini);
  }

  const set = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const epigrafe = prep?.epigrafes.find((e) => e.id === epigrafeId);
  const faltan = CAMPOS.filter((f) => f.req && !(campos[f.k] ?? "").trim()).map((f) => t(f.label));
  if (!(campos.tipoVia ?? "").trim()) faltan.push(t("Tipo de vía"));
  if (!(campos.nacionalidad ?? "").trim()) faltan.push(t("Nacionalidad"));
  if (!(campos.provinciaDom ?? "").trim()) faltan.push(t("Provincia"));
  const fechasFaltan = Boolean(epigrafe?.porDia) && (!(campos.fechaEfectos ?? "") || !(campos.fechaCaducidad ?? ""));
  const cpMal = (campos.cp ?? "").trim() !== "" && !/^\d{5}$/.test((campos.cp ?? "").trim());
  const importe = (() => {
    if (!epigrafe) return "";
    const n = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
    let total = n(epigrafe.importe);
    if (epigrafe.porDia && campos.fechaEfectos && campos.fechaCaducidad) {
      const d = Math.round((new Date(campos.fechaCaducidad).getTime() - new Date(campos.fechaEfectos).getTime()) / 864e5) + 1;
      if (d > 0) total += n(epigrafe.porDia) * d;
    }
    return total.toFixed(2).replace(".", ",");
  })();

  async function descargar() {
    if (!prep || !epigrafe) return;
    setEnviando(true); setError(null);
    const body = { expedienteId, clienteId, sid: prep.sid, idProvincia: prep.idProvincia, reglamento: prep.reglamento, justificante: prep.justificante, epigrafe, campos: { ...campos, captcha } };
    const r = await fetch("/api/tasa790052/descargar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.headers.get("content-type")?.includes("pdf")) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `tasa-790-052-${expedienteId ?? clienteId ?? "cliente"}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setEnviando(false); setOpen(false);
      return;
    }
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    setError(j.error ?? t("No se pudo generar la tasa."));
    // El captcha es de un solo uso y el justificante también: se reabre el impreso conservando los datos.
    if (j.captcha) await preparar(prep.idProvincia, prep.reglamento);
  }

  const inp = (k: string, req?: boolean) =>
    `w-full rounded-md border px-2.5 py-1.5 text-[16px] outline-none focus:ring-2 focus:ring-aproba-100 sm:text-sm ${req && !(campos[k] ?? "").trim() ? "border-amber-400 bg-amber-50/40" : "border-slate-300 focus:border-aproba-600"}`;
  const secciones = [...new Set((prep?.epigrafes ?? []).map((e) => e.seccion || t("Otros conceptos")))];

  return (
    <>
      <button onClick={iniciar} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
        {etiqueta ?? t("Tasa 790-052 (residencia)")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={() => !enviando && setOpen(false)}>
          <div className="mt-4 w-full max-w-2xl rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:mt-6 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{t("Tasa 790-052 · Autorizaciones de residencia")}</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">{t("Generamos el impreso oficial (con su número de justificante y código de barras) en la Sede de Administraciones Públicas. Elige la provincia donde se presenta, la línea de tasa y escribe el código de seguridad.")}</p>

            {fallback && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                <p>{error}</p>
                <a href={fallback} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold underline">{t("Comprobar la web oficial →")}</a>
              </div>
            )}

            {inicio && (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Provincia donde se presenta")}</label>
                  <select className={SEL} value={campos.idProvincia ?? ""} disabled={cargando} onChange={(e) => { set("idProvincia", e.target.value); preparar(e.target.value, campos.reglamento ?? "RD1155/2024"); }}>
                    {inicio.provincias.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Reglamento")}</label>
                  <select className={SEL} value={campos.reglamento ?? ""} disabled={cargando} onChange={(e) => { set("reglamento", e.target.value); preparar(campos.idProvincia ?? "28", e.target.value); }}>
                    {inicio.reglamentos.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {cargando && <p className="py-10 text-center text-sm text-slate-500">{t("Abriendo el generador oficial…")}</p>}

            {inicio && prep && !cargando && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  {CAMPOS.slice(0, 4).map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t(f.label)}{f.req && <span className="text-amber-500"> *</span>}</label>
                      <input className={inp(f.k, f.req)} maxLength={f.max} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Nacionalidad")}<span className="text-amber-500"> *</span></label>
                    <select className={SEL} value={campos.nacionalidad ?? ""} onChange={(e) => set("nacionalidad", e.target.value)}>
                      <option value="">—</option>
                      {prep.nacionalidades.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Tipo de vía")}<span className="text-amber-500"> *</span></label>
                    <select className={SEL} value={campos.tipoVia ?? ""} onChange={(e) => set("tipoVia", e.target.value)}>
                      <option value="">—</option>
                      {inicio.tiposVia.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  {CAMPOS.slice(4, 8).map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t(f.label)}{f.req && <span className="text-amber-500"> *</span>}</label>
                      <input className={inp(f.k, f.req)} maxLength={f.max} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Provincia")}<span className="text-amber-500"> *</span></label>
                    <select className={SEL} value={campos.provinciaDom ?? ""} onChange={(e) => set("provinciaDom", e.target.value)}>
                      <option value="">—</option>
                      {prep.provinciasDom.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  {CAMPOS.slice(8).map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t(f.label)}{f.req && <span className="text-amber-500"> *</span>}</label>
                      <input className={inp(f.k, f.req)} maxLength={f.max} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                    </div>
                  ))}
                  <div className="sm:col-span-6">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Línea de tasa")}<span className="text-amber-500"> *</span></label>
                    <select className={`${SEL} ${epigrafeId ? "" : "border-amber-400 bg-amber-50/40"}`} value={epigrafeId} onChange={(e) => setEpigrafeId(e.target.value)}>
                      <option value="" disabled>{t("— Elige la línea de tasa para este trámite —")}</option>
                      {secciones.map((s) => (
                        <optgroup key={s} label={s}>
                          {prep.epigrafes.filter((e) => (e.seccion || t("Otros conceptos")) === s).map((e) => (
                            <option key={e.id} value={e.id}>{e.codigo} · {e.importe} € — {e.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">{t("No se marca ninguna casilla automáticamente: elige tú la línea correcta según el trámite.")}{importe ? ` · ${t("Importe")}: ${importe} €` : ""}</p>
                  </div>
                  {epigrafe?.porDia && (
                    <>
                      <div className="sm:col-span-3">
                        <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Fecha de efectos")}<span className="text-amber-500"> *</span></label>
                        <input type="date" className={inp("fechaEfectos", true)} value={campos.fechaEfectos ?? ""} onChange={(e) => set("fechaEfectos", e.target.value)} />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Fecha de caducidad")}<span className="text-amber-500"> *</span></label>
                        <input type="date" className={inp("fechaCaducidad", true)} value={campos.fechaCaducidad ?? ""} onChange={(e) => set("fechaCaducidad", e.target.value)} />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={prep.captcha} alt={t("Código de seguridad")} className="h-16 w-auto rounded border border-slate-300 bg-white" />
                  <button onClick={() => preparar(prep.idProvincia, prep.reglamento)} title={t("Otro código")} className="mb-1 rounded-md border border-slate-300 bg-white p-2 text-slate-500 hover:text-aproba-700" aria-label={t("Refrescar código")}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                  </button>
                  <div className="min-w-[160px] flex-1">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Código de seguridad")}</label>
                    <input className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-base uppercase tracking-widest outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" maxLength={6} value={captcha} onChange={(e) => setCaptcha(e.target.value.toUpperCase())} />
                  </div>
                </div>

                {error && !fallback && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                {(faltan.length > 0 || !epigrafeId) && <p className="mt-2 text-xs text-amber-600">{t("Faltan datos obligatorios:")} {[...(!epigrafeId ? [t("Línea de tasa")] : []), ...faltan].join(", ")}.</p>}
                {fechasFaltan && <p className="mt-2 text-xs text-amber-600">{t("Esta línea se calcula por días: indica las fechas de efectos y de caducidad.")}</p>}
                {cpMal && <p className="mt-2 text-xs text-amber-600">{t("El código postal debe tener 5 cifras.")}</p>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <a href="https://sede.administracionespublicas.gob.es/pagina/index/directorio/tasa052" target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-slate-600">{t("Abrir en la Sede oficial")}</a>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
                    <button onClick={descargar} disabled={enviando || !captcha.trim() || !epigrafeId || faltan.length > 0 || fechasFaltan || cpMal} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                      {enviando ? t("Generando…") : t("Descargar tasa rellenada")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {!inicio && !cargando && error && !fallback && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
