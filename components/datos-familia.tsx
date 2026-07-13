"use client";

import { useState } from "react";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, fichaVacia, type ClienteFicha } from "@/lib/ficha";
import { PARENTESCOS } from "@/lib/familia";
import { makeT, fieldLabel, grupoLabel, sexoLabel, estadoCivilLabel, parentescoI18n, type Lang } from "@/lib/portal-i18n";

export type MiembroInicial = { id: string; nombre: string; apellidos: string | null; parentesco: string | null; esSolicitante: boolean; ficha: ClienteFicha };
type Miembro = { id: string; parentesco: string; ficha: ClienteFicha; esSolicitante: boolean; mismoDomicilio: boolean; abierto: boolean };

// Campos de domicilio (para la casilla "mismo domicilio que el titular").
const DOMICILIO_KEYS = FICHA_CAMPOS.filter((f) => f.grupo === "Domicilio").map((f) => f.k);
// Misma regla de completitud que el flujo individual (todo salvo «piso»).
const REQUIRED_KEYS = FICHA_CAMPOS.filter((f) => f.k !== "piso").map((f) => f.k);
const nombreMiembro = (m: Miembro) => `${(m.ficha.nombre ?? "").trim()} ${(m.ficha.apellidos ?? "").trim()}`.trim();
const copiaDomicilio = (dst: ClienteFicha, src: ClienteFicha): ClienteFicha => {
  const out = { ...dst };
  for (const k of DOMICILIO_KEYS) out[k] = src[k] ?? "";
  return out;
};

// Étape « Datos » d'un expediente FAMILIAL : le titulaire (représentant) remplit la ficha de
// chaque membre, choisit le parenté, et coche « el trámite es para esta persona » pour un ou
// plusieurs applicants. Case « même domicilio » à partir du 2e membre. Add/remove membres.
// Formato compartido con el padre (client-portal): el precio del paso Pago y los
// documentos por miembro dependen de esta lista.
const aIniciales = (ms: Miembro[]): MiembroInicial[] =>
  ms.map((m) => ({ id: m.id, nombre: (m.ficha.nombre ?? "").trim(), apellidos: (m.ficha.apellidos ?? "").trim() || null, parentesco: m.parentesco, esSolicitante: m.esSolicitante, ficha: m.ficha }));

export function DatosFamilia({
  token, lang, miembrosIniciales, onBack, onContinue, onMiembrosChange,
}: {
  token: string; lang: Lang; miembrosIniciales: MiembroInicial[]; onBack: () => void; onContinue: (miembros: MiembroInicial[]) => void;
  // Notifica CADA alta/baja confirmada por el servidor: sin esto, «Añadir miembro»
  // + «Atrás» dejaba un miembro fantasma — facturado por el servidor, invisible en la UI.
  onMiembrosChange?: (miembros: MiembroInicial[]) => void;
}) {
  const t = makeT(lang);
  const [miembros, setMiembros] = useState<Miembro[]>(() => {
    const inic = (miembrosIniciales.length ? miembrosIniciales : []).map((m, i) => {
      const ficha = fichaVacia();
      Object.assign(ficha, m.ficha);
      if (!ficha.nombre && m.nombre) ficha.nombre = m.nombre;
      if (!ficha.apellidos && m.apellidos) ficha.apellidos = m.apellidos;
      return { id: m.id, parentesco: m.parentesco || (i === 0 ? "TITULAR" : "OTRO"), ficha, esSolicitante: Boolean(m.esSolicitante), mismoDomicilio: false, abierto: i === 0 };
    });
    // Por defecto el trámite es para el titular si nadie está marcado todavía.
    if (inic.length && !inic.some((m) => m.esSolicitante)) inic[0].esSolicitante = true;
    return inic;
  });
  const [addingMiembro, setAddingMiembro] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFicha = (id: string, k: keyof ClienteFicha, v: string) =>
    setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, ficha: { ...m.ficha, [k]: v } } : m)));
  const setParentesco = (id: string, p: string) =>
    setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, parentesco: p } : m)));
  const toggle = (id: string) => setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, abierto: !m.abierto } : m)));
  const toggleSolicitante = (id: string) => setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, esSolicitante: !m.esSolicitante } : m)));
  const toggleMismoDomicilio = (id: string) =>
    setMiembros((ms) => {
      const titular = ms[0];
      return ms.map((m) => {
        if (m.id !== id) return m;
        const on = !m.mismoDomicilio;
        return { ...m, mismoDomicilio: on, ficha: on && titular ? copiaDomicilio(m.ficha, titular.ficha) : m.ficha };
      });
    });

  async function añadirMiembro() {
    setAddingMiembro(true); setError(null);
    try {
      const res = await fetch("/api/portal/familia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, parentesco: "HIJO" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("fam.errAnadir"));
      const next = miembros.map((m) => ({ ...m, abierto: false })).concat({ id: d.id, parentesco: "HIJO", ficha: fichaVacia(), esSolicitante: false, mismoDomicilio: false, abierto: true });
      setMiembros(next);
      onMiembrosChange?.(aIniciales(next));
    } catch (e) { setError(e instanceof Error ? e.message : t("fam.errAnadir")); }
    finally { setAddingMiembro(false); }
  }

  async function quitar(id: string) {
    if (miembros.length <= 1) return;
    setError(null);
    const prev = miembros;
    const next = miembros.filter((m) => m.id !== id);
    setMiembros(next);
    onMiembrosChange?.(aIniciales(next));
    try {
      const res = await fetch("/api/portal/familia", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, clienteId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? t("fam.errQuitar")); }
    } catch (e) { setMiembros(prev); onMiembrosChange?.(aIniciales(prev)); setError(e instanceof Error ? e.message : t("fam.errQuitar")); }
  }

  async function continuar() {
    if (!miembros.some((m) => m.esSolicitante)) { setError(t("fam.minUnSolicitante")); return; }
    setGuardando(true); setError(null);
    try {
      const titular = miembros[0];
      for (const m of miembros) {
        const ficha = m.mismoDomicilio && titular ? copiaDomicilio(m.ficha, titular.ficha) : m.ficha;
        const res = await fetch("/api/portal/familia", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, clienteId: m.id, ficha, parentesco: m.parentesco, esSolicitante: m.esSolicitante, idioma: lang }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? t("fam.errGuardar")); }
      }
      // Remonte los miembros actualizados (esSolicitante, domicilio) a la etapa Documentos.
      onContinue(miembros.map((m) => {
        const ficha = m.mismoDomicilio && titular ? copiaDomicilio(m.ficha, titular.ficha) : m.ficha;
        return { id: m.id, nombre: (ficha.nombre ?? "").trim(), apellidos: (ficha.apellidos ?? "").trim() || null, parentesco: m.parentesco, esSolicitante: m.esSolicitante, ficha };
      }));
    } catch (e) { setError(e instanceof Error ? e.message : t("fam.errGuardar")); }
    finally { setGuardando(false); }
  }

  const titularNombre = nombreMiembro(miembros[0]) || parentescoI18n(miembros[0]?.parentesco, lang) || t("fam.miembro");

  // Campos por rellenar POR MIEMBRO (el domicilio copiado del titular cuenta como lleno).
  // Solo los SOLICITANTES bloquean Continuar: sus datos alimentan los formularios EX;
  // un acompañante incompleto solo muestra el badge.
  const faltanDe = (m: Miembro) => {
    const ficha = m.mismoDomicilio && miembros[0] ? copiaDomicilio(m.ficha, miembros[0].ficha) : m.ficha;
    return REQUIRED_KEYS.filter((k) => !((ficha[k] ?? "").trim())).length;
  };
  const solicitantesIncompletos = miembros.filter((m) => m.esSolicitante && faltanDe(m) > 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("fam.datos.titulo")}</h1>
      <p className="mt-2 text-slate-600">{t("fam.datos.intro")}</p>

      <div className="mt-6 space-y-3">
        {miembros.map((m, idx) => {
          const nombre = nombreMiembro(m) || parentescoI18n(m.parentesco, lang) || t("fam.miembro");
          return (
            <div key={m.id} className={`rounded-xl border bg-white p-4 ${m.esSolicitante ? "border-aproba-300 ring-1 ring-aproba-100" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => toggle(m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{parentescoI18n(m.parentesco, lang) || t("fam.miembro")}</span>
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{nombre}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {faltanDe(m) > 0 && (
                    <span title={t("fam.faltan", { nombre, n: faltanDe(m) })} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      {t("s1.faltanCorto", { n: faltanDe(m) })}
                    </span>
                  )}
                  {m.esSolicitante && <span className="rounded-full bg-aproba-100 px-2 py-0.5 text-[10px] font-semibold text-aproba-700">{t("fam.solicitante")}</span>}
                  {miembros.length > 1 && (
                    <button onClick={() => quitar(m.id)} aria-label={t("fam.quitar")} className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  )}
                  <button onClick={() => toggle(m.id)} aria-label={t("fam.miembro")} className="rounded-md p-1.5 text-slate-400">
                    <svg className={`h-4 w-4 transition ${m.abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
              </div>

              {m.abierto && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[13px] font-medium text-slate-600">{t("fam.parentesco")}</label>
                      <select value={m.parentesco} onChange={(e) => setParentesco(m.id, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600">
                        {PARENTESCOS.map(([v]) => <option key={v} value={v}>{parentescoI18n(v, lang)}</option>)}
                      </select>
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                      <input type="checkbox" checked={m.esSolicitante} onChange={() => toggleSolicitante(m.id)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                      {t("fam.esSolicitante")}
                    </label>
                  </div>

                  {idx > 0 && (
                    <label className="mb-4 flex items-center gap-2 rounded-lg bg-cream-50 px-3 py-2 text-sm text-slate-600">
                      <input type="checkbox" checked={m.mismoDomicilio} onChange={() => toggleMismoDomicilio(m.id)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                      {t("fam.mismoDomicilio", { nombre: titularNombre })}
                    </label>
                  )}

                  {GRUPOS.map((grupo) => {
                    const oculto = grupo === "Domicilio" && m.mismoDomicilio; // domicilio copiado del titular
                    if (oculto) return null;
                    return (
                      <div key={grupo} className="mb-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{grupoLabel(grupo, lang)}</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {FICHA_CAMPOS.filter((f) => f.grupo === grupo).map((f) => (
                            <div key={f.k} className={f.w === "full" ? "sm:col-span-2" : ""}>
                              <label className="text-[13px] font-medium text-slate-600">{fieldLabel(f.k, lang)}</label>
                              {f.tipo === "sexo" || f.tipo === "estadoCivil" ? (
                                <select value={m.ficha[f.k] ?? ""} onChange={(e) => setFicha(m.id, f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600">
                                  {(f.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v]) => <option key={v} value={v}>{f.tipo === "sexo" ? sexoLabel(v, lang) : estadoCivilLabel(v, lang)}</option>)}
                                </select>
                              ) : (
                                <input type={f.tipo === "date" ? "date" : "text"} value={m.ficha[f.k] ?? ""} onChange={(e) => setFicha(m.id, f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={añadirMiembro} disabled={addingMiembro} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        {addingMiembro ? t("fam.anadiendo") : t("fam.anadir")}
      </button>

      {solicitantesIncompletos.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
          {solicitantesIncompletos.map((m) => (
            <p key={m.id}>{t("fam.faltan", { nombre: nombreMiembro(m) || parentescoI18n(m.parentesco, lang) || t("fam.miembro"), n: faltanDe(m) })}</p>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
        <button onClick={continuar} disabled={guardando || solicitantesIncompletos.length > 0} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
          {guardando ? t("s1.guardando") : t("common.continuar")}
        </button>
      </div>
    </div>
  );
}
