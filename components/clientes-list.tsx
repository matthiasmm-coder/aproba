"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";

export type Cli = { id: string; nombre: string; nacionalidad: string; expedientes: number; ultimo: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

export function ClientesList({ lista }: { lista: Cli[] }) {
  const t = useT();
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return lista;
    return lista.filter((c) => norm(c.nombre).includes(nq) || norm(c.nacionalidad).includes(nq));
  }, [q, lista]);

  return (
    <div>
      {/* Barre de recherche */}
      <div className="relative mb-4 max-w-sm">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Buscar por nombre o nacionalidad…")}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label={t("Borrar")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:flex">
          <span className="flex-1">{t("Cliente")}</span>
          <span className="w-32">{t("Nacionalidad")}</span>
          <span className="w-40">{t("Último trámite")}</span>
          <span className="w-20 text-right">{t("Exp.")}</span>
        </div>
        {filtrados.map((c) => (
          <Link key={c.id} href={`/app/clientes/${c.id}`} className="flex items-center border-b border-slate-50 px-5 py-3 transition last:border-0 hover:bg-cream-50">
            <span className="flex flex-1 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-xs font-semibold text-aproba-700">{initials(c.nombre)}</span>
              <span className="font-medium text-slate-800">{c.nombre}</span>
            </span>
            <span className="hidden w-32 text-sm text-slate-500 sm:block">{c.nacionalidad}</span>
            <span className="hidden w-40 truncate text-sm text-slate-500 sm:block">{t(c.ultimo)}</span>
            <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.expedientes}</span></span>
          </Link>
        ))}
        {filtrados.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-400">{t("Sin resultados para")} «{q}».</p>
        )}
      </div>
    </div>
  );
}
