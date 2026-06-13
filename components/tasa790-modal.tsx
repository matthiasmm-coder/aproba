"use client";

import { useState } from "react";

// Génération de la tasa 790-012 officielle (proxy Sede Policía Nacional) :
// données pré-remplies + éditables, champs obligatoires validés, le gestor lit le
// captcha et télécharge le vrai PDF barcodé. Fallback lien direct si la Sede tombe.

type Tramite = { value: string; importe: string; label: string };
type Prefill = Record<string, string>;
type Datos = { sid: string; captcha: string; tramites: Tramite[]; prefill: Prefill };

const hoy = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// req = obligatoire pour la Sede (validarInputTextNoVacio). piso est facultatif.
const CAMPOS: { k: string; label: string; w: string; req?: boolean }[] = [
  { k: "nif", label: "NIE / Pasaporte", w: "half", req: true },
  { k: "nombre", label: "Apellidos y nombre", w: "half", req: true },
  { k: "calle", label: "Tipo de vía", w: "third", req: true },
  { k: "via", label: "Nombre de la vía", w: "third", req: true },
  { k: "numero", label: "Número", w: "sixth", req: true },
  { k: "piso", label: "Piso", w: "sixth" },
  { k: "municipio", label: "Municipio", w: "third", req: true },
  { k: "provincia", label: "Provincia", w: "third", req: true },
  { k: "codigoPostal", label: "C.P.", w: "third", req: true },
  { k: "telefono", label: "Teléfono", w: "third", req: true },
  { k: "localidad", label: "Localidad de firma", w: "third", req: true },
  { k: "fecha", label: "Fecha (dd/mm/aaaa)", w: "third", req: true },
];
const W: Record<string, string> = { half: "sm:col-span-3", third: "sm:col-span-2", sixth: "sm:col-span-1" };

export function Tasa790Modal({ expedienteId }: { expedienteId: string }) {
  const [open, setOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [campos, setCampos] = useState<Prefill>({});
  const [tramite, setTramite] = useState("3");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // preservar=true : on garde les saisies du gestor, on ne rafraîchit que le captcha.
  async function iniciar(preservar = false) {
    if (!preservar) { setOpen(true); setDatos(null); }
    setCargando(!preservar); setError(null); setFallback(null); setCaptcha("");
    const r = await fetch("/api/tasa790/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expedienteId }) });
    const j = await r.json().catch(() => ({}));
    setCargando(false);
    if (!r.ok) { setError(j.error ?? "No se pudo abrir el generador oficial."); setFallback(j.fallback ?? null); return; }
    setDatos(j);
    if (!preservar) setCampos({ ...j.prefill, localidad: j.prefill.municipio ?? "", fecha: hoy() });
  }

  const faltan = CAMPOS.filter((f) => f.req && !(campos[f.k] ?? "").trim()).map((f) => f.label);

  async function descargar() {
    if (!datos) return;
    setEnviando(true); setError(null);
    const importe = datos.tramites.find((t) => t.value === tramite)?.importe ?? "";
    const body = { sid: datos.sid, campos: { ...campos, tramiteSeleccionado: tramite, total: importe, efectivoOAdeudo: "efectivo", codSeguridadForm: captcha } };
    const r = await fetch("/api/tasa790/descargar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.headers.get("content-type")?.includes("pdf")) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `tasa-790-012-${expedienteId}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setEnviando(false); setOpen(false);
      return;
    }
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    setError(j.error ?? "No se pudo generar la tasa.");
    iniciar(true); // le captcha est de un solo uso → on en recharge un, en conservant los datos
  }

  const set = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const inp = (k: string, req?: boolean) =>
    `w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-aproba-100 ${req && !(campos[k] ?? "").trim() ? "border-amber-400 bg-amber-50/40" : "border-slate-300 focus:border-aproba-600"}`;

  return (
    <>
      <button onClick={() => iniciar(false)} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
        Generar tasa 790-012 oficial
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !enviando && setOpen(false)}>
          <div className="mt-6 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Tasa 790-012 oficial</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">Generamos el impreso barcodé en la Sede de la Policía Nacional. Completa los campos obligatorios (en ámbar) y escribe el código de seguridad.</p>

            {cargando && <p className="py-10 text-center text-sm text-slate-500">Abriendo el generador oficial…</p>}

            {fallback && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p>{error}</p>
                <a href={fallback} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold underline">Abrir el generador oficial en una pestaña →</a>
              </div>
            )}

            {datos && !cargando && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  {CAMPOS.map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{f.label}{f.req && <span className="text-amber-500"> *</span>}</label>
                      <input className={inp(f.k, f.req)} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                    </div>
                  ))}
                  <div className="sm:col-span-6">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Trámite (tasa)</label>
                    <select className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" value={tramite} onChange={(e) => setTramite(e.target.value)}>
                      {datos.tramites.map((t) => (
                        <option key={t.value} value={t.value}>{t.importe ? `${t.importe} € — ` : ""}{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Captcha agrandi */}
                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={datos.captcha} alt="Código de seguridad" className="h-16 w-auto rounded border border-slate-300 bg-white" style={{ imageRendering: "auto" }} />
                  <button onClick={() => iniciar(true)} title="Otro código" className="mb-1 rounded-md border border-slate-300 bg-white p-2 text-slate-500 hover:text-aproba-700" aria-label="Refrescar código">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                  </button>
                  <div className="min-w-[160px] flex-1">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Código de seguridad</label>
                    <input className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-base tracking-widest outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" value={captcha} onChange={(e) => setCaptcha(e.target.value)} placeholder="Escribe el código" autoFocus />
                  </div>
                </div>

                {error && !fallback && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                {faltan.length > 0 && <p className="mt-2 text-xs text-amber-600">Faltan datos obligatorios: {faltan.join(", ")}.</p>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <a href="https://sede.policia.gob.es/Tasa790_012/" target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-slate-600">Abrir en la Sede oficial</a>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">Cancelar</button>
                    <button onClick={descargar} disabled={enviando || !captcha.trim() || faltan.length > 0} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                      {enviando ? "Generando…" : "Descargar tasa rellenada"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
