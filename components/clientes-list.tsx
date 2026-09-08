"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parentescoLabel } from "@/lib/familia";
import { useT } from "@/components/lang-provider";

export type CliMiembro = { id: string; nombre: string; parentesco: string | null; nacionalidad: string; expedientes: number; oficinaId?: string | null };
// miembros presente → entrée FAMILLE (dépliable), sinon client individuel.
// empresa: true → entrée EMPRESA (sus miembros son los trabajadores; `nacionalidad` lleva el CIF).
export type Cli = { id: string; nombre: string; nacionalidad: string; expedientes: number; ultimo: string; miembros?: CliMiembro[]; oficinaId?: string | null; empresa?: boolean };
export type OficinaLite = { id: string; nombre: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

function EmpIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01" /></svg>;
}
function FamIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>;
}

export function ClientesList({ lista, oficinas = [] }: { lista: Cli[]; oficinas?: OficinaLite[] }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  type Pestana = "individuales" | "familias" | "empresas";
  const [pestana, setPestana] = useState<Pestana>("individuales");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  // Multi-oficina : sélection multiple pour réaffecter en masse. N'existe qu'à partir
  // de DEUX sedes — un cabinet mono-oficina ne voit ni cases ni barre (avec `> 0` il les
  // voyait, puisque la gestoría elle-même compte comme oficina depuis la refonte).
  const multi = oficinas.length >= 2;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [moviendo, setMoviendo] = useState(false);
  const [errorMover, setErrorMover] = useState<string | null>(null);
  const nombreOficina = (id: string | null | undefined) => oficinas.find((o) => o.id === id)?.nombre ?? null;

  const marcar = (ids: string[], on: boolean) => setSel((s) => {
    const n = new Set(s);
    for (const id of ids) { if (on) n.add(id); else n.delete(id); }
    return n;
  });

  async function mover() {
    setErrorMover(null);
    setMoviendo(true);
    const res = await fetch("/api/clientes/oficina", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteIds: [...sel], oficinaId: destino || null }),
    });
    const d = await res.json().catch(() => ({}));
    setMoviendo(false);
    if (!res.ok) { setErrorMover(String(d.error ?? t("No se pudo mover."))); return; }
    setSel(new Set());
    router.refresh();
  }

  // Una entrada con `miembros` ES una familia (lo decide la página al agrupar) — o una
  // empresa, si además lleva `empresa` (sus miembros son los trabajadores).
  const casa = (c: Cli): Pestana => (c.empresa ? "empresas" : c.miembros ? "familias" : "individuales");

  const coincide = (c: Cli, nq: string) =>
    !nq ||
    norm(c.nombre).includes(nq) || norm(c.nacionalidad).includes(nq) ||
    // Una familia coincide también por el nombre de SUS MIEMBROS.
    (c.miembros ?? []).some((m) => norm(m.nombre).includes(nq) || norm(m.nacionalidad).includes(nq));

  const { filtrados, nOtra, otraPestana, totales } = useMemo(() => {
    const nq = norm(q.trim());
    const coincidencias = lista.filter((c) => coincide(c, nq));
    // Cuántos resultados hay en OTRA pestaña: buscar «García» estando en
    // Individuales y no ver nada, cuando existe la familia García, sería un
    // callejón sin salida — se ofrece saltar a la primera pestaña con resultados.
    const otras = (["individuales", "familias", "empresas"] as Pestana[]).filter((p) => p !== pestana);
    const otraPestana = otras.find((p) => coincidencias.some((c) => casa(c) === p)) ?? null;
    return {
      filtrados: coincidencias.filter((c) => casa(c) === pestana),
      nOtra: otraPestana ? coincidencias.filter((c) => casa(c) === otraPestana).length : 0,
      otraPestana,
      totales: {
        individuales: lista.filter((c) => casa(c) === "individuales").length,
        familias: lista.filter((c) => casa(c) === "familias").length,
        empresas: lista.filter((c) => casa(c) === "empresas").length,
      },
    };
  }, [q, lista, pestana]);

  const toggle = (id: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const pest = (id: Pestana, etiqueta: string, n: number) => (
    <button
      type="button"
      onClick={() => setPestana(id)}
      aria-current={pestana === id}
      className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-semibold transition ${
        pestana === id ? "border-aproba-600 text-aproba-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {etiqueta} <span className={pestana === id ? "text-aproba-500" : "text-slate-400"}>({n})</span>
    </button>
  );

  return (
    <div>
      {/* Pestañas: los clientes individuales y las familias no se buscan igual */}
      <div className="mb-4 flex gap-5 border-b border-slate-200">
        {pest("individuales", t("Clientes individuales"), totales.individuales)}
        {pest("familias", t("Familias"), totales.familias)}
        {/* La pestaña Empresas solo aparece cuando el despacho tiene alguna: no todos trabajan con empresas. */}
        {(totales.empresas > 0 || pestana === "empresas") && pest("empresas", t("Empresas"), totales.empresas)}
      </div>

      {/* Barre de recherche */}
      <div className="relative mb-4 max-w-sm">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Buscar por nombre o nacionalidad…")}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-9 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label={t("Borrar")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Barre d'action de la sélection (multi-oficina). Collante : sur 187 clients,
          on coche en bas de liste et le bouton doit rester atteignable. */}
      {multi && sel.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-aproba-200 bg-aproba-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-aproba-800">
            {sel.size} {sel.size === 1 ? t("cliente seleccionado") : t("clientes seleccionados")}
          </span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            aria-label={t("Mover a la oficina")}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
          >
            <option value="">{t("Sin oficina")}</option>
            {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <button
            type="button" onClick={mover} disabled={moviendo}
            className="rounded-lg bg-aproba-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
          >
            {moviendo ? t("Moviendo…") : t("Mover")}
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="text-sm text-slate-500 underline-offset-2 hover:underline">
            {t("Cancelar")}
          </button>
          <span className="w-full text-xs text-slate-500">{t("Sus expedientes se moverán también.")}</span>
          {errorMover && <span className="w-full text-sm text-red-600">{errorMover}</span>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:flex">
          <span className="flex-1">{pestana === "familias" ? t("Familia") : pestana === "empresas" ? t("Empresa") : t("Cliente")}</span>
          <span className="w-32">{pestana === "empresas" ? t("CIF / NIF") : t("Nacionalidad")}</span>
          <span className="w-40">{t("Último trámite")}</span>
          <span className="w-20 text-right">{t("Exp.")}</span>
        </div>
        {filtrados.map((c) => {
          if (!c.miembros) {
            const ofi = nombreOficina(c.oficinaId);
            return (
              // La case à cocher vit HORS du <Link> : dedans, cocher naviguerait.
              <div key={c.id} className="flex items-center border-b border-slate-50 last:border-0 hover:bg-cream-50">
                {multi && (
                  <label className="flex cursor-pointer items-center py-3 pl-5 pr-1" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(c.id)} onChange={(e) => marcar([c.id], e.target.checked)}
                      aria-label={`${t("Seleccionar")} ${c.nombre}`}
                      className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  </label>
                )}
                <Link href={`/app/clientes/${c.id}`} className={`flex flex-1 items-center py-3 pr-5 transition ${multi ? "pl-2" : "pl-5"}`}>
                  <span className="flex flex-1 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-xs font-semibold text-aproba-700">{initials(c.nombre)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{c.nombre}</span>
                      {multi && <span className="block text-[11px] text-slate-400">{ofi ?? t("Sin oficina")}</span>}
                    </span>
                  </span>
                  <span className="hidden w-32 text-sm text-slate-500 sm:block">{c.nacionalidad}</span>
                  <span className="hidden w-40 truncate text-sm text-slate-500 sm:block">{t(c.ultimo)}</span>
                  <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.expedientes}</span></span>
                </Link>
              </div>
            );
          }
          // Entrée FAMILLE (ou EMPRESA) : une ligne, dépliable vers ses membres.
          const esEmp = Boolean(c.empresa);
          const abierta = abiertas.has(c.id) || Boolean(q.trim()); // recherche active → membres visibles
          const idsFam = c.miembros.map((m) => m.id);
          const todosMarcados = idsFam.length > 0 && idsFam.every((id) => sel.has(id));
          return (
            <div key={c.id} className="border-b border-slate-50 last:border-0">
              {multi && (
                // Cocher une famille = cocher TOUS ses membres : c'est eux qui portent
                // l'oficina, la famille n'est qu'un regroupement.
                <label className="flex cursor-pointer items-center pl-5 pt-3">
                  <input type="checkbox" checked={todosMarcados}
                    onChange={(e) => marcar(idsFam, e.target.checked)}
                    aria-label={`${esEmp ? t("Seleccionar la empresa") : t("Seleccionar la familia")} ${c.nombre}`}
                    className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  <span className="ml-2 text-[11px] text-slate-400">{esEmp ? t("Toda la empresa") : t("Toda la familia")}</span>
                </label>
              )}
              <button onClick={() => toggle(c.id)} className="flex w-full items-center px-5 py-3 text-left transition hover:bg-cream-50" aria-expanded={abierta}>
                <span className="flex flex-1 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-aproba-700">{esEmp ? <EmpIcon className="h-4 w-4" /> : <FamIcon className="h-4 w-4" />}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{c.nombre}</span>
                    <span className="block text-xs text-slate-400">{c.miembros.length} {esEmp ? (c.miembros.length === 1 ? t("trabajador") : t("trabajadores")) : (c.miembros.length === 1 ? t("miembro") : t("miembros"))}</span>
                  </span>
                  <svg className={`h-4 w-4 shrink-0 text-slate-300 transition ${abierta ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </span>
                <span className="hidden w-32 text-sm text-slate-500 sm:block">{c.nacionalidad}</span>
                <span className="hidden w-40 truncate text-sm text-slate-500 sm:block">{t(c.ultimo)}</span>
                <span className="w-20 text-right"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{c.expedientes}</span></span>
              </button>
              {abierta && c.miembros.map((m) => (
                <div key={m.id} className="flex items-center border-t border-slate-50 bg-cream-50/40 hover:bg-cream-50">
                {multi && (
                  <label className="flex cursor-pointer items-center py-2.5 pl-6 pr-1">
                    <input type="checkbox" checked={sel.has(m.id)} onChange={(e) => marcar([m.id], e.target.checked)}
                      aria-label={`${t("Seleccionar")} ${m.nombre}`}
                      className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  </label>
                )}
                <Link href={`/app/clientes/${m.id}`} className={`flex flex-1 items-center py-2.5 pr-5 transition ${multi ? "pl-4" : "pl-12"}`}>
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
                </div>
              ))}
            </div>
          );
        })}
        {filtrados.length === 0 && (
          q.trim() ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400">{t("Sin resultados para")} «{q}»{pestana === "familias" ? ` ${t("en Familias")}` : pestana === "empresas" ? ` ${t("en Empresas")}` : ` ${t("en Clientes individuales")}`}.</p>
              {/* Callejón sin salida evitado: si lo buscado está en otra pestaña, se ofrece ir. */}
              {nOtra > 0 && otraPestana && (
                <button
                  type="button"
                  onClick={() => setPestana(otraPestana)}
                  className="mt-2 text-sm font-semibold text-aproba-700 hover:underline"
                >
                  {nOtra === 1 ? t("Hay 1 resultado en") : `${t("Hay")} ${nOtra} ${t("resultados en")}`}{" "}
                  {otraPestana === "familias" ? t("Familias") : otraPestana === "empresas" ? t("Empresas") : t("Clientes individuales")} →
                </button>
              )}
            </div>
          ) : pestana === "familias" ? (
            <div className="px-5 py-12 text-center">
              <p className="text-3xl">👨‍👩‍👧</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">{t("Todavía no tienes familias")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("Agrupa a varios clientes en una familia: expedientes juntos, documentos compartidos y una sola factura. Se crea desde «Nuevo cliente» o desde la ficha de un cliente.")}</p>
              <Link href="/app/clientes/nuevo" className="mt-4 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nueva familia")}</Link>
            </div>
          ) : pestana === "empresas" ? (
            <div className="px-5 py-12 text-center">
              <p className="text-3xl">🏢</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">{t("Todavía no tienes empresas")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("Cuando tu cliente es una empresa que contrata a un trabajador extranjero: la empresa figura en la hoja de encargo y en las facturas, y el expediente se abre a nombre del trabajador. Se crea desde «Nuevo cliente» o «Nuevo expediente».")}</p>
              <Link href="/app/clientes/nuevo?modo=empresa" className="mt-4 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nueva empresa")}</Link>
            </div>
          ) : (
            // Día 1: sin clientes ≠ búsqueda sin resultados — aquí toca invitar, no un «para ""».
            <div className="px-5 py-12 text-center">
              <p className="text-3xl">👋</p>
              <p className="mt-3 text-sm font-semibold text-slate-700">{t("Añade tu primer cliente")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("Cada cliente guarda su ficha, sus documentos y sus expedientes. También puedes importarlos desde un CSV.")}</p>
              <Link href="/app/clientes/nuevo" className="mt-4 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("+ Nuevo cliente")}</Link>
            </div>
          )
        )}
      </div>
    </div>
  );
}
