"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { TelefonoInput } from "@/components/telefono-input";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// Tasa 790-026 (nacionalidad española por residencia, Ministerio de Justicia).
// Misma factura visual que el modal de la 790-012, pero SIN captcha: la Sede de
// Justicia sirve el impreso oficial directamente (justificante único por descarga),
// así que aquí solo se revisan los datos y se descarga en un clic.

type Prefill = Record<string, string>;

const hoy = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const FECHA_RE = /^\d{2}\/\d{2}\/\d{4}$/;

const CAMPOS: { k: string; label: string; w: string; req?: boolean; tel?: boolean }[] = [
  { k: "numId", label: "Nº de documento", w: "half", req: true },
  { k: "apellido1", label: "Primer apellido", w: "third", req: true },
  { k: "apellido2", label: "Segundo apellido", w: "third" },
  { k: "nombre", label: "Nombre", w: "third", req: true },
  { k: "domicilio", label: "Domicilio (calle/plaza/avda.)", w: "half", req: true },
  { k: "numero", label: "Número", w: "sixth" },
  { k: "piso", label: "Piso", w: "sixth" },
  { k: "municipio", label: "Municipio", w: "third", req: true },
  { k: "provincia", label: "Provincia", w: "third", req: true },
  { k: "cp", label: "C.P.", w: "sixth", req: true },
  { k: "pais", label: "País", w: "sixth" },
  { k: "fechaNac", label: "Nacimiento (dd/mm/aaaa)", w: "third", req: true },
  { k: "telefono", label: "Teléfono", w: "half", tel: true },
  { k: "email", label: "Correo electrónico", w: "half" },
  { k: "firmaLugar", label: "Localidad de firma", w: "third", req: true },
  { k: "firmaFecha", label: "Fecha (dd/mm/aaaa)", w: "third", req: true },
  { k: "importe", label: "Importe (€)", w: "sixth", req: true },
];
const W: Record<string, string> = { half: "sm:col-span-3", third: "sm:col-span-2", sixth: "sm:col-span-1" };

// clienteId (expediente familiar): la tasa es NOMINATIVA, una por solicitante.
// expedienteId opcional: desde la ficha del cliente se genera sin archivar.
export function Tasa790026Modal({ expedienteId, clienteId, etiqueta }: { expedienteId?: string; clienteId?: string; etiqueta?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useScrollBloqueado(open);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);
  const [campos, setCampos] = useState<Prefill>({});
  const [tipoDoc, setTipoDoc] = useState("nie");
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function iniciar() {
    setOpen(true); setListo(false); setCargando(true); setError(null); setFallback(null);
    const r = await fetch("/api/tasa790026/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expedienteId, clienteId }) });
    const j = await r.json().catch(() => ({}));
    setCargando(false);
    if (!r.ok) { setError(j.error ?? t("No se pudieron cargar los datos.")); return; }
    setTipoDoc(j.prefill.tipoDoc ?? "nie");
    setCampos({ ...j.prefill, firmaFecha: hoy() });
    setListo(true);
  }

  const faltan = CAMPOS.filter((f) => f.req && !(campos[f.k] ?? "").trim()).map((f) => t(f.label));
  const fechasMal = ["fechaNac", "firmaFecha"].filter((k) => (campos[k] ?? "").trim() && !FECHA_RE.test((campos[k] ?? "").trim()));

  async function descargar() {
    setEnviando(true); setError(null); setFallback(null);
    const body = { expedienteId, clienteId, campos: { ...campos, tipoDoc } };
    const r = await fetch("/api/tasa790026/descargar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.headers.get("content-type")?.includes("pdf")) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `tasa-790-026-${expedienteId ?? clienteId ?? "cliente"}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setEnviando(false); setOpen(false);
      return;
    }
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    setError(j.error ?? t("No se pudo generar la tasa."));
    setFallback(j.fallback ?? null);
  }

  const set = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  // 16 px en el móvil: por debajo, Safari de iOS hace zoom al enfocar el campo.
  const inp = (k: string, req?: boolean) =>
    `w-full rounded-md border px-2.5 py-1.5 text-[16px] outline-none focus:ring-2 focus:ring-aproba-100 sm:text-sm ${req && !(campos[k] ?? "").trim() ? "border-amber-400 bg-amber-50/40" : "border-slate-300 focus:border-aproba-600"}`;

  return (
    <>
      <button onClick={iniciar} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
        {etiqueta ?? t("Tasa 790-026 (nacionalidad)")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={() => !enviando && setOpen(false)}>
          <div className="mt-4 w-full max-w-2xl rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:mt-6 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">{t("Tasa 790-026 · Nacionalidad por residencia")}</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">{t("Descargamos el impreso oficial de la Sede del Ministerio de Justicia (con su número de justificante) y lo rellenamos con estos datos. Sin código de seguridad.")}</p>

            {cargando && <p className="py-10 text-center text-sm text-slate-500">{t("Cargando los datos del solicitante…")}</p>}

            {listo && !cargando && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <div className="sm:col-span-2">
                    <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Documento")}<span className="text-amber-500"> *</span></label>
                    <select className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                      <option value="nie">NIE</option>
                      <option value="pasaporte">{t("Pasaporte")}</option>
                      <option value="dni">{t("DNI UE")}</option>
                    </select>
                  </div>
                  {CAMPOS.map((f) => (
                    <div key={f.k} className={W[f.w]}>
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t(f.label)}{f.req && <span className="text-amber-500"> *</span>}</label>
                      {f.tel ? (
                        <TelefonoInput value={campos[f.k] ?? ""} onChange={(v) => set(f.k, v)} className={inp(f.k, f.req)} labelPrefijo={t("Prefijo de país")} labelSinPrefijo={t("— Sin prefijo")} />
                      ) : (
                        <input className={inp(f.k, f.req)} value={campos[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Presentador ≠ solicitante (opcional): el impreso trae su propia casilla. */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Solo si el presentador es distinto del solicitante (opcional)")}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("NIE o DNI del presentador")}</label>
                      <input className={inp("presNumId")} value={campos.presNumId ?? ""} onChange={(e) => set("presNumId", e.target.value)} />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Nombre y apellidos del presentador")}</label>
                      <input className={inp("presNombre")} value={campos.presNombre ?? ""} onChange={(e) => set("presNombre", e.target.value)} />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                    {fallback && <a href={fallback} target="_blank" rel="noreferrer" className="ml-2 font-semibold underline">{t("Comprobar la web oficial →")}</a>}
                  </div>
                )}
                {faltan.length > 0 && <p className="mt-2 text-xs text-amber-600">{t("Faltan datos obligatorios:")} {faltan.join(", ")}.</p>}
                {fechasMal.length > 0 && <p className="mt-2 text-xs text-amber-600">{t("Las fechas van en formato dd/mm/aaaa.")}</p>}

                <div className="mt-5 flex items-center justify-between gap-2">
                  <a href="https://sede.mjusticia.gob.es/es/tramites/nacionalidad-espanola" target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline hover:text-slate-600">{t("Abrir en la Sede oficial")}</a>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
                    <button onClick={descargar} disabled={enviando || faltan.length > 0 || fechasMal.length > 0} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
                      {enviando ? t("Generando…") : t("Descargar tasa rellenada")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {!listo && !cargando && error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
