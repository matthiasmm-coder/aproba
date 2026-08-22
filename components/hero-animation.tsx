"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";

// Animation héro — un iPad qui recorre la interfaz admin del gestor, cambiando de
// pestaña automáticamente por las SEIS entradas reales de la sidebar (app/app/layout):
// Inicio → Expedientes → Clientes → Vencimientos → Facturas → Ajustes. Los contenidos
// reproducen los pantallazos reales (rehecho 22/08 tras la observación de Matthias:
// faltaban Inicio y Vencimientos, y Clientes no tenía ni pestañas ni columnas):
// dashboard con KPIs y agenda, board de 4 fases, tabla de clientes con individuales/
// familias y último trámite, Vigía con «Iniciar renovación», facturas y servicios.

const TABS = [
  { label: "Inicio", icon: "home" },
  { label: "Expedientes", icon: "board" },
  { label: "Clientes", icon: "users" },
  { label: "Vencimientos", icon: "calendar" },
  { label: "Facturas", icon: "invoice" },
  { label: "Ajustes", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  const c = "h-3.5 w-3.5";
  if (name === "home") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>;
  if (name === "calendar") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
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

// Expedientes : kanban fidèle à board-client.tsx (reforma 22/08) — 4 fases, tarjetas
// SIN píldoras: anillo de completitud en preparación, fecha de depósito en Presentado,
// Aceptado/Denegado en Resultado. Todas las tarjetas miden lo mismo, como en el real.
function MiniAnillo({ pct }: { pct: number }) {
  const r = 5.5, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center">
      <svg width="15" height="15" viewBox="0 0 15 15" className="-rotate-90">
        <circle cx="7.5" cy="7.5" r={r} fill="none" strokeWidth="1.6" className="stroke-slate-100" />
        <circle cx="7.5" cy="7.5" r={r} fill="none" strokeWidth="1.6" strokeLinecap="round" stroke="currentColor" className="text-aproba-500" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute text-[4px] font-bold tabular-nums text-slate-600">{pct}%</span>
    </span>
  );
}

// Inicio : dashboard réel — saludo, 4 KPIs (el primero resaltado) y la agenda semanal.
function Inicio() {
  const kpis = [
    { n: "3", l: "Requieren tu acción", on: true },
    { n: "2", l: "Plazos esta semana" },
    { n: "6", l: "Expedientes activos" },
    { n: "1", l: "Caducan pronto" },
  ];
  const dias = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
  return (
    <div>
      <div className="mb-2">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Hola, Marta</span>
        <p className="text-[7.5px] text-slate-500"><span className="font-semibold text-slate-700">3 expedientes</span> requieren tu acción · <span className="text-red-600">1 vencido</span></p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {kpis.map((k) => (
          <div key={k.l} className={`rounded-lg border p-1.5 text-center ${k.on ? "border-aproba-300 bg-aproba-50/60" : "border-slate-200 bg-white"}`}>
            <p className={`text-[13px] font-bold tracking-tightest ${k.on ? "text-aproba-700" : "text-slate-800"}`}>{k.n}</p>
            <p className="truncate text-[5.5px] text-slate-500">{k.l}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[8px] font-semibold text-slate-800">Agenda</span>
          <span className="rounded bg-aproba-600 px-1.5 py-0.5 text-[6px] font-semibold text-white">+ Nueva cita</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d, i) => (
            <div key={d} className={`rounded border p-1 text-center ${i === 3 ? "border-aproba-200 bg-aproba-50/50" : "border-slate-100"}`}>
              <p className="text-[5px] text-slate-400">{d}</p>
              <p className="text-[7px] font-semibold text-slate-700">{16 + i}</p>
              {i === 3 && <p className="mt-0.5 truncate rounded bg-aproba-100 px-0.5 text-[4.5px] font-medium text-aproba-800">10:00 Huellas</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Vencimientos : Vigía réel — grupos por urgencia, punto de color, «caduca en N días»
// y el botón «Iniciar renovación» (vencimientos-list.tsx).
function Vencimientos() {
  const grupos = [
    {
      titulo: "Caducan en menos de 60 días", tono: "text-amber-600",
      items: [
        { n: "Karim Benali", t: "Renovación de TIE", d: "caduca en 24 días", dot: "bg-amber-400", btn: "Iniciar renovación", primario: true },
        { n: "Aïcha Diallo", t: "TIE · Arraigo laboral", d: "caduca en 51 días", dot: "bg-amber-400", btn: "Iniciar renovación", primario: true },
      ],
    },
    {
      titulo: "En los próximos 6 meses", tono: "text-slate-600",
      items: [
        { n: "Liu Wei", t: "Renovación de TIE", d: "caduca en 122 días", dot: "bg-slate-300", btn: "Ver renovación", primario: false },
      ],
    },
  ];
  return (
    <div>
      <Head title="Vencimientos" sub="Vigía avisa antes de cada caducidad y renueva en un clic" />
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-2">
          <p className={`mb-1 text-[7px] font-bold uppercase tracking-wide ${g.tono}`}>{g.titulo}</p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {g.items.map((v) => (
              <div key={v.n} className="flex items-center gap-1.5 px-2 py-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8.5px] font-medium text-slate-800">{v.n}</p>
                  <p className="truncate text-[6.5px] text-slate-400">{v.t} · {v.d}</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-1 text-[6.5px] font-semibold ${v.primario ? "bg-aproba-600 text-white" : "border border-aproba-300 text-aproba-700"}`}>{v.btn}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Expedientes() {
  type Tarjeta = { n: string; t: string; who: string; venc?: string; pct?: number; fecha?: string; res?: "ok" | "no" };
  const cols: { label: string; cards: Tarjeta[] }[] = [
    {
      label: "1. Preparación",
      cards: [
        { n: "Karim Benali", t: "Renovación de TIE · Marruecos", pct: 61, who: "MR", venc: "18/06" },
        { n: "Samuel Okafor", t: "Asignación de NIE · Nigeria", pct: 7, who: "LT" },
      ],
    },
    {
      label: "2. Listo para presentar",
      cards: [{ n: "Julia Mendoza", t: "Arraigo social · Colombia", pct: 100, who: "MR", venc: "20/06" }],
    },
    {
      label: "3. Presentado",
      cards: [{ n: "Liu Wei", t: "Reagrupación familiar · China", fecha: "03/06", who: "MR" }],
    },
    {
      label: "4. Resultado",
      cards: [{ n: "Oksana Koval", t: "Nacionalidad española · Ucrania", res: "ok", who: "MR" }],
    },
  ];
  return (
    <div>
      <Head title="Expedientes" sub="6 activos" />
      <div className="grid grid-cols-4 gap-1.5">
        {cols.map((c) => (
          <div key={c.label} className="min-w-0">
            <div className="mb-1.5 flex items-center justify-center gap-1 rounded bg-aproba-50/70 px-1 py-0.5">
              <span className="truncate text-[6px] font-semibold text-aproba-800">{c.label}</span>
              <span className="text-[5.5px] text-slate-400">{c.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {c.cards.map((card) => (
                <div key={card.n} className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                  <div className="flex items-center justify-between gap-0.5">
                    <p className="truncate text-[7.5px] font-semibold text-slate-900">{card.n}</p>
                    {card.venc && <span className="shrink-0 rounded bg-amber-50 px-0.5 text-[5px] font-medium text-amber-700">⏱ {card.venc}</span>}
                  </div>
                  <p className="truncate text-[6px] text-slate-500">{card.t}</p>
                  <div className="mt-1 flex min-h-[15px] items-center justify-between gap-0.5">
                    {card.pct !== undefined && <MiniAnillo pct={card.pct} />}
                    {card.fecha && <span className="truncate text-[5.5px] text-slate-500">Presentado el <span className="font-medium text-slate-700">{card.fecha}</span></span>}
                    {card.res && <span className={`text-[6px] font-semibold ${card.res === "ok" ? "text-aproba-700" : "text-red-600"}`}>{card.res === "ok" ? "Aceptado" : "Denegado"}</span>}
                    <span className="ml-auto flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[5.5px] font-semibold text-aproba-700">{card.who}</span>
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

// Clientes : réplica de app/app/clientes — dos botones (Importar datos + Nuevo cliente),
// pestañas individuales/familias, buscador, y la TABLA real con cabeceras (CLIENTE con
// la oficina bajo el nombre · NACIONALIDAD · ÚLTIMO TRÁMITE · EXP.).
function Clientes() {
  const rows = [
    { n: "Julia Mendoza", of: "Oficina Barcelona", p: "Colombia", tr: "Arraigo social", i: "JM", x: "1" },
    { n: "Karim Benali", of: "Oficina Zaragoza", p: "Marruecos", tr: "Renovación de TIE", i: "KB", x: "2" },
    { n: "Liu Wei", of: "Oficina Madrid", p: "China", tr: "Reagrupación familiar", i: "LW", x: "1" },
    { n: "Aïcha Diallo", of: "Oficina Zaragoza", p: "Senegal", tr: "Arraigo laboral", i: "AD", x: "1" },
    { n: "Oksana Koval", of: "Oficina Barcelona", p: "Ucrania", tr: "Nacionalidad española", i: "OK", x: "1" },
  ];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="text-[12px] font-bold tracking-tightest text-slate-900">Clientes</span>
          <p className="text-[7.5px] text-slate-500">5 clientes · 1 familia</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[7px] font-semibold text-slate-600">Importar datos</span>
          <span className="rounded-md bg-aproba-600 px-1.5 py-1 text-[7px] font-semibold text-white">+ Nuevo cliente</span>
        </div>
      </div>
      <div className="mb-1.5 flex gap-3 border-b border-slate-200 text-[7.5px] font-medium">
        <span className="border-b-2 border-aproba-600 pb-0.5 text-aproba-700">Clientes individuales (5)</span>
        <span className="pb-0.5 text-slate-400">Familias (1)</span>
      </div>
      <div className="relative mb-1.5">
        <svg className="absolute left-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <div className="rounded-md border border-slate-300 bg-white py-1 pl-6 pr-2 text-[7.5px] text-slate-400">Buscar por nombre o nacionalidad…</div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-cream-50/60 px-2 py-1 text-[5.5px] font-bold uppercase tracking-wide text-slate-400">
          <span className="flex-1">Cliente</span>
          <span className="w-[46px]">Nacionalidad</span>
          <span className="w-[58px]">Último trámite</span>
          <span className="w-[14px] text-right">Exp.</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.n} className={`flex items-center gap-1.5 px-2 py-1 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Avatar txt={r.i} />
              <div className="min-w-0">
                <p className="truncate text-[8px] font-medium text-slate-800">{r.n}</p>
                <p className="truncate text-[5.5px] text-slate-400">{r.of}</p>
              </div>
            </div>
            <span className="w-[46px] truncate text-[7px] text-slate-500">{r.p}</span>
            <span className="w-[58px] truncate text-[7px] text-slate-500">{r.tr}</span>
            <span className="flex w-[14px] justify-end"><span className="rounded-full bg-slate-100 px-1 py-0.5 text-[6.5px] font-medium text-slate-500">{r.x}</span></span>
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

const CONTENT = [Inicio, Expedientes, Clientes, Vencimientos, Facturas, Ajustes];

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
        <div className="relative rounded-[1.4rem] border border-slate-700/40 bg-slate-900 p-2 shadow-float">
          {/* caméra */}
          <div className="absolute left-1/2 top-[3px] h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-slate-600" />

          {/* écran */}
          <div className="overflow-hidden rounded-xl bg-cream-50">
            <div className="flex h-[306px]">
              {/* sidebar */}
              {/* En móvil no cabe la sidebar (dejaría ~164px al contenido): el
                  mockup pasa a «modo compacto» y cada pantalla ya lleva su título. */}
              <aside className="hidden w-[122px] shrink-0 border-r border-slate-200 bg-white p-2.5 sm:block">
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
                    <Pill cls="bg-aproba-100 text-aproba-700">Business</Pill>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* En el real, «+ Nuevo expediente» vive en la barra superior */}
                    <span className="rounded-md bg-aproba-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">+ Nuevo expediente</span>
                    <Avatar txt="MR" />
                  </div>
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
