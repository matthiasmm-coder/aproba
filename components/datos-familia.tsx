"use client";

import { useState } from "react";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, fichaVacia, type ClienteFicha } from "@/lib/ficha";
import { PARENTESCOS, parentescoLabel } from "@/lib/familia";
import { fieldLabel, grupoLabel, sexoLabel, estadoCivilLabel, type Lang } from "@/lib/portal-i18n";

export type MiembroInicial = { id: string; nombre: string; apellidos: string | null; parentesco: string | null; ficha: ClienteFicha };
type Miembro = { id: string; parentesco: string; ficha: ClienteFicha; abierto: boolean };

const nombreMiembro = (m: Miembro) => `${(m.ficha.nombre ?? "").trim()} ${(m.ficha.apellidos ?? "").trim()}`.trim();

// Étape « Datos » d'un expediente FAMILIAL : le titulaire remplit la ficha de chaque membre,
// choisit le parenté et désigne pour qui est le trámite (solicitante). Add/remove membres.
export function DatosFamilia({
  token, lang, miembrosIniciales, solicitanteIdInicial, onBack, onContinue,
}: {
  token: string; lang: Lang; miembrosIniciales: MiembroInicial[]; solicitanteIdInicial: string;
  onBack: () => void; onContinue: () => void;
}) {
  const [miembros, setMiembros] = useState<Miembro[]>(() =>
    (miembrosIniciales.length ? miembrosIniciales : []).map((m, i) => {
      const ficha = fichaVacia();
      Object.assign(ficha, m.ficha);
      if (!ficha.nombre && m.nombre) ficha.nombre = m.nombre;
      if (!ficha.apellidos && m.apellidos) ficha.apellidos = m.apellidos;
      return { id: m.id, parentesco: m.parentesco || (i === 0 ? "TITULAR" : "OTRO"), ficha, abierto: i === 0 };
    })
  );
  const [solicitanteId, setSolicitanteId] = useState(solicitanteIdInicial);
  const [addingMiembro, setAddingMiembro] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFicha = (id: string, k: keyof ClienteFicha, v: string) =>
    setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, ficha: { ...m.ficha, [k]: v } } : m)));
  const setParentesco = (id: string, p: string) =>
    setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, parentesco: p } : m)));
  const toggle = (id: string) => setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, abierto: !m.abierto } : m)));

  async function añadirMiembro() {
    setAddingMiembro(true); setError(null);
    try {
      const res = await fetch("/api/portal/familia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, parentesco: "HIJO" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo añadir el miembro.");
      setMiembros((ms) => ms.map((m) => ({ ...m, abierto: false })).concat({ id: d.id, parentesco: "HIJO", ficha: fichaVacia(), abierto: true }));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo añadir el miembro."); }
    finally { setAddingMiembro(false); }
  }

  async function quitar(id: string) {
    if (id === solicitanteId) { setError("No puedes quitar al solicitante. Designa a otra persona antes."); return; }
    if (miembros.length <= 1) return;
    setError(null);
    const prev = miembros;
    setMiembros((ms) => ms.filter((m) => m.id !== id));
    try {
      const res = await fetch("/api/portal/familia", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, clienteId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "No se pudo quitar."); }
    } catch (e) { setMiembros(prev); setError(e instanceof Error ? e.message : "No se pudo quitar."); }
  }

  async function continuar() {
    setGuardando(true); setError(null);
    try {
      // Persiste la ficha de cada miembro; marca al solicitante (Expediente.clienteId).
      for (const m of miembros) {
        const res = await fetch("/api/portal/familia", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, clienteId: m.id, ficha: m.ficha, parentesco: m.parentesco, esSolicitante: m.id === solicitanteId, idioma: lang }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "No se pudieron guardar los datos."); }
      }
      onContinue();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron guardar los datos."); }
    finally { setGuardando(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Datos de la familia</h1>
      <p className="mt-2 text-slate-600">Añade a cada miembro y rellena sus datos. Marca para quién es el trámite.</p>

      <div className="mt-6 space-y-3">
        {miembros.map((m) => {
          const esSolicitante = m.id === solicitanteId;
          const nombre = nombreMiembro(m) || parentescoLabel(m.parentesco) || "Miembro";
          return (
            <div key={m.id} className={`rounded-xl border bg-white p-4 ${esSolicitante ? "border-aproba-300 ring-1 ring-aproba-100" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => toggle(m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{parentescoLabel(m.parentesco) || "Miembro"}</span>
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{nombre}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {esSolicitante && <span className="rounded-full bg-aproba-100 px-2 py-0.5 text-[10px] font-semibold text-aproba-700">Solicitante</span>}
                  {miembros.length > 1 && !esSolicitante && (
                    <button onClick={() => quitar(m.id)} aria-label="Quitar" className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                  )}
                  <button onClick={() => toggle(m.id)} aria-label="Abrir" className="rounded-md p-1.5 text-slate-400">
                    <svg className={`h-4 w-4 transition ${m.abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
              </div>

              {m.abierto && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[13px] font-medium text-slate-600">Parentesco</label>
                      <select value={m.parentesco} onChange={(e) => setParentesco(m.id, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600">
                        {PARENTESCOS.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                      </select>
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                      <input type="radio" name="solicitante" checked={esSolicitante} onChange={() => setSolicitanteId(m.id)} className="h-4 w-4 text-aproba-600 focus:ring-aproba-500" />
                      El trámite es para esta persona
                    </label>
                  </div>

                  {GRUPOS.map((grupo) => (
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
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={añadirMiembro} disabled={addingMiembro} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        {addingMiembro ? "Añadiendo…" : "Añadir miembro"}
      </button>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Atrás</button>
        <button onClick={continuar} disabled={guardando} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
          {guardando ? "Guardando…" : "Continuar"}
        </button>
      </div>
    </div>
  );
}
