"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PARENTESCOS, parentescoLabel } from "@/lib/familia";
import { EditarCliente } from "@/components/editar-cliente";
import type { FamiliaMiembro } from "@/lib/data/familias";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// MODO INTERNO familia: el gestor gestiona los miembros desde la ficha del expediente —
// añadir (cónyuge, hijos…), parentesco, marcar SOLICITANTES (un juego de formularios por
// solicitante) y editar la ficha de cada uno (modal reutilizado de la ficha del cliente).
// Antes esto solo podía hacerse desde el portal del cliente: la esposa de un expediente
// sin enlace enviado no podía ni existir → sus formularios no se generaban.
export function MiembrosFamiliaGestor({ familiaId, titularId, miembros }: {
  familiaId: string; titularId: string | null; miembros: FamiliaMiembro[];
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // clienteId en curso (o "nuevo")
  const [error, setError] = useState<string | null>(null);
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", parentesco: "CONYUGE", esSolicitante: true });

  async function llamar(metodo: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, quien: string) {
    setBusy(quien); setError(null);
    try {
      const res = await fetch(`/api/familias/${familiaId}/miembros`, {
        method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
      return false;
    } finally { setBusy(null); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <ul className="divide-y divide-slate-100">
        {miembros.map((m) => {
          const esTitular = m.id === titularId;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 first:pt-0">
              <select
                value={m.parentesco ?? "OTRO"}
                onChange={(e) => llamar("PATCH", { clienteId: m.id, parentesco: e.target.value }, m.id)}
                disabled={busy === m.id}
                aria-label={t("Parentesco")}
                className="rounded-md border border-slate-200 bg-cream-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 outline-none focus:border-aproba-600 disabled:opacity-60"
              >
                {PARENTESCOS.map(([k]) => <option key={k} value={k}>{t(parentescoLabel(k))}</option>)}
              </select>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {m.nombre || <span className="italic text-slate-400">{t("Sin nombre")}</span>}
                {esTitular && <span className="ml-2 rounded-full bg-aproba-100 px-2 py-0.5 text-[10px] font-semibold text-aproba-700">{t("Titular")}</span>}
              </span>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={m.esSolicitante}
                  disabled={busy === m.id}
                  onChange={(e) => llamar("PATCH", { clienteId: m.id, esSolicitante: e.target.checked }, m.id)}
                  className="h-3.5 w-3.5 accent-aproba-600"
                />
                {t("Solicitante")}
              </label>
              <EditarCliente clienteId={m.id} ficha={m.ficha} />
              {!esTitular && (
                <button
                  onClick={async () => { if (await confirmar({ mensaje: t("¿Quitar a este miembro de la familia?"), peligro: true, confirmarLabel: t("Quitar") })) void llamar("DELETE", { clienteId: m.id }, m.id); }}
                  disabled={busy === m.id}
                  aria-label={t("Quitar miembro")}
                  title={t("Quitar miembro")}
                  className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] text-slate-400">{t("Los formularios EX se generan para cada miembro marcado como solicitante.")}</p>

      {abrirAlta ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-cream-50/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} placeholder={t("Nombre")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" />
            <input value={nuevo.apellidos} onChange={(e) => setNuevo((n) => ({ ...n, apellidos: e.target.value }))} placeholder={t("Apellidos")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select value={nuevo.parentesco} onChange={(e) => setNuevo((n) => ({ ...n, parentesco: e.target.value }))} aria-label={t("Parentesco")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-aproba-600">
              {PARENTESCOS.filter(([k]) => k !== "TITULAR").map(([k]) => <option key={k} value={k}>{t(parentescoLabel(k))}</option>)}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={nuevo.esSolicitante} onChange={(e) => setNuevo((n) => ({ ...n, esSolicitante: e.target.checked }))} className="h-3.5 w-3.5 accent-aproba-600" />
              {t("Solicitante")}
            </label>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setAbrirAlta(false)} disabled={busy === "nuevo"} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
              <button
                onClick={async () => {
                  if (!nuevo.nombre.trim()) { setError(t("El nombre es obligatorio.")); return; }
                  const ok = await llamar("POST", nuevo, "nuevo");
                  if (ok) { setAbrirAlta(false); setNuevo({ nombre: "", apellidos: "", parentesco: "CONYUGE", esSolicitante: true }); }
                }}
                disabled={busy === "nuevo"}
                className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
              >
                {busy === "nuevo" ? t("Guardando…") : t("Añadir")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => { setError(null); setAbrirAlta(true); }} className="mt-2 text-sm font-semibold text-aproba-700 hover:underline">
          {t("+ Añadir miembro")}
        </button>
      )}

      {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
