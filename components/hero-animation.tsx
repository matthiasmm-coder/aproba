"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";

// Animation héro — un iPad qui recorre la interfaz admin del gestor,
// cambiando de pestaña automáticamente (Expedientes → Clientes → Facturas → Ajustes).

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

function Pill({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "blue" | "slate" | "red" }) {
  const map = {
    green: "bg-aproba-100 text-aproba-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-500",
    red: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${map[tone]}`}>{children}</span>;
}

function Avatar({ txt }: { txt: string }) {
  return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[8px] font-semibold text-aproba-700">{txt}</span>;
}

// ── Contenu par onglet ──────────────────────────────────────────────

function Expedientes() {
  const cols = [
    { label: "Pendientes", tone: "bg-amber-400", cards: [{ n: "Karim Benali", t: "Renov. TIE" }, { n: "Samuel Okafor", t: "NIE" }] },
    { label: "Validados", tone: "bg-aproba-500", cards: [{ n: "Julia Mendoza", t: "Arraigo social" }] },
    { label: "Presentado", tone: "bg-indigo-500", cards: [{ n: "Aïcha Diallo", t: "Arraigo laboral" }] },
  ];
  return (
    <div>
      <Head title="Expedientes" cta="+ Nuevo" />
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.label}>
            <div className="mb-1.5 flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${c.tone}`} />
              <span className="text-[8px] font-semibold text-slate-500">{c.label}</span>
            </div>
            <div className="space-y-1.5">
              {c.cards.map((card) => (
                <div key={card.n} className="rounded-md border border-slate-200 bg-white p-1.5">
                  <p className="text-[9px] font-semibold text-slate-800">{card.n}</p>
                  <p className="text-[8px] text-slate-400">{card.t}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Clientes() {
  const rows = [
    { n: "Julia Mendoza", p: "Colombia", i: "JM" },
    { n: "Karim Benali", p: "Marruecos", i: "KB" },
    { n: "Liu Wei", p: "China", i: "LW" },
    { n: "Aïcha Diallo", p: "Senegal", i: "AD" },
    { n: "Oksana Koval", p: "Ucrania", i: "OK" },
  ];
  return (
    <div>
      <Head title="Clientes" cta="+ Cliente" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r, i) => (
          <div key={r.n} className={`flex items-center gap-2 px-2.5 py-1.5 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <Avatar txt={r.i} />
            <span className="flex-1 text-[9px] font-medium text-slate-800">{r.n}</span>
            <span className="text-[8px] text-slate-400">{r.p}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-medium text-slate-500">1</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Facturas() {
  const rows = [
    { id: "2026-042", c: "Julia M.", v: "350 €", s: "Pagada", tone: "green" as const },
    { id: "2026-041", c: "Karim B.", v: "180 €", s: "Emitida", tone: "amber" as const },
    { id: "2026-040", c: "Liu W.", v: "420 €", s: "Pagada", tone: "green" as const },
    { id: "2026-039", c: "Aïcha D.", v: "350 €", s: "Vencida", tone: "red" as const },
  ];
  return (
    <div>
      <Head title="Facturas" cta="+ Factura" />
      <div className="mb-2 flex gap-2">
        <div className="flex-1 rounded-lg bg-aproba-50 px-2.5 py-1.5">
          <p className="text-[8px] text-aproba-700">Este mes</p>
          <p className="text-[12px] font-bold text-aproba-700">1.300 €</p>
        </div>
        <div className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5">
          <p className="text-[8px] text-slate-400">Pendiente</p>
          <p className="text-[12px] font-bold text-slate-700">530 €</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <span className="font-mono text-[8px] text-slate-400">#{r.id}</span>
            <span className="flex-1 text-[9px] font-medium text-slate-800">{r.c}</span>
            <span className="text-[9px] font-semibold text-slate-700">{r.v}</span>
            <Pill tone={r.tone}>{r.s}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniToggle() {
  return (
    <span className="relative h-3 w-5 shrink-0 rounded-full bg-aproba-500">
      <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-white" />
    </span>
  );
}

function MenuIcon({ name }: { name: "services" | "bell" | "building" }) {
  const c = "h-2.5 w-2.5";
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name === "building") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
}

function CollapsedMenu({ icon, label }: { icon: "bell" | "building"; label: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <span className="flex h-4 w-4 items-center justify-center rounded bg-aproba-50 text-aproba-700"><MenuIcon name={icon} /></span>
      <span className="text-[9px] font-semibold text-slate-800">{label}</span>
      <svg className="ml-auto h-2.5 w-2.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </div>
  );
}

function Ajustes() {
  const servicios = [
    { label: "Arraigo social", a: "150", b: "200" },
    { label: "Renovación TIE", a: "80", b: "100" },
    { label: "Nacionalidad", a: "300", b: "300" },
  ];
  return (
    <div>
      <Head title="Ajustes" />
      {/* Menú Servicios — abierto, con tarifa al firmar + al finalizar */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-aproba-50 text-aproba-700"><MenuIcon name="services" /></span>
          <span className="text-[9px] font-semibold text-slate-800">Servicios</span>
          <span className="ml-auto text-[7px] font-medium uppercase tracking-wide text-slate-400">firma · final</span>
          <svg className="h-2.5 w-2.5 rotate-180 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
        <div className="divide-y divide-slate-100">
          {servicios.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 px-2.5 py-1.5">
              <span className="flex-1 text-[9px] font-medium text-slate-700">{s.label}</span>
              <span className="text-[8px] tabular-nums text-slate-500">{s.a} €</span>
              <span className="text-[8px] text-slate-300">+</span>
              <span className="text-[8px] tabular-nums text-slate-500">{s.b} €</span>
              <MiniToggle />
            </div>
          ))}
        </div>
      </div>
      {/* Menús plegados */}
      <CollapsedMenu icon="bell" label="Notificaciones al cliente" />
      <CollapsedMenu icon="building" label="Despacho y cuenta" />
    </div>
  );
}

function Head({ title, cta }: { title: string; cta?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <span className="text-[12px] font-bold tracking-tight text-slate-900">{title}</span>
      {cta && <span className="rounded-md bg-aproba-600 px-2 py-0.5 text-[8px] font-semibold text-white">{cta}</span>}
    </div>
  );
}

const CONTENT = [Expedientes, Clientes, Facturas, Ajustes];

export function HeroAnimation() {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTab((x) => (x + 1) % TABS.length), 2600);
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
                    <Pill tone="green">Pro</Pill>
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
