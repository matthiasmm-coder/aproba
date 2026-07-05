"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BOARD_PHASES, ACCION_ESTADO, type ExpedienteEstado } from "@/lib/types";
import { loadArchivados } from "@/lib/archivo";
import { useT } from "@/components/lang-provider";
import { NextAction } from "@/components/next-action";
import { ProximasCitas } from "@/components/proximas-citas";
import type { ItemAgenda, ClienteMin } from "@/lib/data/citas";

export type DashItem = {
  id: string;
  clienteNombre: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string; // label dd/mm/aaaa
  fechaLimiteISO?: string; // para calcular días restantes REALES
  archivado?: boolean; // servidor — compartido por el equipo
};

// Días hasta la fecha límite, con la fecha REAL de hoy (antes: TODAY=11 mockeado —
// los badges «Vencido» y el orden eran falsos todos los días salvo el 11/06).
const diasHasta = (iso?: string) => {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : Math.ceil((t - Date.now()) / 864e5);
};
const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2);

function AccionRow({ e }: { e: DashItem }) {
  const t = useT();
  const dias = diasHasta(e.fechaLimiteISO);
  const vencido = dias < 0;
  const pronto = dias >= 0 && dias <= 7;
  return (
    <Link href={`/app/expedientes/${e.id}`} className="flex items-center gap-3 border-b border-slate-100 px-2 py-2.5 transition last:border-0 hover:bg-cream-50">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{initials(e.clienteNombre)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{e.clienteNombre}</p>
        <p className="truncate text-xs text-slate-400">{e.tipoLabel}</p>
        {/* La acción canónica (misma fuente que tablero y ficha). En móvil, 2ª línea. */}
        <NextAction estado={e.estado} className="sm:hidden" />
      </div>
      <NextAction estado={e.estado} className="hidden shrink-0 sm:inline-flex" />
      {e.fechaLimite && <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${vencido ? "bg-red-100 text-red-700" : pronto ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{vencido ? t("Vencido") : e.fechaLimite}</span>}
      <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-semibold text-aproba-700 md:flex">{initials(e.asignadoA)}</span>
    </Link>
  );
}

function Icon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px]";
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
  if (name === "clock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
  if (name === "folder") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>;
  if (name === "calendar") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function DashboardClient({ items, usuario, citas, clientes, caducanPronto = 0, caducadas = 0 }: { items: DashItem[]; usuario?: string; citas: ItemAgenda[]; clientes: ClienteMin[]; caducanPronto?: number; caducadas?: number }) {
  const t = useT();
  const router = useRouter();
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  useEffect(() => { setArchivados(loadArchivados()); }, []);

  const live = useMemo(() => items.filter((e) => !e.archivado && !archivados.has(e.id)), [items, archivados]);

  const activos = live.filter((e) => e.estado !== "FINALIZADO" && e.estado !== "RECHAZADO");
  // «Requieren tu acción» = TODOS los estados donde le toca al gestor (fuente única
  // ACCION_ESTADO). Antes solo 2 estados: un RESUELTO (cliente esperando su cita de
  // huellas) desaparecía del radar.
  const accion = live.filter((e) => ACCION_ESTADO[e.estado] && !ACCION_ESTADO[e.estado].espera)
    .sort((a, b) => diasHasta(a.fechaLimiteISO) - diasHasta(b.fechaLimiteISO));
  const vencenSemana = live.filter((e) => { const d = diasHasta(e.fechaLimiteISO); return d !== Infinity && d <= 7; });
  const vencidos = live.filter((e) => diasHasta(e.fechaLimiteISO) < 0).length;
  const esperandoCliente = live.filter((e) => e.estado === "DOCS_PENDIENTES").length;

  const porFase = BOARD_PHASES.map((ph) => ({ ph, count: live.filter((e) => ph.estados.includes(e.estado)).length }));
  const maxFase = Math.max(1, ...porFase.map((p) => p.count));

  const carga = Object.entries(activos.reduce<Record<string, number>>((acc, e) => { acc[e.asignadoA] = (acc[e.asignadoA] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const maxCarga = Math.max(1, ...carga.map(([, n]) => n));

  // 4 KPI, todos CLICABLES (antes ninguno lo era). «Caducan pronto» expone Vigía desde
  // Inicio (sustituye al retrospectivo «Resueltos»). «Plazos esta semana» = fechas límite
  // de expedientes (≠ caducidades de tarjetas).
  const KPIS = [
    { n: accion.length, label: t("Requieren tu acción"), href: "/app/expedientes", tone: "border-aproba-300 bg-aproba-50", num: "text-aproba-700", icon: "bell", emph: true },
    { n: vencenSemana.length, label: t("Plazos esta semana"), sub: vencidos ? `${vencidos} ${t("vencidos")}` : undefined, href: "/app/expedientes", tone: "border-slate-200 bg-white", num: "text-amber-600", icon: "clock", emph: false },
    { n: activos.length, label: t("Expedientes activos"), sub: `${esperandoCliente} ${t("esperando cliente")} →`, subHref: "/app/expedientes?filtro=esperando", href: "/app/expedientes", tone: "border-slate-200 bg-white", num: "text-slate-900", icon: "folder", emph: false },
    { n: caducanPronto, label: t("Caducan pronto"), sub: caducadas ? `${caducadas} ${t("ya caducadas")}` : t("tarjetas · próximos 60 días"), href: "/app/vencimientos", tone: "border-slate-200 bg-white", num: caducadas ? "text-red-600" : caducanPronto ? "text-amber-600" : "text-slate-900", icon: "calendar", emph: false },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Hola")}{usuario ? `, ${usuario.split(" ")[0]}` : ""}</h1>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-aproba-700">{accion.length} {t("expedientes")}</span> {t("requieren tu acción")}
          {vencidos > 0 && <> · <span className="font-semibold text-red-600">{vencidos} {t("vencidos")}</span></>}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((k) => (
          <Link key={k.label} href={k.href} className={`rounded-2xl border p-5 transition hover:shadow-sm ${k.tone}`}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.emph ? "bg-aproba-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon name={k.icon} /></span>
            <p className={`mt-4 text-3xl font-bold tracking-tightest ${k.num}`}>{k.n}</p>
            <p className="text-sm font-medium text-slate-600">{k.label}</p>
            {k.sub && ((k as { subHref?: string }).subHref ? (
              <button
                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); router.push((k as { subHref?: string }).subHref!); }}
                className="mt-0.5 text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
              >{k.sub}</button>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">{k.sub}</p>
            ))}
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{t("Requieren tu acción")}</h2>
          <Link href="/app/expedientes" className="text-sm font-semibold text-aproba-700 hover:underline">{t("Ver tablero")} →</Link>
        </div>
        <div>{accion.slice(0, 8).map((e) => <AccionRow key={e.id} e={e} />)}</div>
        {accion.length > 8 && <Link href="/app/expedientes" className="mt-3 block text-center text-sm font-medium text-slate-500 hover:text-slate-800">{t("Ver los")} {accion.length} {t("expedientes")} →</Link>}
        {accion.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("Nada pendiente. ¡Buen trabajo!")}</p>}
      </div>

      <div className="mt-6">
        <ProximasCitas citas={citas} clientes={clientes} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Por fase")}</h2>
          <div className="space-y-2.5">
            {porFase.map(({ ph, count }, i) => (
              <div key={ph.key} className="flex items-center gap-3">
                <span className="flex w-32 shrink-0 items-center gap-2 text-sm text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-[10px] font-bold text-aproba-700">{i + 1}</span>
                  {t(ph.label)}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-aproba-500" style={{ width: `${(count / maxFase) * 100}%` }} /></div>
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Carga del equipo · activos")}</h2>
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
    </div>
  );
}
