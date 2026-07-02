"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parentescoLabel } from "@/lib/familia";
import { useT } from "@/components/lang-provider";

export type CliMiembro = { id: string; nombre: string; parentesco: string | null; nacionalidad: string; expedientes: number };
// miembros presente → entrée FAMILLE (dépliable), sinon client individuel.
export type Cli = { id: string; nombre: string; nacionalidad: string; expedientes: number; ultimo: string; miembros?: CliMiembro[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

function FamIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>;
}

export function ClientesList({ lista }: { lista: Cli[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return lista;
    // Une famille matche aussi par le nom de SES MEMBRES.
    return lista.filter((c) =>
      norm(c.nombre).includes(nq) || norm(c.nacionalidad).includes(nq) ||
      (c.miembros ?? []).some((m) => norm(m.nombre).includes(nq) || norm(m.nacionalidad).includes(nq)),
    );
  }, [q, lista]);

  const toggle = (id: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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
        {filtrados.map((c) => {
          if (!c.miembros) {
            return (
              <Link key={c.id} href={`/app/clientes/${c.id}`} className="flex items-center border-b border-slate-50 px-5 py-3 transition last:border-0 hover:bg-cream-50">
                <span className="flex flex-1 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-xs font-semibold text-aproba-700">{initials(c.nombre)}</span>
                  <span className="font-medium text-slate-800">{c.nombre}</span>
                </span>
                <span className="hidden w-32 text-sm text-slate-500 sm:block">{c.nacionalidad}</span>
                <span className="hidden w-40 truncate text-sm text-slate-500 sm:block">{t(c.ultimo)}</span>
                <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.expedientes}</span></span>
              </Link>
            );
          }
          // Entrée FAMILLE : une ligne, dépliable vers ses membres.
          const abierta = abiertas.has(c.id) || Boolean(q.trim()); // recherche active → membres visibles
          return (
            <div key={c.id} className="border-b border-slate-50 last:border-0">
              <button onClick={() => toggle(c.id)} className="flex w-full items-center px-5 py-3 text-left transition hover:bg-cream-50" aria-expanded={abierta}>
                <span className="flex flex-1 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-aproba-700"><FamIcon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{c.nombre}</span>
                    <span className="block text-xs text-slate-400">{c.miembros.length} {c.miembros.length === 1 ? t("miembro") : t("miembros")}</span>
                  </span>
                  <svg className={`h-4 w-4 shrink-0 text-slate-300 transition ${abierta ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </span>
                <span className="hidden w-32 text-sm text-slate-500 sm:block">{c.nacionalidad}</span>
                <span className="hidden w-40 truncate text-sm text-slate-500 sm:block">{t(c.ultimo)}</span>
                <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.expedientes}</span></span>
              </button>
              {abierta && c.miembros.map((m) => (
                <Link key={m.id} href={`/app/clientes/${m.id}`} className="flex items-center border-t border-slate-50 bg-cream-50/40 py-2.5 pl-12 pr-5 transition hover:bg-cream-50">
                  <span className="flex flex-1 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-aproba-700 ring-1 ring-aproba-100">{initials(m.nombre)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-700">{m.nombre}</span>
                      {m.parentesco && <span className="block text-[11px] uppercase tracking-wide text-slate-400">{parentescoLabel(m.parentesco)}</span>}
                    </span>
                  </span>
                  <span className="hidden w-32 text-sm text-slate-500 sm:block">{m.nacionalidad}</span>
                  <span className="hidden w-40 sm:block" />
                  <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{m.expedientes}</span></span>
                </Link>
              ))}
            </div>
          );
        })}
        {filtrados.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-400">{t("Sin resultados para")} «{q}».</p>
        )}
      </div>
    </div>
  );
}
