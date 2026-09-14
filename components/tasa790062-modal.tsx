"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// Tasa 790-062 (autorizaciones de TRABAJO — Delegaciones y Subdelegaciones del Gobierno).
// Misma factura que el modal de la 052 (datos pre-rellenados y editables, línea de tasa a
// elegir, captcha de la Sede, PDF oficial con código de barras), con lo propio de la 062:
// quién PAGA (la empresa que contrata, en cuenta ajena; el trabajador, en cuenta propia) y el
// bloque «Datos del trabajador». Tres pasos de red: /iniciar (prefill, sin red), /preparar
// (sesión + nota aceptada + impreso + captcha) y /descargar. Se duplica el modal de la 052 a
// propósito: los dos impresos divergen en la cabecera y es más seguro que un genérico.

type Epigrafe = { id: string; codigo: string; label: string; importe: string; seccion: string };
type Prep = { sid: string; idProvincia: string; reglamento: string; justificante: string; epigrafes: Epigrafe[]; provinciasDom: string[]; captcha: string };
type Cabecera = Record<string, string>;
type Inicio = {
  prefill: Record<string, string>;
  cabeceras: { empresa: Cabecera | null; trabajador: Cabecera };
  empresaNombre: string | null;
  reglamentos: { value: string; label: string }[];
  provincias: { id: string; nombre: string }[];
  tiposVia: string[];
  provinciasCataluna: string[];
};
type Campos = Record<string, string>;

const CLAVES_CABECERA = ["numId", "apellido1", "apellido2", "nombre", "tipoVia", "via", "numero", "piso", "municipio", "provinciaDom", "cp", "telefono"];
const CAMPOS: { k: string; label: string; w: string; req?: boolean; max?: number }[] = [
  { k: "numId", label: "NIF / NIE", w: "third", req: true, max: 9 },
  { k: "apellido1", label: "Primer apellido o razón social", w: "third", req: true, max: 50 },
  { k: "apellido2", label: "Segundo apellido", w: "third", max: 25 },
  { k: "nombre", label: "Nombre (vacío si es una empresa)", w: "third", max: 20 },
  { k: "via", label: "Nombre de la vía", w: "third", req: true, max: 70 },
  { k: "numero", label: "Número", w: "sixth", req: true, max: 3 },
  { k: "piso", label: "Piso", w: "sixth", max: 3 },
  { k: "municipio", label: "Municipio", w: "third", req: true, max: 70 },
  { k: "cp", label: "C.P.", w: "sixth", req: true, max: 5 },
  { k: "telefono", label: "Teléfono (9 cifras)", w: "third", max: 9 },
  { k: "ciudad", label: "Localidad de firma", w: "third", req: true, max: 40 },
  { k: "numExpediente", label: "Nº de expediente (si lo hay)", w: "third", max: 20 },
];
const TRABAJADOR: { k: string; label: string; w: string }[] = [
  { k: "trabajadorNombre", label: "Apellidos y nombre", w: "half" },
  { k: "trabajadorNacionalidad", label: "Nacionalidad", w: "half" },
  { k: "trabajadorDireccion", label: "Dirección postal completa (en España)", w: "full" },
];
const RENOVACIONES = ["1.3.1", "2.2.1", "4.2.1", "4.2.2"];
const W: Record<string, string> = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2", sixth: "sm:col-span-1" };
const SEL = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm";
const LBL = "mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400";

// clienteId (expediente familiar): la tasa es NOMINATIVA, una por trabajador.
// expedienteId opcional: desde la ficha del cliente se genera sin archivar.
export function Tasa790062Modal({ expedienteId, clienteId, etiqueta }: { expedienteId?: string; clienteId?: string; etiqueta?: string }) {
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
    const r = await fetch("/api/tasa790062/preparar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idProvincia, reglamento }) });
    const j = await r.json().catch(() => ({}));
    setCargando(false);
    if (!r.ok) { setError(j.error ?? t("No se pudo abrir el generador oficial.")); setFallback(j.fallback ?? null); setPrep(null); return; }
    const p = j as Prep;
    setPrep(p);
    // Provincia del domicilio: solo valores que existan en el desplegable oficial.
    const ini = base ?? inicio;
    setCampos((c) => {
      const prov = c.provinciaDom && p.provinciasDom.includes(c.provinciaDom) ? c.provinciaDom
        : p.provinciasDom.find((n) => n === (ini?.prefill.provinciaDom ?? "")) ?? "";
      return { ...c, provinciaDom: prov };
    });
  }

  async function iniciar() {
    setOpen(true); setInicio(null); setPrep(null); setCargando(true); setError(null); setFallback(null); setEpigrafeId(""); setCaptcha("");
    const r = await fetch("/api/tasa790062/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expedienteId, clienteId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setCargando(false); setError(j.error ?? t("No se pudieron cargar los datos.")); return; }
    const ini = j as Inicio;
    setInicio(ini);
    setCampos({ ...ini.prefill, reglamento: "RD1155/2024", idProvincia: ini.prefill.idProvincia ?? "28" });
    await preparar(ini.prefill.idProvincia ?? "28", "RD1155/2024", ini);
  }

  const set = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  // Quién paga: se cambia la cabecera entera (NIF, nombre, domicilio) por la de la empresa o la del trabajador.
  function pagador(quien: "empresa" | "trabajador") {
    const cab = quien === "empresa" ? inicio?.cabeceras.empresa : inicio?.cabeceras.trabajador;
    if (!cab) return;
    setCampos((c) => {
      const n: Campos = { ...c, pagador: quien };
      for (const k of CLAVES_CABECERA) n[k] = cab[k] ?? "";
      if (prep && !prep.provinciasDom.includes(n.provinciaDom)) n.provinciaDom = "";
      return n;
    });
  }

  const epigrafe = prep?.epigrafes.find((e) => e.id === epigrafeId);
  const faltan = CAMPOS.filter((f) => f.req && !(campos[f.k] ?? "").trim()).map((f) => t(f.label));
  if (!(campos.tipoVia ?? "").trim()) faltan.push(t("Tipo de vía"));
  if (!(campos.provinciaDom ?? "").trim()) faltan.push(t("Provincia"));
  for (const f of TRABAJADOR) if (!(campos[f.k] ?? "").trim()) faltan.push(t(f.label));
  const cpMal = (campos.cp ?? "").trim() !== "" && !/^\d{5}$/.test((campos.cp ?? "").trim());
  const importe = epigrafe ? Number(epigrafe.importe.replace(/\./g, "").replace(",", ".")).toFixed(2).replace(".", ",") : "";
  const enCataluna = Boolean(inicio?.provinciasCataluna.includes(campos.idProvincia ?? ""));
  const avisoCataluna = enCataluna && (!epigrafe || !RENOVACIONES.includes(epigrafe.codigo));

  async function descargar() {
    if (!prep || !epigrafe) return;
    setEnviando(true); setError(null);
    const body = { expedienteId, clienteId, sid: prep.sid, idProvincia: prep.idProvincia, reglamento: prep.reglamento, justificante: prep.justificante, epigrafe, campos: { ...campos, captcha } };
    const r = await fetch("/api/tasa790062/descargar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.headers.get("content-type")?.includes("pdf")) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `tasa-790-062-${expedienteId ?? clienteId ?? "cliente"}.pdf`; a.click();
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
  const campo = (f: { k: string; label: string; w: string; req?: boolean; max?: number }) => (
    <div key={f.k} className={W[f.w]}>
      <label className={LBL}>{t(f.label)}{f.req && <span className="text-amber-500"> *</span>}</label>
      <input className={inp(f.k, f.req)} maxLength={f.max} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
    </div>
  );

  return (
    <>
      <button onClick={iniciar} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" /></svg>
        {etiqueta ?? t("Tasa 790-062 (trabajo)")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={() => !enviando && setOpen(false)}>
          <div className="mt-4 w-full max-w-2xl rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:mt-6 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{t("Tasa 790-062 · Autorizaciones de trabajo")}</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">{t("Generamos el impreso oficial (con su número de justificante y código de barras) en la Sede de Administraciones Públicas. Quien paga es el sujeto pasivo: la empresa que contrata (cuenta ajena) o el propio trabajador (cuenta propia). Elige la provincia, la línea de tasa y escribe el código de seguridad.")}</p>

            {fallback && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                <p>{error}</p>
                <a href={fallback} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold underline">{t("Comprobar la web oficial →")}</a>
              </div>
            )}

            {inicio && (
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label className={LBL}>{t("Provincia donde se presenta")}</label>
                  <select className={SEL} value={campos.idProvincia ?? ""} disabled={cargando} onChange={(e) => { set("idProvincia", e.target.value); preparar(e.target.value, campos.reglamento ?? "RD1155/2024"); }}>
                    {inicio.provincias.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={LBL}>{t("Reglamento")}</label>
                  <select className={SEL} value={campos.reglamento ?? ""} disabled={cargando} onChange={(e) => { set("reglamento", e.target.value); preparar(campos.idProvincia ?? "28", e.target.value); }}>
                    {inicio.reglamentos.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            {cargando && <p className="py-10 text-center text-sm text-slate-500">{t("Abriendo el generador oficial…")}</p>}

            {inicio && prep && !cargando && (
              <>
                {inicio.cabeceras.empresa && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{t("Paga la tasa")}</span>
                    <button type="button" onClick={() => pagador("empresa")} className={`rounded-md px-2.5 py-1 text-sm font-medium ${campos.pagador === "empresa" ? "bg-aproba-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300"}`}>{t("La empresa")} · {inicio.empresaNombre}</button>
                    <button type="button" onClick={() => pagador("trabajador")} className={`rounded-md px-2.5 py-1 text-sm font-medium ${campos.pagador === "trabajador" ? "bg-aproba-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300"}`}>{t("El trabajador")}</button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  {CAMPOS.slice(0, 4).map(campo)}
                  <div className="sm:col-span-2">
                    <label className={LBL}>{t("Tipo de vía")}<span className="text-amber-500"> *</span></label>
                    <select className={SEL} value={campos.tipoVia ?? ""} onChange={(e) => set("tipoVia", e.target.value)}>
                      <option value="">—</option>
                      {inicio.tiposVia.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  {CAMPOS.slice(4, 8).map(campo)}
                  <div className="sm:col-span-2">
                    <label className={LBL}>{t("Provincia")}<span className="text-amber-500"> *</span></label>
                    <select className={SEL} value={campos.provinciaDom ?? ""} onChange={(e) => set("provinciaDom", e.target.value)}>
                      <option value="">—</option>
                      {prep.provinciasDom.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  {CAMPOS.slice(8, 10).map(campo)}

                  <div className="sm:col-span-6 mt-1 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("Datos del trabajador")}</p>
                  </div>
                  {TRABAJADOR.map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className={LBL}>{t(f.label)}<span className="text-amber-500"> *</span></label>
                      <input className={inp(f.k, true)} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                    </div>
                  ))}

                  <div className="sm:col-span-6">
                    <label className={LBL}>{t("Línea de tasa")}<span className="text-amber-500"> *</span></label>
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
                  {avisoCataluna && (
                    <p className="sm:col-span-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("En Cataluña, la tasa de las autorizaciones INICIALES de trabajo es de la Generalitat, no esta. Esta 790-062 sí vale para las renovaciones y prórrogas.")}</p>
                  )}
                  {CAMPOS.slice(10).map(campo)}
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={prep.captcha} alt={t("Código de seguridad")} className="h-16 w-auto rounded border border-slate-300 bg-white" />
                  <button onClick={() => preparar(prep.idProvincia, prep.reglamento)} title={t("Otro código")} className="mb-1 rounded-md border border-slate-300 bg-white p-2 text-slate-500 hover:text-aproba-700" aria-label={t("Refrescar código")}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                  </button>
                  <div className="min-w-[160px] flex-1">
                    <label className={LBL}>{t("Código de seguridad")}</label>
                    <input className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-base uppercase tracking-widest outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" maxLength={6} value={captcha} onChange={(e) => setCaptcha(e.target.value.toUpperCase())} />
                  </div>
                </div>

                {error && !fallback && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                {(faltan.length > 0 || !epigrafeId) && <p className="mt-2 text-xs text-amber-600">{t("Faltan datos obligatorios:")} {[...(!epigrafeId ? [t("Línea de tasa")] : []), ...faltan].join(", ")}.</p>}
                {cpMal && <p className="mt-2 text-xs text-amber-600">{t("El código postal debe tener 5 cifras.")}</p>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <a href="https://sede.administracionespublicas.gob.es/pagina/index/directorio/tasa062" target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-slate-600">{t("Abrir en la Sede oficial")}</a>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
                    <button onClick={descargar} disabled={enviando || !captcha.trim() || !epigrafeId || faltan.length > 0 || cpMal} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
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
