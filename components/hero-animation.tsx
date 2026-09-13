"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";

// Animation héro — un iPad qui recorre la interfaz admin del gestor, cambiando de
// pestaña automáticamente por las SEIS entradas reales de la sidebar (app/app/layout):
// Inicio → Expedientes → Clientes → Vencimientos → Facturas → Ajustes. Los contenidos
// reproducen los pantallazos reales de la cuenta demo (Gestoría Vallès), realineados el
// 13/09/2026 con la app actual: pastillas de oficina, usuario al pie de la sidebar (no
// en la cabecera), tablero de 2 fases con chips Facturado/Sin facturar/Concedido, Vigía
// con «Proponer renovación» y grupo «Renovación aceptada», Facturas con periodo + 3 KPI
// + cobros pendientes, Ajustes con las siete secciones plegadas y el botón «Ayuda».

const TABS = [
  { label: "Inicio", icon: "home" },
  { label: "Expedientes", icon: "board" },
  { label: "Clientes", icon: "users" },
  { label: "Vencimientos", icon: "calendar" },
  { label: "Facturas", icon: "invoice" },
  { label: "Ajustes", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  // shrink-0: sin él, la etiqueta más larga («Vencimientos») comprimía SU icono a la
  // mitad — se veía diminuto y ningún ajuste del trazado lo cambiaba (bug real del 22/08).
  const c = "h-3.5 w-3.5 shrink-0";
  if (name === "home") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>;
  if (name === "calendar") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M12 14.5v4M10 16.5h4"/></svg>;
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

// Inicio : dashboard real — saludo con el resumen, 4 KPIs con su icono y su sublínea
// (el primero resaltado, como el real), y la agenda semanal con ‹ Hoy ›, el rango de
// fechas, el día de hoy en círculo verde y una cita como chip.
function KpiIcon({ name }: { name: "bell" | "clock" | "folder" | "cal" }) {
  const c = "h-2.5 w-2.5";
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name === "clock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "folder") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
}

// Pastillas de oficina (multi-oficina, Business): «Todas» activa + las tres sedes de la
// demo. Aparecen arriba en Inicio/Expedientes/Clientes/Facturas y bajo el título en Vencimientos.
function Oficinas() {
  return (
    <div className="mb-2 flex justify-center gap-1">
      <span className="rounded-full bg-aproba-600 px-1.5 py-0.5 text-[6px] font-semibold text-white">Todas</span>
      {["Oficina Barcelona", "Oficina Zaragoza", "Oficina Madrid"].map((o) => (
        <span key={o} className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[6px] font-medium text-slate-600">{o}</span>
      ))}
    </div>
  );
}

// Buscador (input real de la app, en miniatura).
function Buscador({ texto, cls = "" }: { texto: string; cls?: string }) {
  return (
    <div className={`relative ${cls}`}>
      <svg className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <div className="rounded-md border border-slate-300 bg-white py-1 pl-5 pr-2 text-[6.5px] text-slate-400">{texto}</div>
    </div>
  );
}

// Barra de progreso de los paneles «Por fase» / «Carga del equipo» del Inicio.
function Barra({ pct }: { pct: number }) {
  return <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-aproba-500" style={{ width: `${pct}%` }} /></span>;
}

// Inicio: pastillas de oficina, saludo con la línea de acción, 4 KPI (el primero
// resaltado), agenda de la semana y los dos paneles «Por fase» / «Carga del equipo».
function Inicio() {
  const kpis: { n: string; nCls: string; l: string; sub?: string; subCls?: string; icon: "bell" | "clock" | "folder" | "cal"; on?: boolean }[] = [
    { n: "26", nCls: "text-aproba-700", l: "Requieren tu acción", icon: "bell", on: true },
    { n: "5", nCls: "text-amber-600", l: "Plazos esta semana", sub: "5 vencidos", subCls: "text-slate-400", icon: "clock" },
    { n: "26", nCls: "text-slate-900", l: "Expedientes activos", sub: "6 esperando cliente →", subCls: "text-amber-700", icon: "folder" },
    { n: "2", nCls: "text-red-600", l: "Caducan pronto", sub: "1 ya caducadas", subCls: "text-slate-400", icon: "cal" },
  ];
  const dias = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
  const HOY = 6; // domingo 13
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Hola, Marta</span>
        <p className="text-[7px] text-slate-500"><span className="font-semibold text-aproba-700">26 expedientes</span> requieren tu acción · <span className="font-semibold text-red-600">5 vencidos</span>.</p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {kpis.map((k) => (
          <div key={k.l} className={`rounded-lg border p-1.5 text-center ${k.on ? "border-aproba-300 bg-aproba-50/60" : "border-slate-200 bg-white"}`}>
            <span className={`mx-auto flex h-4 w-4 items-center justify-center rounded ${k.on ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-500"}`}><KpiIcon name={k.icon} /></span>
            <p className={`mt-0.5 text-[12px] font-bold leading-none tracking-tightest ${k.nCls}`}>{k.n}</p>
            <p className="truncate text-[5.5px] text-slate-600">{k.l}</p>
            <p className={`truncate text-[5px] ${k.sub ? k.subCls : "text-transparent"}`}>{k.sub ?? "·"}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="text-[8px] font-semibold text-slate-800">Agenda</span>
          <div className="flex items-center gap-1">
            <span className="rounded border border-slate-200 px-1 text-[5.5px] text-slate-400">‹ <span className="text-slate-300">Hoy</span> ›</span>
            <span className="text-[5.5px] text-slate-500">7 – 13 sep 2026</span>
            <span className="rounded bg-aproba-600 px-1.5 py-0.5 text-[5.5px] font-semibold text-white">+ Nueva cita</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {dias.map((d, i) => (
            <div key={d} className={`rounded border p-0.5 text-center ${i === HOY ? "border-aproba-100 bg-aproba-50/40" : "border-slate-100"}`}>
              <p className="text-[4.5px] font-semibold text-slate-400">{d}</p>
              <p className={`mx-auto text-[6.5px] font-semibold ${i === HOY ? "flex h-3 w-3 items-center justify-center rounded-full bg-aproba-600 text-white" : "text-slate-700"}`}>{7 + i}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <p className="mb-1 text-[5.5px] font-bold uppercase tracking-wide text-slate-400">Por fase</p>
          {[["1", "Preparación", 73, "19"], ["2", "Preparado", 27, "7"]].map(([n, l, pct, v]) => (
            <div key={l as string} className="flex items-center gap-1 py-0.5">
              <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-aproba-100 text-[4.5px] font-bold text-aproba-700">{n}</span>
              <span className="w-[34px] truncate text-[6px] text-slate-600">{l}</span>
              <Barra pct={pct as number} />
              <span className="w-3 text-right text-[6px] font-semibold text-slate-700">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <p className="mb-1 text-[5.5px] font-bold uppercase tracking-wide text-slate-400">Carga del equipo · activos</p>
          {[["MR", "Marta Ribas", 100, "21"], ["DF", "Diego Fuentes", 14, "3"]].map(([i, l, pct, v]) => (
            <div key={l as string} className="flex items-center gap-1 py-0.5">
              <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-aproba-100 text-[4px] font-bold text-aproba-700">{i}</span>
              <span className="w-[34px] truncate text-[6px] text-slate-600">{l}</span>
              <Barra pct={pct as number} />
              <span className="w-3 text-right text-[6px] font-semibold text-slate-700">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Vencimientos: Vigía real — subtítulo, pastillas de oficina, buscador, grupos por
// urgencia (ya caducadas / < 60 días / más adelante / renovación aceptada), botón
// «Proponer renovación» + papelera, y el chip EXP en las aceptadas (vencimientos-list.tsx).
function Vencimientos() {
  const grupos = [
    { titulo: "Ya caducadas (1)", tono: "text-red-600", items: [{ n: "Karim Benali", t: "TIE · caducó hace 27 días (16/08/2026)", dot: "bg-red-500" }] },
    { titulo: "Caducan en menos de 60 días (1)", tono: "text-amber-600", items: [{ n: "Oksana Koval", t: "Renovación · caduca en 7 días (19/09/2026)", dot: "bg-amber-400" }] },
    { titulo: "Más adelante (1)", tono: "text-slate-500", items: [{ n: "Fatima El Amrani", t: "Renovación · caduca en 95 días (16/12/2026)", dot: "bg-slate-300" }] },
  ];
  return (
    <div>
      <div className="mb-1">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Vencimientos</span>
        <p className="truncate text-[6px] text-slate-500">Las tarjetas de tus clientes que caducan pronto. Inicia la renovación con un clic: se crea el expediente y se avisa al cliente.</p>
      </div>
      <Oficinas />
      <Buscador texto="Buscar cliente…" cls="mb-1.5 w-[45%]" />
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-1.5">
          <p className={`mb-0.5 text-[6px] font-bold uppercase tracking-wide ${g.tono}`}>{g.titulo}</p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {g.items.map((v) => (
              <div key={v.n} className="flex items-center gap-1.5 px-2 py-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[7.5px] font-semibold text-slate-800">{v.n}</p>
                  <p className="truncate text-[5.5px] text-slate-400">{v.t}</p>
                </div>
                <span className="shrink-0 rounded bg-aproba-600 px-1.5 py-0.5 text-[5.5px] font-semibold text-white">Proponer renovación</span>
                <svg className="h-2 w-2 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m-7 5v6m6-6v6M5 6l1 14h12l1-14"/></svg>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="mb-0.5 text-[6px] font-bold uppercase tracking-wide text-aproba-700">Renovación aceptada · en marcha (2)</p>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[7.5px] font-semibold text-slate-800">Liu Wei</p>
            <p className="truncate text-[5.5px] text-slate-400">TIE · caducó hace 11 días (01/09/2026)</p>
          </div>
          <span className="shrink-0 rounded border border-aproba-400 px-1.5 py-0.5 text-[5.5px] font-semibold text-aproba-700">EXP-2026-0041</span>
        </div>
      </div>
    </div>
  );
}

// Expedientes: tablero real de 2 fases (board-client.tsx) — pastillas de oficina, título
// con activos, buscador + filtros por gestor + Activos/Archivados, cabeceras de fase con
// el recuento y tarjetas con anillo (Preparación) o chip Facturado/Sin facturar/Concedido.
function Expedientes() {
  type Tarjeta = { n: string; t: string; who: string; pct?: number; chip?: string; chipCls?: string };
  const cols: { label: string; count: string; cards: Tarjeta[] }[] = [
    { label: "1. Preparación", count: "19", cards: [
      { n: "Aïcha Diallo Diaz", t: "Otro trámite · Senegal", pct: 8, who: "MR" },
      { n: "Ioana Popescu", t: "Asignación de NIE +1 · Rumanía", pct: 27, who: "MR" },
      { n: "Andrés Patiño", t: "Otro trámite · Colombia", pct: 5, who: "MR" },
    ] },
    { label: "2. Preparado", count: "7", cards: [
      { n: "Julia Mendoza Restrepo", t: "Arraigo social · Colombia", chip: "Facturado", chipCls: "bg-aproba-100 text-aproba-700", who: "MR" },
      { n: "Karim Benali", t: "Renovación de TIE · Marruecos", chip: "Sin facturar", chipCls: "bg-slate-100 text-slate-500", who: "DF" },
      { n: "Fatima El Amrani", t: "Renovación TIE · Marruecos", chip: "Concedido", chipCls: "bg-aproba-100 text-aproba-700", who: "DF" },
    ] },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Expedientes</span>
        <p className="text-[7px] text-slate-500">26 activos</p>
      </div>
      <div className="mb-1.5 flex items-center gap-1">
        <Buscador texto="Buscar cliente, trámite, ref" cls="w-[32%]" />
        <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[5.5px] font-medium text-slate-500">
          <span className="rounded bg-white px-1 py-0.5 font-semibold text-slate-800 shadow-sm">Todos</span>
          <span className="px-1">Diego Fuentes</span><span className="px-1">Marta Ribas</span><span className="px-1">Nuria Camps</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[5.5px] font-medium text-slate-500">
          <span className="rounded bg-white px-1 py-0.5 font-semibold text-slate-800 shadow-sm">Activos</span>
          <span className="px-1">Archivados <span className="text-slate-400">2</span></span>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1">
        {cols.map((c, ci) => (
          <div key={c.label} className={`min-w-0 ${ci === 1 ? "col-start-3" : ""}`}>
            <div className="mb-1.5 flex items-center justify-between rounded bg-aproba-50 px-1.5 py-1">
              <span className="text-[6.5px] font-bold text-aproba-800">{c.label}</span>
              <span className="text-[6px] font-semibold text-aproba-700">{c.count}</span>
            </div>
            <div className="space-y-1.5">
              {c.cards.map((card) => (
                <div key={card.n} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[7.5px] font-semibold text-slate-900">{card.n}</p>
                    <p className="truncate text-[6px] text-slate-500">{card.t}</p>
                  </div>
                  {card.pct !== undefined && <MiniAnillo pct={card.pct} />}
                  {card.chip && <span className={`rounded-full px-1 py-0.5 text-[5px] font-semibold ${card.chipCls}`}>{card.chip}</span>}
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[5.5px] font-semibold text-aproba-700">{card.who}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <svg className="col-start-2 mt-1.5 h-2 w-2 self-start text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
  );
}

// Clientes: réplica de app/app/clientes — pastillas de oficina, contador, botones
// Importar datos / + Nuevo cliente, pestañas individuales/familias/empresas, buscador y
// la tabla real (casilla, iniciales, oficina bajo el nombre, nacionalidad, último trámite, exp.).
function Clientes() {
  const rows = [
    { n: "Aïcha Diallo Diaz", of: "Sin oficina", p: "Senegal", tr: "Otro trámite", i: "AD", x: "5" },
    { n: "Andrés Patiño", of: "Oficina Barcelona", p: "Colombia", tr: "Otro trámite", i: "AP", x: "2" },
    { n: "Fatima El Amrani", of: "Oficina Zaragoza", p: "Marruecos", tr: "Renovación TIE", i: "FE", x: "1" },
    { n: "Ioana Popescu", of: "Oficina Zaragoza", p: "Rumanía", tr: "Asignación de NIE", i: "IP", x: "2" },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <span className="text-[12px] font-bold tracking-tightest text-slate-900">Clientes</span>
          <p className="text-[7px] text-slate-500">18 clientes · 1 familia</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-700">Importar datos</span>
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-700">+ Nuevo cliente</span>
        </div>
      </div>
      <div className="mb-1.5 flex gap-2.5 border-b border-slate-200 text-[6.5px] font-medium">
        <span className="border-b-2 border-aproba-600 pb-0.5 text-aproba-700">Clientes individuales (18)</span>
        <span className="pb-0.5 text-slate-400">Familias (1)</span>
        <span className="pb-0.5 text-slate-400">Empresas (0)</span>
      </div>
      <Buscador texto="Buscar por nombre o nacionalidad…" cls="mb-1.5 w-[48%]" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1 text-[5px] font-bold uppercase tracking-wide text-slate-400">
          <span className="flex-1">Cliente</span>
          <span className="w-[42px]">Nacionalidad</span>
          <span className="w-[54px]">Último trámite</span>
          <span className="w-[14px] text-right">Exp.</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.n} className={`flex items-center gap-1.5 px-2 py-1 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm border border-slate-300 bg-white" />
              <Avatar txt={r.i} />
              <div className="min-w-0">
                <p className="truncate text-[7.5px] font-medium text-slate-800">{r.n}</p>
                <p className="truncate text-[5px] text-slate-400">{r.of}</p>
              </div>
            </div>
            <span className="w-[42px] truncate text-[6.5px] text-slate-500">{r.p}</span>
            <span className="w-[54px] truncate text-[6.5px] text-slate-500">{r.tr}</span>
            <span className="flex w-[14px] justify-end"><span className="rounded-full bg-slate-100 px-1 py-0.5 text-[6px] font-medium text-slate-500">{r.x}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Facturas: página real — subtítulo, botones CSV / PDF (todas) / + Nueva factura,
// selector de periodo, 3 KPI (Facturado / Cobrado / Pendiente), fila «Cobros
// pendientes» y la lista con número, cliente, total y estado (lib/facturas.ts).
function Facturas() {
  const rows = [
    { id: "2026-0048", c: "Julia Mendoza Restrepo", v: "423,50 €", s: "Emitida", cls: "bg-amber-100 text-amber-700" },
    { id: "2026-0047", c: "Liu Wei", v: "508,20 €", s: "Pagada", cls: "bg-aproba-100 text-aproba-700" },
    { id: "2026-0046", c: "Fatima El Amrani", v: "217,80 €", s: "Vencida", cls: "bg-red-100 text-red-700" },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5 flex items-center justify-between">
        <div>
          <span className="text-[12px] font-bold tracking-tightest text-slate-900">Facturas</span>
          <p className="text-[7px] text-slate-500">Factura a tus clientes por cada trámite.</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-400">CSV</span>
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-700">PDF (todas)</span>
          <span className="rounded-md bg-aproba-600 px-1.5 py-1 text-[6.5px] font-semibold text-white">+ Nueva factura</span>
        </div>
      </div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[5.5px] font-medium text-slate-500">
          <span className="rounded bg-white px-1 py-0.5 font-semibold text-slate-800 shadow-sm">Este mes</span>
          <span className="px-1">Este año</span><span className="px-1">Personalizado</span>
        </div>
        <span className="text-[5.5px] text-slate-400">septiembre 2026, hasta hoy</span>
      </div>
      <div className="mb-1.5 grid grid-cols-3 gap-1.5">
        {[["Facturado", "1.149,50 €", "text-slate-900", "5 facturas"], ["Cobrado", "726,00 €", "text-aproba-700", "Pagadas"], ["Pendiente de cobro", "423,50 €", "text-amber-600", "1 vencida"]].map(([l, v, cls, sub]) => (
          <div key={l} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center">
            <p className="text-[6px] text-slate-500">{l}</p>
            <p className={`text-[11px] font-bold tracking-tightest ${cls}`}>{v}</p>
            <p className="text-[5px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>
      <div className="mb-1.5 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1">
        <div className="flex items-center gap-1.5">
          <svg className="h-2 w-2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
          <div><p className="text-[7px] font-semibold text-slate-800">Cobros pendientes</p><p className="text-[5px] text-slate-400">10 clientes · 12 facturas</p></div>
        </div>
        <span className="text-[9px] font-bold tabular-nums text-amber-600">3.231,91 €</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-2 px-2 py-1 ${i < rows.length - 1 ? "border-b border-slate-100" : ""}`}>
            <span className="font-mono text-[6.5px] text-slate-400">{r.id}</span>
            <span className="flex-1 truncate text-[7.5px] font-medium text-slate-800">{r.c}</span>
            <span className="text-[7.5px] font-semibold tabular-nums text-slate-700">{r.v}</span>
            <Pill cls={r.cls}>{r.s}</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuIcon({ name }: { name: "services" | "bell" | "plug" | "doc" | "card" | "team" | "building" }) {
  const c = "h-2.5 w-2.5";
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: c };
  if (name === "bell") return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name === "plug") return <svg {...p}><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0z"/><path d="M12 18v4"/></svg>;
  if (name === "doc") return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>;
  if (name === "card") return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
  if (name === "team") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>;
  if (name === "building") return <svg {...p}><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/></svg>;
  return <svg {...p}><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 7V5h6v2"/></svg>;
}

// Ajustes: la página real — título con su frase y las SIETE secciones plegadas
// (AjustesSection): icono en cuadrado verde claro, título, subtítulo real y chevrón.
function Ajustes() {
  const secciones: { icon: "services" | "bell" | "plug" | "doc" | "card" | "team" | "building"; label: string; sub: string }[] = [
    { icon: "services", label: "Servicios", sub: "8 activos · trámites, pagos y documentos" },
    { icon: "bell", label: "Notificaciones al cliente", sub: "Email · avisos automáticos en cada paso" },
    { icon: "plug", label: "Integraciones", sub: "Email entrante · bandeja · Google Meet" },
    { icon: "doc", label: "Hoja de encargo y mandato", sub: "Activada — el cliente firma desde su portal" },
    { icon: "card", label: "Facturación y métodos de pago", sub: "1 cuenta bancaria · datos de facturación y tarjeta" },
    { icon: "team", label: "Plan y equipo", sub: "Business · 3 usuarios · 3 oficinas" },
    { icon: "building", label: "Despacho y cuenta", sub: "Datos de tu gestoría y de tu usuario" },
  ];
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Ajustes</span>
        <p className="text-[7px] text-slate-500">Configura tus servicios, los avisos a tus clientes y los datos de tu despacho.</p>
      </div>
      <div className="space-y-[3px]">
        {secciones.map((x) => (
          <div key={x.label} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-[3px]">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-aproba-50 text-aproba-700"><MenuIcon name={x.icon} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[7.5px] font-semibold text-slate-800">{x.label}</p>
              <p className="truncate text-[5.5px] text-slate-400">{x.sub}</p>
            </div>
            <svg className="h-2 w-2 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        ))}
      </div>
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

      {/* iPad. Escalado PROPORCIONAL con zoom (la maqueta está en px fijos): a partir de
          1152 px la columna mide 536 px → 470 × 1,14 = 536, y el borde derecho de la
          tableta queda alineado con el del botón «Prueba 15 días gratis» de la cabecera
          (mismo contenedor max-w-6xl px-6). Paso intermedio en 1100-1151 px. */}
      <div className="relative w-full max-w-[470px] animate-floaty min-[1100px]:[zoom:1.08] min-[1152px]:[zoom:1.14]">
        <div className="relative rounded-[1.4rem] border border-slate-700/40 bg-slate-900 p-2 shadow-float">
          {/* caméra */}
          <div className="absolute left-1/2 top-[3px] h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-slate-600" />

          {/* écran */}
          <div className="overflow-hidden rounded-xl bg-cream-50">
            <div className="flex h-[306px]">
              {/* sidebar */}
              {/* En móvil no cabe la sidebar (dejaría ~164px al contenido): el
                  mockup pasa a «modo compacto» y cada pantalla ya lleva su título. */}
              <aside className="hidden w-[122px] shrink-0 flex-col border-r border-slate-200 bg-white p-2.5 sm:flex">
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
                {/* Usuario al pie, como en la app (no hay avatar en la cabecera) */}
                <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-2">
                  <Avatar txt="MR" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[7.5px] font-semibold text-slate-800">Marta Ribas</p>
                    <p className="truncate text-[5.5px] text-slate-400">Gestoría Vallès</p>
                  </div>
                  <svg className="h-2.5 w-2.5 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                </div>
              </aside>

              {/* contenu — min-w-0: sin él, un texto con truncate (nowrap) ensancha la columna y desborda la tableta */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-cream-50 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold text-slate-700">Gestoría Vallès</span>
                    <Pill cls="bg-aproba-100 text-aproba-700">Business</Pill>
                  </div>
                  {/* En el real, «+ Nuevo expediente» vive en la barra superior; el usuario, al pie de la sidebar */}
                  <span className="rounded-md bg-aproba-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">+ Nuevo expediente</span>
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <div key={tab} className="h-full animate-fadein overflow-hidden p-3">
                    <Active />
                  </div>
                  {/* Botón «Ayuda» (asistente), fijo abajo a la derecha como en la app */}
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[6px] font-semibold text-white shadow">
                    <svg className="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>
                    Ayuda
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
