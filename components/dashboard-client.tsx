"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExpedienteEstado } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { AvatarGestor, type Avatares } from "@/components/avatar-gestor";
import { esperaAlCliente } from "@/lib/progreso";
import { AgendaCitas } from "@/components/agenda-citas";
import type { ItemAgenda, ClienteMin } from "@/lib/data/citas";
import type { Progreso } from "@/lib/progreso";

export type DashItem = {
  id: string;
  clienteNombre: string;
  tipoLabel: string;
  servicio?: string; // servicio principal o, si lleva todos los del pack, el pack
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string; // label dd/mm/aaaa
  fechaLimiteISO?: string; // para calcular días restantes REALES
  archivado?: boolean; // servidor — compartido por el equipo
  progreso?: Progreso; // fase y acción calculadas en el servidor (lib/progreso.ts)
};

// Días hasta la fecha límite, con la fecha REAL de hoy (antes: TODAY=11 mockeado —
// los badges «Vencido» y el orden eran falsos todos los días salvo el 11/06).

// Iconos de los KPI (trazos Lucide, licencia ISC), a 18 px en su cuadrado: carpeta
// abierta = en curso, reloj de arena = esperando al cliente, euro = esperando su pago,
// calendario con reloj = caduca pronto.
function Icon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px]";
  if (name === "folder") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></svg>;
  if (name === "clock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14M5 2h14" /><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" /></svg>;
  if (name === "euro") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M4 14h9" /><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" /></svg>;
  if (name === "calendar") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" /><path d="M16 2v4M8 2v4M3 10h5" /><circle cx="16" cy="16" r="6" /><path d="M17.5 17.5 16 16.3V14" /></svg>;
  if (name === "bell") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /><path d="M10.268 21a2 2 0 0 0 3.464 0" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function DashboardClient({ items, usuario, citas, clientes, equipo = [], sedesVista = null, caducanPronto = 0, caducadas = 0, bandejaPendientes = 0, esperandoPago = 0, cobrosVencidos = 0, hoy, avatares = {} }: { items: DashItem[]; usuario?: string; citas: ItemAgenda[]; clientes: ClienteMin[]; equipo?: { nombre: string; esAdmin: boolean; sedes: string[] }[]; sedesVista?: string[] | null; caducanPronto?: number; caducadas?: number; bandejaPendientes?: number; esperandoPago?: number; cobrosVencidos?: number; hoy: string; avatares?: Avatares }) {
  const t = useT();
  const router = useRouter();
  // El servidor ya no manda archivados (fetchExpedientesResumen soloVivos). La caché
  // local de archivados ya no se consulta: un id viejo escondería un expediente VIVO de
  // los recuentos. `archivado` se mantiene como cinturón si la consulta cayera al repli.
  const live = useMemo(() => items.filter((e) => !e.archivado), [items]);

  const activos = live.filter((e) => e.estado !== "FINALIZADO" && e.estado !== "RECHAZADO");
  // Hecho, no estado: un expediente con formularios ya generados no espera a nadie.
  // Definición ÚNICA (lib/progreso.ts) — la comparte el filtro de la lista de Expedientes,
  // adonde lleva este KPI.
  const esperandoCliente = live.filter(esperaAlCliente).length;

  // POR SERVICIOS: qué se vende de verdad, contado sobre los expedientes vivos. Packs
  // incluidos (el servidor ya resolvió cuál es el pack de cada expediente).
  const porServicio = [...live.reduce((m, e) => {
    const k = (e.servicio ?? e.tipoLabel ?? "").replace(/ \+\d+$/, "").trim() || "—";
    return m.set(k, (m.get(k) ?? 0) + 1);
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const maxServicio = Math.max(1, ...porServicio.map(([, n]) => n));
  const [verTodos, setVerTodos] = useState(false);

  // La carga depende de la sede mirada (los items YA vienen filtrados por la pastilla):
  // en una sede concreta, filas = miembros DE esa sede (con su 0: sirve para repartir
  // trabajo) + quien realmente lleve carga en la vista (un admin, o un compañero de
  // otra sede con un expediente aquí — ocultarlo mentiría sobre quién lo lleva).
  const cargaPorNombre = activos.reduce<Record<string, number>>((acc, e) => { acc[e.asignadoA] = (acc[e.asignadoA] ?? 0) + 1; return acc; }, {});
  const miembrosVista = sedesVista
    ? equipo.filter((m) => !m.esAdmin && m.sedes.some((s) => sedesVista.includes(s))).map((m) => m.nombre)
    : []; // «Todas»: como siempre, solo quien lleva carga (sin 0s — la lista sería larga)
  // «Sin asignar» no es una persona: fuera de la carga (03/09), como en el filtro del tablero.
  const nombresCarga = [...new Set([...miembrosVista, ...Object.keys(cargaPorNombre)])].filter((n) => n !== "Sin asignar");
  const carga = nombresCarga.map((n): [string, number] => [n, cargaPorNombre[n] ?? 0]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxCarga = Math.max(1, ...carga.map(([, n]) => n));

  // 4 KPI, todos CLICABLES (antes ninguno lo era). «Caducan pronto» expone Vigía desde
  // Inicio (sustituye al retrospectivo «Resueltos»). «Plazos esta semana» = fechas límite
  // de expedientes (≠ caducidades de tarjetas).
  // Los cuatro KPI, en el orden que pidió Matthias (20/09): lo que tengo abierto, lo que
  // espera del cliente (documentos), lo que espera su dinero, y lo que caduca.
  const KPIS = [
    { n: activos.length, label: t("Expedientes activos"), href: "/app/expedientes", tone: "border-slate-200 bg-white", num: "text-slate-900", icon: "folder" },
    { n: esperandoCliente, label: t("Esperando al cliente"), sub: t("documentos e información"), href: "/app/expedientes?filtro=esperando", tone: "border-slate-200 bg-white", num: esperandoCliente ? "text-amber-600" : "text-slate-900", icon: "clock" },
    { n: esperandoPago, label: t("Esperando pago"), sub: cobrosVencidos ? `${cobrosVencidos} ${cobrosVencidos === 1 ? t("factura vencida") : t("facturas vencidas")}` : t("facturas enviadas sin cobrar"), href: "/app/facturas", tone: "border-slate-200 bg-white", num: cobrosVencidos ? "text-red-600" : esperandoPago ? "text-amber-600" : "text-slate-900", icon: "euro" },
    { n: caducanPronto, label: t("Caducan pronto"), sub: caducadas ? `${caducadas} ${t("ya caducadas")}` : t("tarjetas · próximos 60 días"), href: "/app/vencimientos", tone: "border-slate-200 bg-white", num: caducadas ? "text-red-600" : caducanPronto ? "text-amber-600" : "text-slate-900", icon: "calendar" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Solo el saludo: lo que decía la frase de debajo ya lo dicen las tarjetas de
          abajo («Requieren tu acción» y los vencidos de «Plazos esta semana»). */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Hola")}{usuario ? `, ${usuario.split(" ")[0]}` : ""}</h1>
      </div>

      {bandejaPendientes > 0 && (
        <Link href="/app/ajustes?abrir=integraciones" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
          </span>
          <span><b>{bandejaPendientes}</b> {t(bandejaPendientes === 1 ? "email con documentos espera a que digas de qué cliente es" : "emails con documentos esperan a que digas de qué cliente son")} · <span className="font-semibold underline underline-offset-2">{t("Ver la bandeja")}</span></span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((k) => (
          // El verde aparece al PASAR POR ENCIMA (borde e icono): en reposo las cuatro
          // tarjetas son iguales y lo único que habla son las cifras.
          <Link key={k.label} href={k.href} className={`group flex flex-col items-center rounded-2xl border p-5 text-center transition hover:border-aproba-400 hover:shadow-sm ${k.tone}`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-aproba-600 group-hover:text-white"><Icon name={k.icon} /></span>
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

      {/* La lista «Requieren tu acción» se retiró (pedido de Matthias, 07/08/2026):
          duplicaba el KPI de arriba, que ya enlaza al tablero con el detalle. */}
      <div className="mt-6">
        <AgendaCitas citas={citas} clientes={clientes} hoy={hoy} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Por servicios")}</h2>
          <div className="space-y-2.5">
            {porServicio.length === 0 && <p className="text-sm text-slate-400">{t("Todavía no hay expedientes en curso.")}</p>}
            {/* Los tres más pedidos; el resto, a un clic. */}
            {(verTodos ? porServicio : porServicio.slice(0, 3)).map(([nombre, n]) => (
              <div key={nombre} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-slate-600" title={nombre}>{nombre}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-aproba-500" style={{ width: `${(n / maxServicio) * 100}%` }} /></div>
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-700">{n}</span>
              </div>
            ))}
            {porServicio.length > 3 && (
              <button
                type="button" onClick={() => setVerTodos((v) => !v)}
                className="text-xs font-semibold text-aproba-700 transition hover:underline"
              >
                {verTodos ? t("Ver menos") : `${t("Ver más")} (${porServicio.length - 3})`}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Carga del equipo · activos")}</h2>
          <div className="space-y-2.5">
            {carga.length === 0 && <p className="text-sm text-slate-400">{t("Esta oficina aún no tiene miembros asignados.")}</p>}
            {carga.map(([nombre, n]) => (
              <div key={nombre} className="flex items-center gap-3">
                <AvatarGestor nombre={nombre} foto={avatares[nombre]} size={28} />
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
