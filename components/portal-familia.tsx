"use client";

import { useRef, useState } from "react";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { FAMILIA_DOC_TIPOS, parentescoLabel } from "@/lib/familia";

export type DocPortal = { id: string; tipo: string; nombreArchivo: string | null };
export type ExpedientePortal = { referencia: string; token: string; estado: string };
export type MiembroPortal = { id: string; nombre: string; parentesco: string | null; ficha: ClienteFicha; expedientes: ExpedientePortal[] };

// Portal familiar: el titular rellena la ficha de cada miembro y sube los documentos
// compartidos. Un solo enlace (/f/[token]) para toda la familia.
export function PortalFamilia({ token, gestoria, familiaNombre, miembros, docs }: {
  token: string; gestoria: string; familiaNombre: string; miembros: MiembroPortal[]; docs: DocPortal[];
}) {
  return (
    <main className="min-h-screen bg-cream-50/60 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-aproba-700">{gestoria}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900">{familiaNombre}</h1>
          <p className="mt-2 text-sm text-slate-600">Rellene los datos de cada miembro y suba los documentos comunes de la familia. Es un único enlace para todos.</p>
        </div>

        <DocsCompartidos token={token} docsIniciales={docs} />

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Miembros de la familia</h2>
          <div className="space-y-3">
            {miembros.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Todavía no hay miembros registrados.</p>}
            {miembros.map((m) => <MiembroCard key={m.id} token={token} miembro={m} />)}
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-slate-400">Gestionado con Aproba</p>
      </div>
    </main>
  );
}

// ── Documentos compartidos de la familia ──
function DocsCompartidos({ token, docsIniciales }: { token: string; docsIniciales: DocPortal[] }) {
  const [docs, setDocs] = useState<DocPortal[]>(docsIniciales);
  const [tipo, setTipo] = useState<string>(FAMILIA_DOC_TIPOS[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    setSubiendo(true); setError(null);
    try {
      const fd = new FormData(); fd.set("tipo", tipo); fd.set("file", file);
      const res = await fetch(`/api/portal-familia/${token}/documentos`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo subir el documento.");
      setDocs((prev) => [{ id: d.id, tipo, nombreArchivo: file.name }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el documento.");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Documentos comunes de la familia</h2>
      <p className="mt-0.5 text-xs text-slate-500">Libro de familia, justificante de vivienda, certificado de matrimonio… Se suben una vez y valen para todos.</p>

      {docs.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-50 text-slate-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{d.tipo}</p>
                  {d.nombreArchivo && <p className="truncate text-xs text-slate-400">{d.nombreArchivo}</p>}
                </div>
              </div>
              <a href={`/api/portal-familia/${token}/documentos/${d.id}`} download className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-300 hover:text-aproba-700">Descargar</a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600">
          {FAMILIA_DOC_TIPOS.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} disabled={subiendo} className="inline-flex items-center gap-1.5 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          {subiendo ? "Subiendo…" : "Subir documento"}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

// ── Ficha de un miembro (plegable) ──
function MiembroCard({ token, miembro }: { token: string; miembro: MiembroPortal }) {
  const [abierto, setAbierto] = useState(false);
  const [ficha, setFicha] = useState<ClienteFicha>(miembro.ficha);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ClienteFicha, v: string) => { setFicha((d) => ({ ...d, [k]: v })); setGuardado(false); };

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/portal-familia/${token}/datos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: miembro.id, ficha }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar.");
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-cream-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{parentescoLabel(miembro.parentesco) || "Miembro"}</span>
          <p className="mt-1 font-semibold text-slate-900">{miembro.nombre}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {guardado && <span className="text-xs font-medium text-aproba-700">Guardado ✓</span>}
          <svg className={`h-4 w-4 text-slate-400 transition ${abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </button>

      {abierto && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {GRUPOS.map((grupo) => (
            <div key={grupo} className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{grupo}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FICHA_CAMPOS.filter((f) => f.grupo === grupo).map((f) => (
                  <div key={f.k} className={f.w === "full" ? "sm:col-span-2" : ""}>
                    <label className="text-[13px] font-medium text-slate-600">{f.label}</label>
                    {f.tipo === "sexo" || f.tipo === "estadoCivil" ? (
                      <select value={ficha[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600">
                        {(f.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                      </select>
                    ) : (
                      <input type={f.tipo === "date" ? "date" : "text"} value={ficha[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {miembro.expedientes.length > 0 && (
            <div className="mb-4 rounded-lg bg-cream-50/70 p-3">
              <p className="text-xs font-medium text-slate-600">Documentos personales de {miembro.nombre.split(" ")[0]}</p>
              <div className="mt-2 space-y-1.5">
                {miembro.expedientes.map((e) => (
                  <a key={e.token} href={`/s/${e.token}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-aproba-300">
                    <span className="min-w-0 truncate font-mono text-xs text-slate-500">{e.referencia}</span>
                    <span className="shrink-0 text-xs font-medium text-aproba-700">Subir sus documentos →</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
          <button onClick={guardar} disabled={guardando} className="w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
            {guardando ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      )}
    </div>
  );
}
