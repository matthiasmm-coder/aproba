"use client";

import { useMemo, useState } from "react";
import { FICHA_CAMPOS, fichaVacia, type ClienteFicha } from "@/lib/ficha";
import { makeT, type Lang } from "@/lib/portal-i18n";
import { TelefonoInput } from "@/components/telefono-input";
import { FichaCamposPortal } from "@/components/ficha-campos-portal";
import type { MiembroInicial } from "@/components/datos-familia";

// Datos fiscales y de contacto de la EMPRESA (los que llevan la hoja de encargo y las
// facturas) tal como llegan del servidor, más los trabajadores ya en el lote.
export type EmpresaPortal = {
  razonSocial: string; nif: string | null; domicilio: string | null; codigoPostal: string | null; municipio: string | null; provincia: string | null;
  contactoNombre: string | null; contactoEmail: string | null; contactoTelefono: string | null;
  trabajadores: MiembroInicial[];
};

type Trabajador = { id: string | null; ficha: ClienteFicha; abierto: boolean }; // id null = aún no guardado
type DatosEmp = Record<"razonSocial" | "nif" | "domicilio" | "codigoPostal" | "municipio" | "provincia" | "contactoNombre" | "contactoEmail" | "contactoTelefono", string>;

const EMPRESA_REQUERIDOS: (keyof DatosEmp)[] = ["razonSocial", "nif", "domicilio", "codigoPostal", "municipio", "provincia", "contactoNombre", "contactoEmail"];
// Misma regla de completitud que la ficha individual y la de cada miembro de una familia.
const REQUIRED_KEYS = FICHA_CAMPOS.filter((f) => f.k !== "piso" && f.k !== "numeroDocumento").map((f) => f.k);
const nombreDe = (f: ClienteFicha) => `${(f.nombre ?? "").trim()} ${(f.apellidos ?? "").trim()}`.trim();
const aInicial = (id: string, ficha: ClienteFicha): MiembroInicial =>
  ({ id, nombre: (ficha.nombre ?? "").trim(), apellidos: (ficha.apellidos ?? "").trim() || null, parentesco: null, esSolicitante: true, ficha });

// Paso «Empresa y trabajadores» del portal de un expediente DE EMPRESA (21/09/2026, Luis):
// la empresa completa sus datos y añade a cada trabajador con la ficha completa (la misma
// que rellenaría el trabajador en su propio enlace). Cada trabajador es solicitante: sus
// datos alimentan sus formularios y su mandato. Formato compartido con el padre
// (client-portal): el precio ×N y los documentos por trabajador salen de esta lista.
export function DatosEmpresa({ token, lang, empresa, trabajadoresIniciales, onContinue, onMiembrosChange }: {
  token: string; lang: Lang; empresa: EmpresaPortal; trabajadoresIniciales: MiembroInicial[];
  onContinue: (trabajadores: MiembroInicial[]) => void;
  // Notifica cada alta/baja CONFIRMADA por el servidor (el precio ×N no puede mentir).
  onMiembrosChange?: (trabajadores: MiembroInicial[]) => void;
}) {
  const t = useMemo(() => makeT(lang), [lang]);
  const [datos, setDatos] = useState<DatosEmp>({
    razonSocial: empresa.razonSocial ?? "", nif: empresa.nif ?? "", domicilio: empresa.domicilio ?? "", codigoPostal: empresa.codigoPostal ?? "",
    municipio: empresa.municipio ?? "", provincia: empresa.provincia ?? "", contactoNombre: empresa.contactoNombre ?? "", contactoEmail: empresa.contactoEmail ?? "", contactoTelefono: empresa.contactoTelefono ?? "",
  });
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>(() =>
    trabajadoresIniciales.map((m, i) => {
      const ficha = fichaVacia(); Object.assign(ficha, m.ficha);
      if (!ficha.nombre && m.nombre) ficha.nombre = m.nombre;
      if (!ficha.apellidos && m.apellidos) ficha.apellidos = m.apellidos;
      return { id: m.id, ficha, abierto: i === 0 && trabajadoresIniciales.length === 1 };
    }),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setCampo = (k: keyof DatosEmp, v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const setFicha = (idx: number, k: keyof ClienteFicha, v: string) =>
    setTrabajadores((ts) => ts.map((x, i) => (i === idx ? { ...x, ficha: { ...x.ficha, [k]: v } } : x)));
  const toggle = (idx: number) => setTrabajadores((ts) => ts.map((x, i) => (i === idx ? { ...x, abierto: !x.abierto } : x)));

  const faltanEmpresa = EMPRESA_REQUERIDOS.filter((k) => !(datos[k] ?? "").trim()).length;
  const faltanDe = (x: Trabajador) => REQUIRED_KEYS.filter((k) => !((x.ficha[k] ?? "").trim())).length;
  const incompletos = trabajadores.filter((x) => faltanDe(x) > 0);

  function anadir() {
    setError(null);
    setTrabajadores((ts) => ts.map((x) => ({ ...x, abierto: false })).concat({ id: null, ficha: fichaVacia(), abierto: true }));
  }

  async function quitar(idx: number) {
    setError(null);
    const x = trabajadores[idx];
    const prev = trabajadores;
    const next = trabajadores.filter((_, i) => i !== idx);
    setTrabajadores(next);
    if (!x.id) return; // nunca llegó al servidor
    try {
      const res = await fetch("/api/portal/trabajadores", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, clienteId: x.id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? t("fam.errQuitar")); }
      onMiembrosChange?.(next.filter((y) => y.id).map((y) => aInicial(y.id as string, y.ficha)));
    } catch (e) { setTrabajadores(prev); setError(e instanceof Error ? e.message : t("fam.errQuitar")); }
  }

  async function continuar() {
    if (faltanEmpresa > 0) { setError(t("emp.faltanEmpresa", { n: faltanEmpresa })); return; }
    if (!trabajadores.length) { setError(t("emp.minUnTrabajador")); return; }
    if (incompletos.length) return;
    setGuardando(true); setError(null);
    try {
      const rE = await fetch("/api/portal/empresa", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, empresa: datos }) });
      if (!rE.ok) { const d = await rE.json().catch(() => ({})); throw new Error(d.error ?? t("fam.errGuardar")); }
      const guardados: Trabajador[] = [];
      for (const x of trabajadores) {
        const res = await fetch("/api/portal/trabajadores", {
          method: x.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ...(x.id ? { clienteId: x.id } : {}), ficha: x.ficha, idioma: lang }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? (x.id ? t("fam.errGuardar") : t("fam.errAnadir")));
        guardados.push({ ...x, id: x.id ?? String(d.id) });
        // Alta confirmada: el padre recalcula el precio ×N aunque el resto falle después.
        setTrabajadores((ts) => ts.map((y) => (y === x ? { ...y, id: x.id ?? String(d.id) } : y)));
      }
      const lista = guardados.map((y) => aInicial(y.id as string, y.ficha));
      onMiembrosChange?.(lista);
      onContinue(lista);
    } catch (e) { setError(e instanceof Error ? e.message : t("fam.errGuardar")); }
    finally { setGuardando(false); }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
  const campoEmp = (k: keyof DatosEmp, etiqueta: string, opts: { full?: boolean; tipo?: string } = {}) => (
    <div key={k} className={opts.full ? "sm:col-span-2" : ""}>
      <label className="text-[13px] font-medium text-slate-600">{etiqueta}{EMPRESA_REQUERIDOS.includes(k) ? " *" : ""}</label>
      <input type={opts.tipo ?? "text"} value={datos[k]} onChange={(e) => setCampo(k, e.target.value)} className={input} />
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("emp.datos.titulo")}</h1>
      <p className="mt-2 text-slate-600">{t("emp.datos.intro")}</p>

      {/* La empresa */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("emp.seccion.empresa")}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campoEmp("razonSocial", t("emp.razonSocial"), { full: true })}
          {campoEmp("nif", t("emp.nif"))}
          {campoEmp("contactoNombre", t("emp.contactoNombre"))}
          {campoEmp("domicilio", t("emp.domicilio"), { full: true })}
          {campoEmp("codigoPostal", t("emp.codigoPostal"))}
          {campoEmp("municipio", t("emp.municipio"))}
          {campoEmp("provincia", t("emp.provincia"))}
          {campoEmp("contactoEmail", t("emp.contactoEmail"), { tipo: "email" })}
          <div>
            <label className="text-[13px] font-medium text-slate-600">{t("emp.contactoTelefono")}</label>
            <div className="mt-1">
              <TelefonoInput value={datos.contactoTelefono} onChange={(v) => setCampo("contactoTelefono", v)} labelPrefijo={t("tel.prefijo")} labelSinPrefijo={t("tel.sinPrefijo")} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-aproba-600 sm:text-sm" />
            </div>
          </div>
        </div>
        {faltanEmpresa > 0 && <p className="mt-3 text-xs text-amber-700">{t("emp.faltanEmpresa", { n: faltanEmpresa })}</p>}
      </div>

      {/* Los trabajadores */}
      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("emp.seccion.trabajadores")} ({trabajadores.length})</p>
        <p className="mt-1 text-xs text-slate-400">{t("emp.trabajadoresHint")}</p>
        <div className="mt-3 space-y-3">
          {trabajadores.map((x, idx) => {
            const nombre = nombreDe(x.ficha) || t("emp.trabajadorSinNombre");
            const faltan = faltanDe(x);
            return (
              <div key={x.id ?? `nuevo-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => toggle(idx)} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("emp.trabajador")} {idx + 1}</span>
                      {faltan > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t("s1.faltanCorto", { n: faltan })}</span>}
                    </span>
                    <span className="text-[15px] font-semibold leading-snug text-slate-900">{nombre}</span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => void quitar(idx)} aria-label={t("fam.quitar")} className="rounded-md p-2.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                    <button type="button" onClick={() => toggle(idx)} aria-expanded={x.abierto} className="rounded-md p-2.5 text-slate-400">
                      <svg className={`h-4 w-4 transition ${x.abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </div>
                </div>
                {x.abierto && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <FichaCamposPortal ficha={x.ficha} lang={lang} onChange={(k, v) => setFicha(idx, k, v)} t={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={anadir} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("emp.anadir")}
        </button>
      </div>

      {incompletos.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
          {incompletos.map((x, i) => <p key={x.id ?? `n${i}`}>{t("fam.faltan", { nombre: nombreDe(x.ficha) || t("emp.trabajadorSinNombre"), n: faltanDe(x) })}</p>)}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={() => void continuar()} disabled={guardando || incompletos.length > 0} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          {guardando ? t("s1.guardando") : t("common.continuar")}
        </button>
      </div>
    </div>
  );
}
