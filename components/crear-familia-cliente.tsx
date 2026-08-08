"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { TarjetaMiembro, nuevoMiembro, type Miembro } from "@/components/nuevo-cliente";
import { PARENTESCOS } from "@/lib/familia";

// Pie de la ficha de un cliente INDIVIDUAL: crear una familia a partir de él.
// El cliente pasa a ser el TITULAR; los miembros (opcionales) se crean con los datos
// esenciales vía POST /api/clientes/[id]/familia. Solo se monta si !familiaId.

export function CrearFamiliaCliente({ clienteId, nombreCompleto, apellidos, familias = [] }: {
  clienteId: string;
  nombreCompleto: string;
  apellidos: string;
  familias?: { id: string; nombre: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState<"crear" | "unir" | null>(null);
  const [unirId, setUnirId] = useState("");
  const [unirParentesco, setUnirParentesco] = useState("CONYUGE");
  const [nombreFamilia, setNombreFamilia] = useState("");
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<string | null>(null);

  const setMiembro = (key: string, patch: Partial<Miembro>) =>
    setMiembros((l) => l.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteId}/familia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreFamilia, miembros: miembros.map(({ key: _k, ...m }) => m) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo crear la familia."));
      if (Array.isArray(d.fallos) && d.fallos.length) {
        setError(`${t("Familia creada, pero estos miembros fallaron:")} ${d.fallos.join(" · ")}`);
      }
      setCreada(d.nombre as string);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo crear la familia."));
    } finally {
      setGuardando(false);
    }
  }

  async function unir() {
    if (!unirId) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clienteId}/familia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId: unirId, parentesco: unirParentesco }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo añadir a la familia."));
      setCreada(d.nombre as string);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo añadir a la familia."));
    } finally {
      setGuardando(false);
    }
  }

  if (creada) {
    return (
      <div className="mt-6 rounded-2xl border border-aproba-200 bg-aproba-50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-aproba-700">{t("Familia")}</h2>
        <p className="mt-1 text-sm text-aproba-800">
          ✓ {nombreCompleto} {t("ahora forma parte de")} <span className="font-semibold">{creada}</span>. {t("Los miembros aparecen agrupados en Clientes.")}
        </p>
        {error && <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Familia")}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {t("Convierte a este cliente en el titular de una familia: sus miembros quedan agrupados (expedientes, documentos compartidos y facturación familiar).")}
      </p>

      {abierto === null && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setAbierto("crear")}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            {t("Crear una familia con este cliente")}
          </button>
          {familias.length > 0 && (
            <button
              type="button"
              onClick={() => setAbierto("unir")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700"
            >
              {t("Añadir a una familia existente")}
            </button>
          )}
        </div>
      )}

      {abierto === "unir" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={unirId}
              onChange={(e) => setUnirId(e.target.value)}
              aria-label={t("Familia de destino")}
              className="min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-aproba-600 sm:w-auto sm:flex-1"
            >
              <option value="">{t("Elige una familia…")}</option>
              {familias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
            <select
              value={unirParentesco}
              onChange={(e) => setUnirParentesco(e.target.value)}
              aria-label={t("Parentesco")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-aproba-600"
            >
              {PARENTESCOS.filter(([v]) => v !== "TITULAR").map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={unir}
              disabled={!unirId || guardando}
              className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {guardando ? t("Añadiendo…") : t("Añadir a la familia")}
            </button>
            <button
              onClick={() => { setAbierto(null); setError(null); }}
              disabled={guardando}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900 disabled:opacity-50"
            >
              {t("Cancelar")}
            </button>
          </div>
        </div>
      )}

      {abierto === "crear" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">{t("Nombre de la familia")}</label>
              <input
                value={nombreFamilia}
                onChange={(e) => setNombreFamilia(e.target.value)}
                placeholder={apellidos.trim() ? `${t("Familia")} ${apellidos.trim()}` : t("Familia García")}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
              />
              <p className="mt-1 text-xs text-slate-400">{t("Si lo dejas vacío, se usan los apellidos del titular.")}</p>
            </div>
          </div>

          {/* El titular es ESTE cliente — fijo */}
          <div className="flex items-center gap-2.5 rounded-xl border border-aproba-100 bg-aproba-50/60 px-4 py-3">
            <span className="rounded-full bg-aproba-600 px-2.5 py-1 text-xs font-semibold text-white">{t("Titular")}</span>
            <span className="text-sm font-semibold text-slate-900">{nombreCompleto}</span>
          </div>

          {miembros.map((m) => (
            <TarjetaMiembro
              key={m.key}
              m={m}
              titular={false}
              onPatch={(patch) => setMiembro(m.key, patch)}
              onQuitar={() => setMiembros((l) => l.filter((x) => x.key !== m.key))}
            />
          ))}

          <button
            type="button"
            onClick={() => setMiembros((l) => [...l, nuevoMiembro(l.length === 0 ? "CONYUGE" : "HIJO")])}
            className="text-sm font-semibold text-aproba-700 hover:underline"
          >
            {t("+ Añadir miembro")}
          </button>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={crear}
              disabled={guardando}
              className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
            >
              {guardando ? t("Creando…") : t("Crear familia")}
            </button>
            <button
              onClick={() => { setAbierto(null); setError(null); }}
              disabled={guardando}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900 disabled:opacity-50"
            >
              {t("Cancelar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
