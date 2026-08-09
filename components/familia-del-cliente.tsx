"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { PARENTESCOS, parentescoLabel } from "@/lib/familia";
import { TelefonoInput } from "@/components/telefono-input";

// Pie de la ficha de un cliente que YA pertenece a una familia: ver los miembros,
// añadir un cliente individual EXISTENTE o crear uno NUEVO dentro de la familia,
// quitar a un miembro (vuelve a ser individual) y eliminar (disolver) la familia.
// Las personas nunca se borran desde aquí.

export type MiembroFamilia = { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null };
export type IndividualDisponible = { id: string; nombre: string | null; apellidos: string | null };

export function FamiliaDelCliente({ clienteId, familiaId, familiaNombre, miembros, individuales, expFamiliares }: {
  clienteId: string;
  familiaId: string;
  familiaNombre: string;
  miembros: MiembroFamilia[];
  individuales: IndividualDisponible[];
  expFamiliares: number;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // id del miembro en curso, "add" o "delete"
  const [error, setError] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  const [addParentesco, setAddParentesco] = useState("CONYUGE");
  // Alta de un miembro que AÚN no es cliente: lo esencial aquí, el resto de la ficha
  // se completa después desde su propia página (no se pide un formulario entero).
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", email: "", telefono: "", parentesco: "HIJO" });
  const setN = (p: Partial<typeof nuevo>) => setNuevo((n) => ({ ...n, ...p }));

  const nombreDe = (m: { nombre: string | null; apellidos: string | null }) => `${m.nombre ?? ""} ${m.apellidos ?? ""}`.trim() || t("Sin nombre");

  async function anadir() {
    if (!addId) return;
    setBusy("add");
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${addId}/familia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, parentesco: addParentesco }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo añadir."));
      setAddId("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo añadir."));
    } finally {
      setBusy(null);
    }
  }

  async function crearMiembro() {
    if (!nuevo.nombre.trim()) return;
    setBusy("nuevo");
    setError(null);
    try {
      const res = await fetch(`/api/familias/${familiaId}/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo crear el cliente."));
      setNuevo({ nombre: "", apellidos: "", email: "", telefono: "", parentesco: "HIJO" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo crear el cliente."));
    } finally {
      setBusy(null);
    }
  }

  async function quitar(m: MiembroFamilia) {
    if (!(await confirmar({ mensaje: `${t("¿Quitar a")} ${nombreDe(m)} ${t("de la familia? Volverá a ser un cliente individual (no se borra).")}`, confirmarLabel: t("Quitar") }))) return;
    setBusy(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${m.id}/familia`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo quitar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo quitar."));
    } finally {
      setBusy(null);
    }
  }

  async function eliminar() {
    const aviso = expFamiliares > 0
      ? ` ${expFamiliares} ${expFamiliares === 1 ? t("expediente familiar pasará a ser individual de su solicitante.") : t("expedientes familiares pasarán a ser individuales de su solicitante.")}`
      : "";
    if (!(await confirmar({ mensaje: `${t("¿Eliminar la familia")} «${familiaNombre}»? ${t("Sus miembros volverán a ser clientes individuales (no se borra a nadie).")}${aviso}`, peligro: true, confirmarLabel: t("Eliminar familia") }))) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/familias/${familiaId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo eliminar."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Familia")}</h2>
      <p className="mt-1 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{familiaNombre}</span> · {miembros.length} {miembros.length === 1 ? t("miembro") : t("miembros")}
      </p>

      <ul className="mt-4 divide-y divide-slate-100">
        {miembros.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              {m.id === clienteId ? (
                <p className="truncate text-sm font-medium text-slate-800">{nombreDe(m)} <span className="text-slate-400">({t("esta ficha")})</span></p>
              ) : (
                <Link href={`/app/clientes/${m.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-aproba-700 hover:underline">{nombreDe(m)}</Link>
              )}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${m.parentesco === "TITULAR" ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {t(parentescoLabel(m.parentesco) || "—")}
            </span>
            {m.parentesco !== "TITULAR" && (
              <button
                type="button"
                onClick={() => quitar(m)}
                disabled={busy !== null}
                aria-label={`${t("Quitar a")} ${nombreDe(m)} ${t("de la familia")}`}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                {busy === m.id ? t("Quitando…") : t("Quitar")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Añadir un cliente individual EXISTENTE */}
      {individuales.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Añadir un cliente existente")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              aria-label={t("Cliente a añadir")}
              className="min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-aproba-600 sm:w-auto sm:flex-1"
            >
              <option value="">{t("Elige un cliente…")}</option>
              {individuales.map((c) => <option key={c.id} value={c.id}>{nombreDe(c)}</option>)}
            </select>
            <select
              value={addParentesco}
              onChange={(e) => setAddParentesco(e.target.value)}
              aria-label={t("Parentesco")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-aproba-600"
            >
              {PARENTESCOS.filter(([v]) => v !== "TITULAR").map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <button
              type="button"
              onClick={anadir}
              disabled={!addId || busy !== null}
              className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {busy === "add" ? t("Añadiendo…") : t("Añadir")}
            </button>
          </div>
        </div>
      )}

      {/* Crear un cliente NUEVO dentro de la familia (no hace falta darlo de alta
          aparte y volver). Solo lo esencial: su ficha se completa desde su página. */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Añadir un cliente nuevo")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={nuevo.nombre}
            onChange={(e) => setN({ nombre: e.target.value })}
            placeholder={t("Nombre *")}
            aria-label={t("Nombre del nuevo miembro")}
            className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
          />
          <input
            value={nuevo.apellidos}
            onChange={(e) => setN({ apellidos: e.target.value })}
            placeholder={t("Apellidos")}
            aria-label={t("Apellidos del nuevo miembro")}
            className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
          />
          <input
            type="email"
            value={nuevo.email}
            onChange={(e) => setN({ email: e.target.value })}
            placeholder={t("Email (opcional)")}
            aria-label={t("Email del nuevo miembro")}
            className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
          />
          <TelefonoInput
            value={nuevo.telefono}
            onChange={(v) => setN({ telefono: v })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600"
            labelPrefijo={t("Prefijo de país")}
            labelSinPrefijo={t("— Sin prefijo")}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={nuevo.parentesco}
            onChange={(e) => setN({ parentesco: e.target.value })}
            aria-label={t("Parentesco del nuevo miembro")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-aproba-600"
          >
            {PARENTESCOS.filter(([v]) => v !== "TITULAR").map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
          </select>
          <button
            type="button"
            onClick={crearMiembro}
            disabled={!nuevo.nombre.trim() || busy !== null}
            className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {busy === "nuevo" ? t("Creando…") : t("Crear y añadir")}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 border-t border-slate-100 pt-4 text-center">
        <button
          type="button"
          onClick={eliminar}
          disabled={busy !== null}
          className="text-sm font-semibold text-red-600 transition hover:text-red-700 hover:underline disabled:opacity-50"
        >
          {busy === "delete" ? t("Eliminando…") : t("Eliminar familia")}
        </button>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{t("Disuelve la familia: sus miembros vuelven a ser clientes individuales. No se borra a nadie.")}</p>
      </div>
    </div>
  );
}
