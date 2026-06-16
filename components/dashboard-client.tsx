"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOARD_COLUMNS, ESTADO_META, type ExpedienteEstado } from "@/lib/types";
import { loadArchivados } from "@/lib/archivo";

export type DashItem = {
  id: string;
  clienteNombre: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string;
};

const TODAY = 11; // "hoy" de référence : 11/06
const dayVal = (f?: string) => {
  if (!f) return Infinity;
  const [d, m] = f.split("/").map(Number);
  return ((m ?? 6) - 6) * 30 + (d ?? 0);
};
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

function AccionRow({ e }: { e: DashItem }) {
  const dv = dayVal(e.fechaLimite);
  const vencido = dv < TODAY;
  const pronto = dv >= TODAY && dv <= TODAY + 7;
  const accion = e.estado === "FORM_GENERADO"
    ? { label: "Presentar en sede", cls: "bg-blue-100 text-blue-700" }
    : { label: "Generar formularios", cls: "bg-aproba-100 text-aproba-700" };
  return (
    <Link href={`/app/expedientes/${e.id}`} className="flex items-center gap-3 border-b border-slate-100 px-2 py-2.5 transition last:border-0 hover:bg-cream-50">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{initials(e.clienteNombre)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
        <p className="truncate text-xs text-slate-400">{e.tipoLabel}</p>
      </div>
      <span className={`hidden shrink-0 rounded-md px-2 py-1 text-xs font-semibold sm:inline ${accion.cls}`}>{accion.label}</span>
      {e.fechaLimite && <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${vencido ? "bg-red-100 text-red-700" : pronto ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{vencido ? "Vencido" : e.fechaLimite}</span>}
      <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-semibold text-aproba-700 md:flex">{initials(e.asignadoA)}</span>
    </Link>
  );
}

function Icon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px]";
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
  if (name === "clock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
  if (name === "folder") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function DashboardClient({ items, usuario }: { items: DashItem[]; usuario?: string }) {
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  useEffect(() => { setArchivados(loadArchivados()); }, []);

  const live = useMemo(() => items.filter((e) => !archivados.has(e.id)), [items, archivados]);

  const activos = live.filter((e) => e.estado !== "RESUELTO" && e.estado !== "RECHAZADO");
  const accion = live.filter((e) => e.estado === "DOCS_VALIDADOS" || e.estado === "FORM_GENERADO")
    .sort((a, b) => dayVal(a.fechaLimite) - dayVal(b.fechaLimite) || (a.estado === "FORM_GENERADO" ? -1 : 1));
  const vencenSemana = live.filter((e) => { const d = dayVal(e.fechaLimite); return d !== Infinity && d <= TODAY + 7; });
  const vencidos = live.filter((e) => dayVal(e.fechaLimite) < TODAY).length;
  const resueltos = live.filter((e) => e.estado === "RESUELTO").length;
  const esperandoCliente = live.filter((e) => e.estado === "DOCS_PENDIENTES").length;

  const porEstado = BOARD_COLUMNS.map((estado) => ({ estado, count: live.filter((e) => e.estado === estado).length }));
  const maxEstado = Math.max(1, ...porEstado.map((p) => p.count));

  const carga = Object.entries(activos.reduce<Record<string, number>>((acc, e) => { acc[e.asignadoA] = (acc[e.asignadoA] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const maxCarga = Math.max(1, ...carga.map(([, n]) => n));

  const KPIS = [
    { n: accion.length, label: "Requieren tu acción", tone: "border-aproba-300 bg-aproba-50", num: "text-aproba-700", icon: "bell", emph: true },
    { n: vencenSemana.length, label: "Vencen esta semana", sub: vencidos ? `${vencidos} vencidos` : undefined, tone: "border-slate-200 bg-white", num: "text-amber-600", icon: "clock", emph: false },
    { n: activos.length, label: "Expedientes activos", sub: `${esperandoCliente} esperando cliente`, tone: "border-slate-200 bg-white", num: "text-slate-900", icon: "folder", emph: false },
    { n: resueltos, label: "Resueltos", tone: "border-slate-200 bg-white", num: "text-slate-900", icon: "check", emph: false },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">Hola{usuario ? `, ${usuario.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-aproba-700">{accion.length} expedientes</span> requieren tu acción
          {vencidos > 0 && <> · <span className="font-semibold text-red-600">{vencidos} vencidos</span></>}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.label} className={`rounded-2xl border p-5 ${k.tone}`}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.emph ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon name={k.icon} /></span>
            <p className={`mt-4 text-3xl font-bold tracking-tightest ${k.num}`}>{k.n}</p>
            <p className="text-sm font-medium text-slate-600">{k.label}</p>
            {k.sub && <p className="mt-0.5 text-xs text-slate-400">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Requieren tu acción</h2>
          <Link href="/app/expedientes" className="text-sm font-semibold text-aproba-700 hover:underline">Ver tablero →</Link>
        </div>
        <div>{accion.slice(0, 8).map((e) => <AccionRow key={e.id} e={e} />)}</div>
        {accion.length > 8 && <Link href="/app/expedientes" className="mt-3 block text-center text-sm font-medium text-slate-500 hover:text-slate-800">Ver los {accion.length} expedientes →</Link>}
        {accion.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nada pendiente. ¡Buen trabajo!</p>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Por estado</h2>
          <div className="space-y-2.5">
            {porEstado.map(({ estado, count }) => {
              const meta = ESTADO_META[estado];
              return (
                <div key={estado} className="flex items-center gap-3">
                  <span className="flex w-32 shrink-0 items-center gap-2 text-sm text-slate-600"><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${(count / maxEstado) * 100}%` }} /></div>
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Carga del equipo · activos</h2>
          <div className="space-y-2.5">
            {carga.map(([nombre, n]) => (
              <div key={nombre} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-semibold text-aproba-700">{initials(nombre)}</span>
                <span className="w-20 shrink-0 text-sm text-slate-600">{nombre}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-aproba-500" style={{ width: `${(n / maxCarga) * 100}%` }} /></div>
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app/expedientes/nuevo" className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">+ Nuevo expediente</Link>
        <Link href="/app/expedientes" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Ver tablero</Link>
        <Link href="/app/ajustes" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Configurar servicios</Link>
      </div>
    </div>
  );
}
