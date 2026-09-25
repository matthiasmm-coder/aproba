"use client";

import { useEffect, useState } from "react";
import { AprobaMark } from "./logo";

// Animation héro — un iPad qui recorre la interfaz del gestor. Realineada con la app el
// 26/09/2026 (la anterior era del 13/09):
//  · sidebar de CINCO entradas (app/app/layout): Vencimientos ya no está en ella, es la vista
//    «Renovaciones» de Expedientes;
//  · Expedientes › En curso = árbol tema → servicio (19/09), con las casillas Datos / Docs /
//    Form. / Cobro y el nº de Extranjería en la fila (24/09), y las cuatro vistas arriba;
//  · Expedientes › Renovaciones = el Vigía (filtros Urgentes / Más adelante / Esperando
//    respuesta, «Proponer renovación»);
//  · Inicio con las cuatro tarjetas actuales, la agenda, «Por servicios» y la carga del equipo;
//  · Facturas › Estadísticas (25/09): ingresos, gastos, resultado, rentabilidad y la gráfica.
// Seis escenas sobre cinco entradas: Expedientes se queda iluminada en «En curso» y en
// «Renovaciones». Las fechas (agenda, caducidades, meses de la gráfica) salen del día del
// visitante tras montar: la maqueta no envejece en la landing.

const TABS = [
  { label: "Inicio", icon: "home" },
  { label: "Expedientes", icon: "board" },
  { label: "Clientes", icon: "users" },
  { label: "Facturas", icon: "invoice" },
  { label: "Ajustes", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  // shrink-0: sin él, una etiqueta larga comprimía SU icono a la mitad (bug real del 22/08).
  const c = "h-3.5 w-3.5 shrink-0";
  if (name === "home") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>;
  if (name === "board") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>;
  if (name === "users") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>;
  if (name === "invoice") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

// ── Fechas del visitante ────────────────────────────────────────────
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dd = (n: number) => String(n).padStart(2, "0");
const fechaCorta = (d: Date) => `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
// Servidor y primer render: una fecha fija (idéntica a ambos lados, sin desajuste de
// hidratación); tras montar, la del visitante.
const HOY_FIJO = new Date(2026, 8, 30);

// ── Piezas comunes ──────────────────────────────────────────────────
function Pill({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${cls}`}>{children}</span>;
}

function Avatar({ txt, size = "h-5 w-5 text-[8px]" }: { txt: string; size?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full bg-aproba-100 font-semibold text-aproba-700 ${size}`}>{txt}</span>;
}

// Pastillas de oficina (multi-oficina, Business): «Todas» activa + las tres sedes de la demo.
function Oficinas() {
  return (
    <div className="mb-1.5 flex justify-center gap-1">
      <span className="rounded-full bg-aproba-600 px-1.5 py-0.5 text-[6px] font-semibold text-white">Todas</span>
      {["Oficina Barcelona", "Oficina Zaragoza", "Oficina Madrid"].map((o) => (
        <span key={o} className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[6px] font-medium text-slate-600">{o}</span>
      ))}
    </div>
  );
}

function Buscador({ texto, cls = "" }: { texto: string; cls?: string }) {
  return (
    <div className={`relative ${cls}`}>
      <svg className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <div className="truncate rounded-md border border-slate-300 bg-white py-1 pl-5 pr-2 text-[6px] text-slate-400">{texto}</div>
    </div>
  );
}

function Desplegable({ texto }: { texto: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6px] text-slate-600">
      {texto}
      <svg className="h-1.5 w-1.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </span>
  );
}

function Chip({ texto, n }: { texto: string; n: number }) {
  return <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[5.5px] font-medium text-slate-500">{texto} <span className="text-slate-400">{n}</span></span>;
}

function Barra({ pct }: { pct: number }) {
  return <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-aproba-500" style={{ width: `${pct}%` }} /></span>;
}

function Titulo({ texto, sub }: { texto: string; sub: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="text-[12px] font-bold tracking-tightest text-slate-900">{texto}</span>
      <p className="truncate text-[6.5px] text-slate-500">{sub}</p>
    </div>
  );
}

// Las cuatro vistas de Expedientes (components/vistas-expedientes.tsx), en miniatura.
function Vistas({ activa }: { activa: "curso" | "renovaciones" }) {
  const cls = (on: boolean) => `flex items-center gap-[2px] whitespace-nowrap rounded px-[3px] py-0.5 ${on ? "bg-white font-semibold text-slate-900 shadow-sm" : ""}`;
  const i = "h-[5px] w-[5px]";
  return (
    <div className="flex shrink-0 items-center gap-px rounded-md bg-slate-100 p-0.5 text-[5px] font-medium text-slate-500">
      <span className={cls(activa === "curso")}>En curso</span>
      <span className={cls(false)}>
        <svg className={i} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></svg>
        Historial <span className="text-slate-400">48</span>
      </span>
      <span className={cls(activa === "renovaciones")}>
        <svg className={i} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/></svg>
        Renovaciones <span className="text-slate-400">3</span>
      </span>
      <span className={cls(false)}>
        <svg className={i} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        Requerimientos <span className="text-slate-400">2</span>
      </span>
    </div>
  );
}

// ── Inicio ──────────────────────────────────────────────────────────
function KpiIcon({ name }: { name: "folder" | "user" | "euro" | "cal" }) {
  const p = { className: "h-2.5 w-2.5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "folder") return <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
  if (name === "user") return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>;
  if (name === "euro") return <svg {...p}><path d="M18 7a7 7 0 1 0 0 10M4 10h10M4 14h10"/></svg>;
  return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
}

function Inicio({ hoy }: { hoy: Date }) {
  const kpis: { n: string; nCls: string; l: string; sub: string; subCls: string; icon: "folder" | "user" | "euro" | "cal" }[] = [
    { n: "26", nCls: "text-slate-900", l: "Expedientes activos", sub: "·", subCls: "text-transparent", icon: "folder" },
    { n: "6", nCls: "text-amber-600", l: "Esperando al cliente", sub: "documentos e información", subCls: "text-slate-400", icon: "user" },
    { n: "4", nCls: "text-slate-900", l: "Esperando pago", sub: "1 factura vencida", subCls: "text-amber-700", icon: "euro" },
    { n: "3", nCls: "text-red-600", l: "Caducan pronto", sub: "1 ya caducadas", subCls: "text-slate-400", icon: "cal" },
  ];
  const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7));
  const domingo = sumarDias(lunes, 6);
  const rango = lunes.getMonth() === domingo.getMonth()
    ? `${lunes.getDate()} – ${domingo.getDate()} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`
    : `${lunes.getDate()} ${MESES[lunes.getMonth()]} – ${domingo.getDate()} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`;
  const hoyIdx = (hoy.getDay() + 6) % 7;
  const citas: Record<number, string> = { 1: "10:30 Karim B.", 3: "12:00 Ioana P.", 4: "9:15 Liu W." };
  return (
    <div>
      <Oficinas />
      <span className="text-[12px] font-bold tracking-tightest text-slate-900">Hola, Marta</span>
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-lg border border-slate-200 bg-white p-1.5 text-center">
            <span className="mx-auto flex h-4 w-4 items-center justify-center rounded bg-slate-100 text-slate-500"><KpiIcon name={k.icon} /></span>
            <p className={`mt-0.5 text-[12px] font-bold leading-none tracking-tightest ${k.nCls}`}>{k.n}</p>
            <p className="truncate text-[5.5px] font-medium text-slate-600">{k.l}</p>
            <p className={`truncate text-[4.5px] ${k.subCls}`}>{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="text-[7.5px] font-semibold text-slate-800">Agenda</span>
          <div className="flex items-center gap-1">
            <span className="rounded border border-slate-200 px-1 text-[5.5px] text-slate-400">‹ <span className="text-slate-300">Hoy</span> ›</span>
            <span className="text-[5.5px] text-slate-500">{rango}</span>
            <span className="rounded bg-aproba-600 px-1.5 py-0.5 text-[5.5px] font-semibold text-white">+ Nueva cita</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((d, i) => (
            <div key={d} className={`h-[30px] rounded border p-0.5 text-center ${i === hoyIdx ? "border-aproba-100 bg-aproba-50/40" : "border-slate-100"}`}>
              <p className="text-[4.5px] font-semibold text-slate-400">{d}</p>
              <p className={`mx-auto text-[6px] font-semibold ${i === hoyIdx ? "flex h-2.5 w-2.5 items-center justify-center rounded-full bg-aproba-600 text-white" : "text-slate-700"}`}>{sumarDias(lunes, i).getDate()}</p>
              {citas[i] && <p className="mt-0.5 truncate rounded bg-aproba-50 px-0.5 text-[4px] font-medium text-aproba-700">{citas[i]}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <p className="mb-0.5 text-[5.5px] font-bold uppercase tracking-wide text-slate-400">Por servicios</p>
          {([["Arraigo sociolaboral", 100, "7"], ["Renovación de TIE", 71, "5"], ["Reagrupación familiar", 57, "4"]] as [string, number, string][]).map(([l, pct, v]) => (
            <div key={l} className="flex items-center gap-1 py-[1px]">
              <span className="w-[56px] truncate text-[5.5px] text-slate-600">{l}</span>
              <Barra pct={pct} />
              <span className="w-2.5 text-right text-[5.5px] font-semibold text-slate-700">{v}</span>
            </div>
          ))}
          <p className="text-[4.5px] font-semibold text-aproba-700">Ver más (5)</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <p className="mb-0.5 text-[5.5px] font-bold uppercase tracking-wide text-slate-400">Carga del equipo · activos</p>
          {([["MR", "Marta Ribas", 100, "14"], ["DF", "Diego Fuentes", 57, "8"], ["NC", "Nuria Camps", 29, "4"]] as [string, string, number, string][]).map(([i, l, pct, v]) => (
            <div key={l} className="flex items-center gap-1 py-[1px]">
              <Avatar txt={i} size="h-2.5 w-2.5 text-[3.5px]" />
              <span className="w-[40px] truncate text-[5.5px] text-slate-600">{l}</span>
              <Barra pct={pct} />
              <span className="w-2.5 text-right text-[5.5px] font-semibold text-slate-700">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Expedientes › En curso: árbol tema → servicio (expedientes-lista.tsx) ──
function Chevron({ abierto, cls = "text-slate-300" }: { abierto?: boolean; cls?: string }) {
  return <svg className={`h-1.5 w-1.5 shrink-0 ${cls} ${abierto ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>;
}

function Casilla({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] rounded-full px-1 py-[1px] text-[4.5px] font-medium ${ok ? "bg-aproba-50 text-aproba-700" : "bg-slate-50 text-slate-400"}`}>
      {ok
        ? <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        : <span className="h-1 w-1 rounded-full border border-current" />}
      {label}
    </span>
  );
}

function ExpedientesEnCurso() {
  type Fila = { n: string; ref: string; meta: string; num?: string; ok: [boolean, boolean, boolean, boolean]; who: string; plazo?: string };
  const filas: Fila[] = [
    { n: "Julia Mendoza Restrepo", ref: "EXP-2026-0041", meta: "6/6 docs · En trámite", num: "08/2026/004512", ok: [true, true, true, true], who: "MR" },
    { n: "Andrés Patiño", ref: "EXP-2026-0044", meta: "2/6 docs", ok: [true, false, false, false], who: "DF", plazo: "3 días" },
    { n: "Aïcha Diallo Diaz", ref: "EXP-2026-0046", meta: "5/6 docs", ok: [true, false, true, true], who: "MR" },
  ];
  const temas: [string, number][] = [["Residencia y trabajo", 7], ["Familia", 7], ["Nacionalidad", 5]];
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5 flex items-end justify-between gap-1.5">
        <Titulo texto="Expedientes" sub="26 en curso · 6 esperando al cliente" />
        <Vistas activa="curso" />
      </div>
      <div className="mb-1.5 flex items-center gap-1">
        <Buscador texto="Buscar cliente, trámite, referencia…" cls="min-w-0 flex-1" />
        <Desplegable texto="Todos los temas" />
        <Desplegable texto="Todo el equipo" />
        <Chip texto="Esperando al cliente" n={6} />
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* Tema abierto: borde verde a la izquierda, como en la app */}
        <div className="border-l-2 border-l-aproba-500 bg-aproba-50/30">
          <div className="flex items-center gap-1 px-1.5 py-[3px]">
            <Chevron abierto />
            <span className="flex-1 truncate text-[7px] font-semibold text-slate-800">Arraigo</span>
            <span className="flex h-2.5 min-w-[10px] items-center justify-center rounded-full bg-aproba-600 px-0.5 text-[5px] font-semibold text-white">7</span>
          </div>
          <div className="flex items-center gap-1 border-t border-slate-50 py-[2px] pl-4 pr-1.5">
            <Chevron abierto />
            <span className="flex-1 truncate text-[6px] text-slate-500">Arraigo sociolaboral</span>
            <span className="text-[5px] text-slate-300">7</span>
          </div>
          {filas.map((f) => (
            <div key={f.ref} className="flex items-center gap-1 border-t border-slate-50 bg-white py-[3px] pl-6 pr-1.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1">
                  <span className="truncate text-[6.5px] font-semibold text-slate-900">{f.n}</span>
                  {f.plazo && <span className="shrink-0 rounded bg-amber-50 px-0.5 text-[4.5px] font-medium text-amber-700">{f.plazo}</span>}
                </p>
                <p className="truncate text-[4.5px] text-slate-400"><span className="font-mono">{f.ref}</span> · {f.meta}</p>
              </div>
              {f.num
                ? <span className="shrink-0 font-mono text-[4.5px] text-slate-500">{f.num}</span>
                : <span className="shrink-0 rounded border border-dashed border-slate-300 px-0.5 text-[4.5px] text-slate-400">+ Nº expediente</span>}
              <span className="flex shrink-0 gap-[2px]">
                {(["Datos", "Docs", "Form.", "Cobro"] as const).map((l, i) => <Casilla key={l} ok={f.ok[i]} label={l} />)}
              </span>
              <Avatar txt={f.who} size="h-3 w-3 text-[4.5px]" />
            </div>
          ))}
        </div>
        {temas.map(([t, n]) => (
          <div key={t} className="flex items-center gap-1 border-t border-slate-100 px-1.5 py-[3px]">
            <Chevron />
            <span className="flex-1 truncate text-[7px] font-semibold text-slate-800">{t}</span>
            <span className="flex h-2.5 min-w-[10px] items-center justify-center rounded-full bg-aproba-600 px-0.5 text-[5px] font-semibold text-white">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Expedientes › Renovaciones: el Vigía (vencimientos-list.tsx) ──
function Renovaciones({ hoy }: { hoy: Date }) {
  const f = (dias: number) => fechaCorta(sumarDias(hoy, dias));
  const grupos: { titulo: string; tono: string; filas: { n: string; t: string; dot: string; espera?: boolean }[] }[] = [
    { titulo: "Ya caducadas (1)", tono: "text-red-600", filas: [{ n: "Karim Benali", t: `TIE · caducó hace 12 días (${f(-12)})`, dot: "bg-red-500" }] },
    { titulo: "Caducan en menos de 60 días (2)", tono: "text-amber-600", filas: [
      { n: "Oksana Koval", t: `TIE · caduca en 18 días (${f(18)})`, dot: "bg-amber-400" },
      { n: "Fatima El Amrani", t: `Renovación · caduca en 41 días (${f(41)})`, dot: "bg-amber-400" },
    ] },
    { titulo: "Esperando respuesta (1)", tono: "text-amber-700", filas: [{ n: "Liu Wei", t: `Propuesta enviada · ${f(-4).slice(0, 5)} · esperando respuesta`, dot: "bg-amber-400", espera: true }] },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1 flex items-end justify-between gap-1.5">
        <Titulo texto="Expedientes" sub="3 caducan en 60 días · 1 ya caducadas" />
        <Vistas activa="renovaciones" />
      </div>
      <p className="mb-1 text-[5.5px] leading-snug text-slate-500">Las tarjetas de tus clientes que caducan pronto. Inicia la renovación con un clic: se crea el expediente y se avisa al cliente en su idioma.</p>
      <div className="mb-1.5 flex items-center gap-1">
        <Buscador texto="Buscar cliente…" cls="w-[34%]" />
        <Chip texto="Urgentes" n={3} />
        <Chip texto="Más adelante" n={2} />
        <Chip texto="Esperando respuesta" n={1} />
      </div>
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-1">
          <p className={`mb-0.5 text-[5.5px] font-bold uppercase tracking-wide ${g.tono}`}>{g.titulo}</p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {g.filas.map((v) => (
              <div key={v.n} className="flex items-center gap-1.5 px-2 py-[3px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[7px] font-semibold text-slate-800">{v.n}</p>
                  <p className={`truncate text-[5px] ${v.espera ? "text-amber-700" : "text-slate-400"}`}>{v.t}</p>
                </div>
                {!v.espera && <span className="shrink-0 rounded bg-aproba-600 px-1.5 py-0.5 text-[5.5px] font-semibold text-white">Proponer renovación</span>}
                <svg className="h-2 w-2 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m-7 5v6m6-6v6M5 6l1 14h12l1-14"/></svg>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Clientes (app/app/clientes) ─────────────────────────────────────
function Clientes() {
  const rows = [
    { n: "Aïcha Diallo Diaz", of: "Oficina Barcelona", p: "Senegal", tr: "Arraigo sociolaboral", i: "AD", x: "2" },
    { n: "Andrés Patiño", of: "Oficina Barcelona", p: "Colombia", tr: "Arraigo sociolaboral", i: "AP", x: "1" },
    { n: "Fatima El Amrani", of: "Oficina Zaragoza", p: "Marruecos", tr: "Renovación TIE", i: "FE", x: "3" },
    { n: "Ioana Popescu", of: "Oficina Madrid", p: "Rumanía", tr: "Asignación de NIE", i: "IP", x: "2" },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <Titulo texto="Clientes" sub="24 clientes · 2 familias · 3 empresas" />
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-700">Importar datos</span>
          <span className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6.5px] font-semibold text-slate-700">+ Nuevo cliente</span>
        </div>
      </div>
      <div className="mb-1.5 flex gap-2.5 border-b border-slate-200 text-[6.5px] font-medium">
        <span className="border-b-2 border-aproba-600 pb-0.5 text-aproba-700">Clientes individuales (24)</span>
        <span className="pb-0.5 text-slate-400">Familias (2)</span>
        <span className="pb-0.5 text-slate-400">Empresas (3)</span>
      </div>
      <Buscador texto="Buscar por nombre o nacionalidad…" cls="mb-1.5 w-[48%]" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1 text-[5px] font-bold uppercase tracking-wide text-slate-400">
          <span className="flex-1">Cliente</span>
          <span className="w-[40px]">Nacionalidad</span>
          <span className="w-[60px]">Último trámite</span>
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
            <span className="w-[40px] truncate text-[6.5px] text-slate-500">{r.p}</span>
            <span className="w-[60px] truncate text-[6.5px] text-slate-500">{r.tr}</span>
            <span className="flex w-[14px] justify-end"><span className="rounded-full bg-slate-100 px-1 py-0.5 text-[6px] font-medium text-slate-500">{r.x}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Facturas › Estadísticas (estadisticas-vista.tsx) ────────────────
// Un año de ejemplo, mes a mes (€ sin IVA): la maqueta enseña los meses ya vividos del año
// del visitante, y las tarjetas SUMAN esos mismos meses — la gráfica y las cifras cuadran.
const INGRESOS = [4230, 5120, 4610, 6340, 5460, 5930, 6810, 3920, 6150, 6480, 5790, 4870];
const GASTOS = [2910, 3280, 3090, 3610, 3380, 3220, 3940, 2630, 3470, 3690, 3320, 2980];
const N_EMITIDAS = [19, 23, 21, 27, 24, 25, 29, 17, 26, 27, 25, 21];
const N_RECIBIDAS = [9, 11, 10, 12, 11, 10, 13, 8, 11, 12, 11, 9];
const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;

function Estadisticas({ hoy }: { hoy: Date }) {
  const meses = Math.max(3, hoy.getMonth() + 1);
  const suma = (a: number[]) => a.slice(0, meses).reduce((t, x) => t + x, 0);
  const ing = suma(INGRESOS), gas = suma(GASTOS), res = ing - gas;
  const rent = Math.round((res / ing) * 100);
  const W = 200, H = 58, base = 50, max = 7000, paso = W / 12;
  const y = (v: number) => base - (v / max) * 44;
  const curva = INGRESOS.slice(0, meses).map((v, i) => `${(i * paso + paso / 2).toFixed(1)},${y(v - GASTOS[i]).toFixed(1)}`).join(" ");
  const tarjetas: { l: string; v: string; cls: string; sub: string }[] = [
    { l: "Ingresos", v: eur(ing), cls: "text-slate-900", sub: `Sin IVA · ${suma(N_EMITIDAS)} facturas` },
    { l: "Gastos", v: eur(gas), cls: "text-slate-900", sub: `Sin IVA · ${suma(N_RECIBIDAS)} facturas` },
    { l: "Resultado", v: eur(res), cls: "text-aproba-700", sub: "Ingresos menos gastos" },
  ];
  return (
    <div>
      <Oficinas />
      <div className="mb-1 flex items-center justify-between gap-1.5">
        <Titulo texto="Facturas" sub="Tu facturación de un vistazo: lo emitido frente a lo recibido." />
        <div className="flex shrink-0 items-center gap-1">
          {["Informe PDF", "Excel"].map((b) => (
            <span key={b} className="flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[6px] font-semibold text-slate-700">
              <svg className="h-1.5 w-1.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
              {b}
            </span>
          ))}
        </div>
      </div>
      <div className="mb-1 flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 text-[6px] font-semibold text-slate-600">
          <span className="px-1">Emitidas</span>
          <span className="px-1">Recibidas</span>
          <span className="flex items-center gap-0.5 rounded bg-aproba-600 px-1 py-0.5 text-white">
            <svg className="h-1.5 w-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M7 14l4-4 4 4 5-6"/></svg>
            Estadísticas
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[5.5px] font-medium text-slate-500">
          <span className="rounded bg-white px-1 py-0.5 font-semibold text-slate-800 shadow-sm">{hoy.getFullYear()}</span>
          <span className="rounded bg-white px-1 py-0.5 font-semibold text-slate-800 shadow-sm">Año completo</span>
          {["T1", "T2", "T3", "T4"].map((q) => <span key={q} className="px-1">{q}</span>)}
        </div>
      </div>
      <div className="mb-1 grid grid-cols-4 gap-1">
        {tarjetas.map((t) => (
          <div key={t.l} className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center">
            <p className="text-[4.5px] font-semibold uppercase tracking-wide text-slate-400">{t.l}</p>
            <p className={`text-[9px] font-bold tracking-tightest ${t.cls}`}>{t.v}</p>
            <p className="truncate text-[4.5px] text-slate-400">{t.sub}</p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center">
          <p className="text-[4.5px] font-semibold uppercase tracking-wide text-slate-400">Rentabilidad</p>
          <p className="text-[9px] font-bold tracking-tightest text-aproba-700">{rent} %</p>
          <span className="mx-auto mt-[1px] block h-[2px] w-3/4 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-aproba-500" style={{ width: `${rent}%` }} /></span>
          <p className="text-[4px] leading-tight text-slate-400">De cada 100 € que facturas, te quedan {rent} €.</p>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-1.5 py-1">
        <p className="text-[6px] font-semibold text-slate-800">Ingresos y gastos por mes · {hoy.getFullYear()}</p>
        <p className="text-[4.5px] text-slate-400">Sin IVA. La curva es el resultado de cada mes.</p>
        <svg viewBox={`0 0 ${W} ${H + 6}`} className="mt-0.5 block w-full">
          {[0, 1, 2].map((k) => <line key={k} x1="0" x2={W} y1={base - k * 22} y2={base - k * 22} stroke="#e2e8f0" strokeWidth="0.4" strokeDasharray={k ? "1.5 1.5" : undefined} />)}
          {INGRESOS.slice(0, meses).map((v, i) => (
            <g key={i}>
              <rect x={i * paso + paso / 2 - 4.2} y={y(v)} width="3.8" height={base - y(v)} rx="0.8" fill="#10B083" />
              <rect x={i * paso + paso / 2 + 0.4} y={y(GASTOS[i])} width="3.8" height={base - y(GASTOS[i])} rx="0.8" fill="#cbd5e1" />
            </g>
          ))}
          <polyline points={curva} fill="none" stroke="#0f172a" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round" />
          {MESES.map((m, i) => <text key={m} x={i * paso + paso / 2} y={H + 4} textAnchor="middle" fontSize="3.6" fill="#94a3b8">{m}</text>)}
        </svg>
      </div>
    </div>
  );
}

// ── Ajustes: las siete secciones plegadas (AjustesSection) ──────────
function MenuIcon({ name }: { name: "services" | "bell" | "plug" | "doc" | "card" | "team" | "building" }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-2.5 w-2.5" };
  if (name === "bell") return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
  if (name === "plug") return <svg {...p}><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0z"/><path d="M12 18v4"/></svg>;
  if (name === "doc") return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>;
  if (name === "card") return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
  if (name === "team") return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>;
  if (name === "building") return <svg {...p}><path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/></svg>;
  return <svg {...p}><path d="M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 7V5h6v2"/></svg>;
}

function Ajustes() {
  const secciones: { icon: "services" | "bell" | "plug" | "doc" | "card" | "team" | "building"; label: string; sub: string }[] = [
    { icon: "services", label: "Servicios", sub: "12 activos · en carpetas por tema, con precios y documentos" },
    { icon: "bell", label: "Notificaciones al cliente", sub: "Email · avisos automáticos en cada paso" },
    { icon: "plug", label: "Integraciones", sub: "Email entrante · bandeja · Google Meet" },
    { icon: "doc", label: "Hoja de encargo y mandato", sub: "Activada — el cliente firma desde su portal" },
    { icon: "card", label: "Facturación y métodos de pago", sub: "Serie 2026 · cuenta bancaria · cobro con tarjeta" },
    { icon: "team", label: "Plan y equipo", sub: "Business · 3 usuarios · 3 oficinas" },
    { icon: "building", label: "Despacho y cuenta", sub: "Datos de tu gestoría y de tu usuario" },
  ];
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-[12px] font-bold tracking-tightest text-slate-900">Ajustes</span>
        <p className="text-[7px] text-slate-500">Configura tus servicios, los avisos a tus clientes y los datos de tu despacho.</p>
      </div>
      <div className="space-y-[2px] pb-4">
        {secciones.map((x) => (
          <div key={x.label} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-[2px]">
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

// Seis escenas sobre las cinco entradas (Expedientes dos veces) y cuánto dura cada una:
// las densas (árbol, estadísticas) un poco más.
const ESCENAS: { tab: number; ms: number; C: (p: { hoy: Date }) => React.ReactElement }[] = [
  { tab: 0, ms: 2800, C: Inicio },
  { tab: 1, ms: 3400, C: ExpedientesEnCurso },
  { tab: 1, ms: 3000, C: Renovaciones },
  { tab: 2, ms: 2600, C: Clientes },
  { tab: 3, ms: 3400, C: Estadisticas },
  { tab: 4, ms: 2400, C: Ajustes },
];

export function HeroAnimation() {
  const [escena, setEscena] = useState(0);
  const [hoy, setHoy] = useState(HOY_FIJO);

  useEffect(() => { setHoy(new Date()); }, []);
  useEffect(() => {
    const t = setTimeout(() => setEscena((x) => (x + 1) % ESCENAS.length), ESCENAS[escena].ms);
    return () => clearTimeout(t);
  }, [escena]);

  const { tab, C: Active } = ESCENAS[escena];

  return (
    <div
      role="img"
      aria-label="Aproba en una tableta: el inicio del despacho, los expedientes en curso, las renovaciones, los clientes, las estadísticas de facturación y los ajustes."
      className="relative mx-auto flex h-[420px] w-full items-center justify-center"
    >
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
              {/* sidebar — en móvil no cabe: el mockup pasa a «modo compacto» y cada pantalla ya lleva su título. */}
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
                  <span className="rounded-md bg-aproba-600 px-1.5 py-0.5 text-[7px] font-semibold text-white">+ Nuevo expediente</span>
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <div key={escena} className="h-full animate-fadein overflow-hidden p-3">
                    <Active hoy={hoy} />
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
