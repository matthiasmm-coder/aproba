"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PARENTESCOS } from "@/lib/familia";
import { useT } from "@/components/lang-provider";

type Cli = { id: string; nombre: string; apellidos: string | null; familiaId: string | null };

// Añade un CLIENTE EXISTENTE (aún sin familia) a esta familia, con su parentesco.
export function AnadirMiembro({ familiaId }: { familiaId: string }) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Cli | null>(null);
  const [parentesco, setParentesco] = useState("HIJO");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    (async () => {
      const sb = createSupabaseBrowser();
      const { data } = await sb.from("Cliente").select("id, nombre, apellidos, familiaId").order("nombre");
      setClientes((data ?? []) as Cli[]);
    })();
  }, [abierto]);

  const matches = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (nq.length < 1) return [];
    return clientes.filter((c) => !c.familiaId && `${c.nombre} ${c.apellidos ?? ""}`.toLowerCase().includes(nq)).slice(0, 6);
  }, [q, clientes]);

  async function anadir() {
    if (!sel) return;
    setGuardando(true);
    setError(null);
    try {
      const sb = createSupabaseBrowser();
      const { error } = await sb.from("Cliente").update({ familiaId, parentesco }).eq("id", sel.id);
      if (error) throw new Error(error.message);
      setSel(null); setQ(""); setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo añadir el miembro."));
    } finally {
      setGuardando(false);
    }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} className="mt-4 text-sm font-semibold text-aproba-700 hover:underline">+ {t("Añadir un cliente existente a la familia")}</button>;
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-cream-50/60 p-4">
      <p className="mb-2 text-sm font-semibold text-slate-800">{t("Añadir un miembro")}</p>
      {sel ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-800">{sel.nombre} {sel.apellidos}</span>
          <select value={parentesco} onChange={(e) => setParentesco(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-aproba-600">
            {PARENTESCOS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
          </select>
          <button onClick={anadir} disabled={guardando} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{guardando ? t("Añadiendo…") : t("Añadir")}</button>
          <button onClick={() => setSel(null)} className="text-sm text-slate-400 hover:text-slate-600">{t("Cambiar")}</button>
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar un cliente…")} className={inp} autoFocus />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {matches.map((c) => (
                <button key={c.id} onClick={() => setSel(c)} className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{c.nombre} {c.apellidos}</button>
              ))}
            </div>
          )}
          {q.trim().length >= 1 && matches.length === 0 && <p className="mt-2 text-xs text-slate-400">{t("Sin resultados (los clientes ya en una familia no aparecen).")}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <button onClick={() => { setAbierto(false); setSel(null); setQ(""); }} className="mt-3 block text-xs text-slate-400 hover:text-slate-600">{t("Cerrar")}</button>
    </div>
  );
}
