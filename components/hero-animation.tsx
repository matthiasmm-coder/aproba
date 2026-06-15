"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";

// Animation héro — un iPad qui recorre la interfaz admin del gestor,
// cambiando de pestaña automáticamente (Expedientes → Clientes → Facturas → Ajustes).
// Les contenus reproduisent fidèlement les vrais écrans : board-client.tsx (colonnes +
// pills ESTADO_META), la table clientes, lib/facturas.ts (états Pagada/Emitida/Vencida),
// et ajustes/servicios-manager.tsx (toggles + anticipo/resto).

const TABS = [
  { label: "Expedientes", icon: "board" },
  { label: "Clientes", icon: "users" },
  { label: "Facturas", icon: "invoice" },
  { label: "Ajustes", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  const c = "h-3.5 w-3.5";
  if (name === "board") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>;
  if (name === "users") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>;
  if (name === "invoice") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// Pills d'état — reprises de ESTADO_META (lib/types.ts) et FACTURA_ESTADO_META (lib/facturas.ts).
function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${cls}`}>{children}</span>;
}

function Avatar({ txt }: { txt: string }) {
  return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[8px] font-semibold text-aproba-700">{txt}</span>;
}

// ── Contenu par onglet ──────────────────────────────────────────────

// Expedientes : kanban fidèle à board-client.tsx — colonnes ESTADO_META + cartes
// (referencia mono, nom, trámite · nacionalidad, X/Y docs validados, avatar).
function Expedientes() {
  const cols = [
    {
      label: "Docs pendientes", dot: "bg-amber-500",
      cards: [
        { ref: "EXP-2026-0051", n: "Karim Benali", t: "Renovación de TIE · Marruecos", docs: "1/3", who: "MR", venc: "18/06" },
        { ref: "EXP-2026-0049", n: "Samuel Okafor", t: "Asignación de NIE · Nigeria", docs: "0/1", who: "LT" },
      ],
    },
    {
      label: "Docs validados", dot: "bg-aproba-500",
      cards: [
        { ref: "EXP-2026-0042", n: "Julia Mendoza", t: "Arraigo social · Colombia", docs: "4/4", who: "MR", venc: "20/06" },
      ],
    },
    {
      label: "Formularios listos", dot: "bg-blue-500",
      cards: [
        { ref: "EXP-2026-0040", n: "Liu Wei", t: "Reagrupación familiar · China", docs: "4/4", who: "MR" },
      ],
    },
  ];
  return (
    <div>
      <Head title="Expedientes" sub="3 activos" cta="+ Nuevo expediente" />
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.label}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
              <span className="text-[8px] font-semibold text-slate-700">{c.label}</span>
              <span className="text-[7px] text-slate-400">{c.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {c.cards.map((card) => (
                <div key={card.ref} className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[7px] text-slate-400">{card.ref}</span>
                    {card.venc && <span className="rounded bg-amber-50 px-1 py-0.5 text-[6.5px] font-medium text-amber-700">⏱ {card.venc}</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] font-semibold text-slate-900">{card.n}</p>
                  <p className="truncate text-[7.5px] text-slate-500">{card.t}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[7px] text-slate-500">{card.docs} docs validados</span>
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-aproba-100 text-[6.5px] font-semibold text-aproba-700">{card.who}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Clientes : table fidèle — avatar initiales, nom, nacionalidad, nº expedientes.
function Clientes() {
  const rows = [
    { n: "Julia Mendoza", p: "Colombia", i: "JM", x: "1" },
    { n: "Karim Benali", p: "Marruecos", i: "KB", x: "2" },
    { n: "Liu Wei", p: "China", i: "LW", x: "1" },
    { n: "Aïcha Diallo", p: "Senegal", i: "AD", x: "1" },
    { n: "Oksana Koval", p: "Ucrania", i: "OK", x: "1" },
  ];
  return (
    <div>
      <Head title="Clientes" sub="5 clientes" cta="+ Cliente" />
      <div className="relative mb-2">
        <svg className="absolute left-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <div className="rounded-md border border-slate-300 bg-white py-1 pl-6 pr-2 text-[8px] text-slate-400">Buscar cliente, nacionalidad…</div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r, i) => (
          <div key={r.n} className={`flex items-center gap-2 px-2.5 py-1.5 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <Avatar txt={r.i} />
            <span className="flex-1 text-[9px] font-medium text-slate-800">{r.n}</span>
            <span className="text-[8px] text-slate-400">{r.p}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium text-slate-500">{r.x}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Facturas : KPI mensuel + table fidèle à lib/facturas.ts (numéro, cliente, total IVA inc., état).
function Facturas() {
  const rows = [
    { id: "2026-0048", c: "Julia Mendoza", v: "423,50 €", s: "Emitida", cls: "bg-amber-100 text-amber-700" },
    { id: "2026-0047", c: "Liu Wei", v: "508,20 €", s: "Emitida", cls: "bg-amber-100 text-amber-700" },
    { id: "2026-0046", c: "Aïcha Diallo", v: "423,50 €", s: "Pagada", cls: "bg-aproba-100 text-aproba-700" },
    { id: "2026-0044", c: "Oksana Koval", v: "726,00 €", s: "Pagada", cls: "bg-aproba-100 text-aproba-700" },
    { id: "2026-0043", c: "Fatima El Amrani", v: "217,80 €", s: "Vencida", cls: "bg-red-100 text-red-700" },
  ];
  return (
    <div>
      <Head title="Facturas" cta="+ Factura" />
      <div className="mb-2 flex gap-2">
        <div className="flex-1 rounded-lg bg-aproba-50 px-2.5 py-1.5">
          <p className="text-[8px] text-aproba-700">Cobrado este mes</p>
          <p className="text-[12px] font-bold tracking-tightest text-aproba-700">1.149,50 €</p>
        </div>
        <div className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5">
          <p className="text-[8px] text-slate-400">Pendiente de cobro</p>
          <p className="text-[12px] font-bold tracking-tightest text-slate-700">931,70 €</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <span className="font-mono text-[8px] text-slate-400">{r.id}</span>
            <span className="flex-1 truncate text-[9px] font-medium text-slate-800">{r.c}</span>
            <span className="text-[9px] font-semibold tabular-nums text-slate-700">{r.v}</span>
            <Pill cls={r.cls}>{r.s}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

// Toggle fidèle au servicios-manager (rail vert + pastille blanche).
function MiniToggle({ on = true }: { on?: boolean }) {
  return (
    <span className={`relative h-3 w-5 shrink-0 rounded-full ${on ? "bg-aproba-600" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-2 w-2 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </span>
  );
}

function MenuIcon({ name }: { name: "services" | "bell" | "building" }) {
  const c = "h-2.5 w-2.5";
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name === "building") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 7V5h6v2"/></svg>;
}

function CollapsedMenu({ icon, label, sub }: { icon: "bell" | "building"; label: string; sub: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-aproba-50 text-aproba-700"><MenuIcon name={icon} /></span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold text-slate-800">{label}</p>
        <p className="truncate text-[7px] text-slate-400">{sub}</p>
      </div>
      <svg className="ml-auto h-2.5 w-2.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </div>
  );
}

// Ajustes : section "Servicios" ouverte (servicios-manager.tsx) — toggle + anticipo/resto
// (Al firmar + Al finalizar) + total, et sections pliées Notificaciones / Despacho.
function Ajustes() {
  const servicios = [
    { label: "Arraigo social", a: "150 €", b: "200 €", on: true },
    { label: "Renovación de TIE", a: "80 €", b: "100 €", on: true },
    { label: "Reagrupación familiar", a: "200 €", b: "220 €", on: true },
    { label: "Nacionalidad española", a: "300 €", b: "300 €", on: true },
    { label: "Asignación de NIE", a: "90 €", b: "—", on: false },
  ];
  return (
    <div>
      <Head title="Ajustes" sub="Servicios, avisos y datos del despacho" />
      {/* Section Servicios ouverte */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-aproba-50 text-aproba-700"><MenuIcon name="services" /></span>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-slate-800">Servicios</p>
            <p className="truncate text-[7px] text-slate-400">Trámites, pagos y documentos que pide cada uno</p>
          </div>
          <span className="ml-auto mr-1 text-[6.5px] font-medium uppercase tracking-wide text-slate-400">firma · final</span>
          <svg className="h-2.5 w-2.5 rotate-180 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div className="divide-y divide-slate-100">
          {servicios.map((s) => (
            <div key={s.label} className={`flex items-center gap-1.5 px-2.5 py-1.5 ${s.on ? "" : "bg-slate-50/60"}`}>
              <span className={`flex-1 truncate text-[9px] font-medium ${s.on ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
              <span className="text-[8px] tabular-nums text-slate-500">{s.a}</span>
              <span className="text-[8px] text-slate-300">+</span>
              <span className="text-[8px] tabular-nums text-slate-500">{s.b}</span>
              <MiniToggle on={s.on} />
            </div>
          ))}
        </div>
      </div>
      {/* Sections pliées (fidèles aux AjustesSection) */}
      <CollapsedMenu icon="bell" label="Notificaciones al cliente" sub="Avisos automáticos por WhatsApp o email" />
      <CollapsedMenu icon="building" label="Despacho y cuenta" sub="Datos de tu gestoría y de tu usuario" />
    </div>
  );
}

function Head({ title, sub, cta }: { title: string; sub?: string; cta?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <div>
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">{title}</span>
        {sub && <p className="text-[7.5px] text-slate-500">{sub}</p>}
      </div>
      {cta && <span className="rounded-md bg-aproba-600 px-2 py-1 text-[8px] font-semibold text-white">{cta}</span>}
    </div>
  );
}

const CONTENT = [Expedientes, Clientes, Facturas, Ajustes];

export function HeroAnimation() {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTab((x) => (x + 1) % TABS.length), 2800);
    return () => clearInterval(t);
  }, []);

  const Active = CONTENT[tab];

  return (
    <div className="relative mx-auto flex h-[420px] w-full items-center justify-center">
      {/* halo ambiant */}
      <div className="pointer-events-none absolute h-80 w-96 rounded-full bg-aproba-100/50 blur-3xl" />

      {/* iPad */}
      <div className="relative w-full max-w-[470px] animate-floaty">
        <div className="relative rounded-[1.7rem] border border-slate-700/40 bg-slate-900 p-3 shadow-float">
          {/* caméra */}
          <div className="absolute left-1/2 top-1.5 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-600" />

          {/* écran */}
          <div className="overflow-hidden rounded-xl bg-cream-50">
            <div className="flex h-[306px]">
              {/* sidebar */}
              <aside className="w-[122px] shrink-0 border-r border-slate-200 bg-white p-2.5">
                <div className="mb-3 flex items-center gap-1.5 px-1">
                  <AprobaMark size={16} />
                  <span className="text-[12px] font-bold tracking-tightest text-slate-900">aproba</span>
                </div>
                <div className="relative">
                  {/* indicateur glissant */}
                  <div
                    className="absolute inset-x-0 top-0 h-7 rounded-md bg-aproba-50 transition-transform duration-500 ease-out"
                    style={{ transform: `translateY(${tab * 32}px)` }}
                  />
                  <div className="relative space-y-1">
                    {TABS.map((t, i) => (
                      <div
                        key={t.label}
                        className={`flex h-7 items-center gap-2 rounded-md px-2 text-[11px] font-medium transition-colors duration-300 ${
                          i === tab ? "text-aproba-700" : "text-slate-500"
                        }`}
                      >
                        <NavIcon name={t.icon} />
                        {t.label}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              {/* contenu */}
              <div className="flex flex-1 flex-col">
                <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-cream-50 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold text-slate-700">Gestoría Vallès</span>
                    <Pill cls="bg-aproba-100 text-aproba-700">Pro</Pill>
                  </div>
                  <Avatar txt="MR" />
                </div>
                <div key={tab} className="flex-1 animate-fadein overflow-hidden p-3">
                  <Active />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
