"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// El gestor edita los datos personales del cliente desde su ficha. Reutiliza el modelo
// declarativo de campos (lib/ficha.ts) — los mismos que rellena el cliente en el portal —
// y guarda vía PATCH /api/clientes/[id].
export function EditarCliente({ clienteId, ficha }: { clienteId: string; ficha: ClienteFicha }) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<ClienteFicha>(ficha);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const set = (k: keyof ClienteFicha, v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const sucio = () => JSON.stringify(datos) !== JSON.stringify(ficha);

  // Cierra sin guardar; si hay cambios, confirma (evita perder 17 campos por un clic fuera).
  async function intentarCerrar() {
    if (guardando) return; // nunca cerrar a mitad de guardado
    if (sucio() && !(await confirmar({ mensaje: t("¿Descartar los cambios sin guardar?"), peligro: true, confirmarLabel: t("Descartar") }))) return;
    setAbierto(false);
  }
  // Cierre explícito (X / Cancelar): intención clara, pero bloqueado mientras se guarda.
  function cerrar() { if (!guardando) setAbierto(false); }

  function abrir() {
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    setDatos(ficha); setError(null); setAbierto(true);
  }

  // Foco dentro del diálogo al abrir, trampa de Tab, Escape, y restauración del foco al cerrar.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    const focusables = () => panel ? [...panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')] : [];
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); intentarCerrar(); return; }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prevFocus.current?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  async function guardar() {
    if (!(datos.nombre ?? "").trim()) { setError(t("El nombre es obligatorio.")); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ficha: datos }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setGuardando(false); }
  }

  const inp = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <>
      <button onClick={abrir} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        {t("Editar")}
      </button>

      {abierto && (
        <div role="dialog" aria-modal="true" aria-label={t("Editar cliente")} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) intentarCerrar(); }}>
          <div ref={panelRef} className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{t("Editar cliente")}</h2>
              <button onClick={cerrar} aria-label={t("Cerrar")} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {GRUPOS.map((g) => (
                <div key={g}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t(g)}</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {FICHA_CAMPOS.filter((c) => c.grupo === g).map((c) => (
                      <div key={c.k} className={c.w === "full" ? "sm:col-span-2" : ""}>
                        <label className="text-xs text-slate-500">{t(c.label)}</label>
                        {c.tipo === "sexo" || c.tipo === "estadoCivil" ? (
                          <select value={datos[c.k] ?? ""} onChange={(e) => set(c.k, e.target.value)} className={`${inp} bg-white`}>
                            {(c.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v, lab]) => <option key={v} value={v}>{t(lab)}</option>)}
                          </select>
                        ) : (
                          <input
                            type={c.tipo === "date" ? "date" : c.type ?? "text"}
                            inputMode={c.inputMode}
                            autoComplete={c.ac}
                            value={datos[c.k] ?? ""}
                            onChange={(e) => set(c.k, e.target.value)}
                            className={inp}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={cerrar} disabled={guardando} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{t("Cancelar")}</button>
              <button onClick={guardar} disabled={guardando} className="rounded-lg bg-aproba-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{guardando ? t("Guardando…") : t("Guardar cambios")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
