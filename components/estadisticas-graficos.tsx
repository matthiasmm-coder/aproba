"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { eur } from "@/lib/facturas";
import { MESES_CORTOS_ES, MESES_LARGOS_ES as MESES_LARGOS, curva, curvaInversa, type Punto as P, escalaEje, eurCorto, pct, ultimoMesConDatos, type Mes } from "@/lib/estadisticas-facturacion";

// Gráficos de Facturas › Estadísticas. SVG propio, sin librería: tres gráficos no justifican
// 100 kB de dependencia. Se dibujan al ancho REAL del contenedor (ResizeObserver): con un
// viewBox fijo, en el móvil los textos del eje quedaban a 5 px.
// Acabado (25/09/2026, «premium»): degradados, barras de esquinas redondas, curvas suaves
// (monótonas: nunca inventan un pico que no existe), zona de beneficio entre ingresos y
// gastos, ficha flotante al pasar por un mes y entrada animada (salvo «reducir movimiento»).

const ALTO = 280;
const M = { l: 52, r: 14, t: 18, b: 30 };

// Ancho medido del contenedor. null hasta la primera medida: el gráfico no se dibuja a un
// ancho supuesto (en el móvil saltaba de 117 a 280 px de alto y movía toda la página).
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

// Ids de degradados únicos por gráfico (useId trae «:» que url(#…) no acepta).
const useIds = () => useId().replace(/[^a-zA-Z0-9]/g, "");

// Barra con las esquinas del extremo redondeadas (arriba si es positiva, abajo si no).
function barra(x: number, w: number, yv: number, y0: number, r = 4): string {
  const h = Math.abs(y0 - yv);
  if (h < 0.5) return "";
  const rr = Math.min(r, w / 2, h);
  if (yv <= y0) return `M${x},${y0} V${yv + rr} Q${x},${yv} ${x + rr},${yv} H${x + w - rr} Q${x + w},${yv} ${x + w},${yv + rr} V${y0} Z`;
  return `M${x},${y0} V${yv - rr} Q${x},${yv} ${x + rr},${yv} H${x + w - rr} Q${x + w},${yv} ${x + w},${yv - rr} V${y0} Z`;
}

function Rejilla({ ancho, ticks, y, formato = eurCorto }: { ancho: number; ticks: number[]; y: (v: number) => number; formato?: (v: number) => string }) {
  return (
    <g>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={ancho - M.r} y1={y(v)} y2={y(v)} strokeWidth={1} className={v === 0 ? "stroke-slate-300" : "stroke-slate-200/80"} strokeDasharray={v === 0 ? undefined : "3 5"} />
          <text x={M.l - 10} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{formato(v)}</text>
        </g>
      ))}
    </g>
  );
}

function EjeMeses({ gw, resaltar, sel, t }: { gw: number; resaltar: Set<number>; sel: number | null; t: (s: string) => string }) {
  const cada = gw < 24 ? 2 : 1; // con poco sitio, un mes de cada dos (las barras siguen todas)
  return (
    <g>
      {MESES_CORTOS_ES.map((m, i) => (i % cada === 0 || sel === i ? (
        <text key={m} x={M.l + gw * i + gw / 2} y={ALTO - 9} textAnchor="middle"
          className={`text-[11px] transition-colors ${sel === i ? "fill-slate-900 font-semibold" : resaltar.size === 0 || resaltar.has(i + 1) ? "fill-slate-500" : "fill-slate-300"}`}>{t(m)}</text>
      ) : null))}
    </g>
  );
}

function Leyenda({ items }: { items: { color: string; label: string; forma?: "punto" | "linea" | "discontinua" | "rayas" }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-100">
          {it.forma === "linea" || it.forma === "discontinua"
            ? <svg width="16" height="8" aria-hidden><line x1="1" y1="4" x2="15" y2="4" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={it.forma === "discontinua" ? "3 3" : undefined} className={it.color} /></svg>
            : it.forma === "rayas"
              ? <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#6EE7B7_0,#6EE7B7_2px,#D1FAE5_2px,#D1FAE5_4px)]" />
              : <span className={`inline-block h-2.5 w-2.5 rounded-full ${it.color}`} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Ficha flotante del mes: sigue a la columna y no se sale del gráfico.
function Ficha({ x, ancho, titulo, filas }: { x: number; ancho: number; titulo: string; filas: { color: string; label: string; valor: string; fuerte?: boolean; rojo?: boolean }[] }) {
  const w = 208;
  const left = Math.max(4, Math.min(ancho - w - 4, x + 14 > ancho - w - 4 ? x - w - 14 : x + 14));
  return (
    <div className="pointer-events-none absolute top-3 z-10 animate-aparecer rounded-xl border border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-float backdrop-blur-sm motion-reduce:animate-none" style={{ left, width: w }}>
      <p className="text-xs font-semibold capitalize text-slate-900">{titulo}</p>
      <div className="mt-1.5 space-y-1">
        {filas.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500"><span className={`inline-block h-2 w-2 rounded-full ${f.color}`} />{f.label}</span>
            <span className={`tabular-nums ${f.rojo ? "font-semibold text-red-600" : f.fuerte ? "font-semibold text-slate-900" : "text-slate-700"}`}>{f.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Vacio({ anio, t }: { anio: number; t: (s: string) => string }) {
  return <div className="flex h-[280px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">{t("Sin facturas en")} {anio}</div>;
}

// ── Ingresos y gastos por mes (sin IVA), con la curva del resultado ─────────────────────
export function GraficoMensual({ meses, anio, resaltar = [] }: { meses: Mes[]; anio: number; resaltar?: number[] }) {
  const t = useT();
  const id = useIds();
  const { ref, ancho: medido } = useAncho();
  const ancho = medido ?? 720;
  const [sel, setSel] = useState<number | null>(null);
  const hayDesglose = meses.some((m) => m.ingresosSinDesglose > 0 || m.gastosSinDesglose > 0);
  const ultimo = ultimoMesConDatos(meses);
  const valores = meses.flatMap((m) => [m.ingresos + m.ingresosSinDesglose, m.gastos + m.gastosSinDesglose, m.resultado]);
  const { desde, hasta, ticks } = escalaEje(Math.min(0, ...valores), Math.max(0, ...valores));
  const plotH = ALTO - M.t - M.b;
  const y = (v: number) => M.t + (plotH * (hasta - v)) / (hasta - desde);
  const gw = (ancho - M.l - M.r) / 12;
  const bw = Math.max(4, Math.min(20, gw * 0.3));
  const set = new Set(resaltar);
  const opacidad = (i: number) => (sel != null ? (sel === i ? 1 : 0.35) : set.size > 0 && !set.has(i + 1) ? 0.35 : 1);
  const pts: P[] = meses.slice(0, ultimo).map((m, i) => [M.l + gw * i + gw / 2, y(m.resultado)]);
  const m = sel != null ? meses[sel] : null;

  return (
    <div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setSel(null)}>
        {ultimo === 0 ? <Vacio anio={anio} t={t} /> : medido == null ? <div className="h-[280px]" /> : (
          <svg viewBox={`0 0 ${ancho} ${ALTO}`} role="img" aria-label={`${t("Ingresos y gastos por mes")} ${anio}`} className="block h-auto w-full select-none">
            <defs>
              <linearGradient id={`ing${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B083" /><stop offset="100%" stopColor="#0D6E4D" /></linearGradient>
              <linearGradient id={`gas${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CBD5E1" /><stop offset="100%" stopColor="#94A3B8" /></linearGradient>
              <linearGradient id={`res${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0F172A" stopOpacity="0.10" /><stop offset="100%" stopColor="#0F172A" stopOpacity="0" /></linearGradient>
              <pattern id={`rayas${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#D1FAE5" /><rect width="2.5" height="6" fill="#6EE7B7" /></pattern>
              <pattern id={`rayasg${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F1F5F9" /><rect width="2.5" height="6" fill="#CBD5E1" /></pattern>
            </defs>
            <Rejilla ancho={ancho} ticks={ticks} y={y} />
            {sel != null && <rect x={M.l + gw * sel + 2} y={M.t - 6} width={gw - 4} height={plotH + 12} rx={10} className="fill-slate-100/80" />}
            {meses.map((mm, i) => {
              const cx = M.l + gw * i + gw / 2;
              const retraso = { animationDelay: `${i * 40}ms` };
              return (
                <g key={mm.mes} style={{ opacity: opacidad(i) }} className="transition-opacity duration-200">
                  {mm.ingresosSinDesglose > 0 && (
                    <path d={barra(cx - bw - 2, bw, y(Math.max(0, mm.ingresos) + mm.ingresosSinDesglose), y(Math.max(0, mm.ingresos)))} fill={`url(#rayas${id})`} className="origin-bottom animate-crecer [transform-box:fill-box] motion-reduce:animate-none" style={retraso} />
                  )}
                  <path d={barra(cx - bw - 2, bw, y(mm.ingresos), y(0), mm.ingresosSinDesglose > 0 ? 0 : 4)} fill={`url(#ing${id})`} className={`${mm.ingresos < 0 ? "origin-top" : "origin-bottom"} animate-crecer [transform-box:fill-box] motion-reduce:animate-none`} style={retraso} />
                  {mm.gastosSinDesglose > 0 && (
                    <path d={barra(cx + 2, bw, y(Math.max(0, mm.gastos) + mm.gastosSinDesglose), y(Math.max(0, mm.gastos)))} fill={`url(#rayasg${id})`} className="origin-bottom animate-crecer [transform-box:fill-box] motion-reduce:animate-none" style={retraso} />
                  )}
                  <path d={barra(cx + 2, bw, y(mm.gastos), y(0), mm.gastosSinDesglose > 0 ? 0 : 4)} fill={`url(#gas${id})`} className="origin-bottom animate-crecer [transform-box:fill-box] motion-reduce:animate-none" style={retraso} />
                </g>
              );
            })}
            {pts.length > 1 && <path d={`${curva(pts)} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={`url(#res${id})`} className="pointer-events-none" />}
            {pts.length > 1 && <path d={curva(pts)} pathLength={1} strokeDasharray="1" fill="none" strokeWidth={2.25} strokeLinecap="round" className="pointer-events-none animate-trazo stroke-slate-800 motion-reduce:animate-none" />}
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={sel === i ? 5 : 3.5} strokeWidth={2} className={`pointer-events-none fill-white transition-[r] duration-200 ${meses[i].resultado < 0 ? "stroke-red-500" : "stroke-slate-800"}`} />
            ))}
            {meses.map((mm, i) => (
              <rect key={mm.mes} x={M.l + gw * i} y={M.t} width={gw} height={plotH} fill="transparent" className="cursor-pointer" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
                <title>{`${t(MESES_CORTOS_ES[i])} ${anio} · ${t("Ingresos")} ${eur(mm.ingresos)} · ${t("Gastos")} ${eur(mm.gastos)} · ${t("Resultado")} ${eur(mm.resultado)}`}</title>
              </rect>
            ))}
            <EjeMeses gw={gw} resaltar={set} sel={sel} t={t} />
          </svg>
        )}
        {m && (
          <Ficha x={M.l + gw * (sel ?? 0) + gw / 2} ancho={ancho} titulo={`${t(MESES_LARGOS[m.mes - 1])} ${anio}`} filas={[
            { color: "bg-aproba-600", label: t("Ingresos"), valor: eur(m.ingresos) },
            ...(m.ingresosSinDesglose > 0 ? [{ color: "bg-aproba-300", label: t("Importadas (IVA incl.)"), valor: eur(m.ingresosSinDesglose) }] : []),
            { color: "bg-slate-400", label: t("Gastos"), valor: eur(m.gastos) },
            { color: m.resultado < 0 ? "bg-red-500" : "bg-slate-800", label: t("Resultado"), valor: eur(m.resultado), fuerte: true, rojo: m.resultado < 0 },
            ...(m.ingresos > 0 ? [{ color: "bg-transparent", label: t("Margen"), valor: pct(m.resultado / m.ingresos) }] : []),
          ]} />
        )}
      </div>
      <div className="mt-3">
        <Leyenda items={[
          { color: "bg-aproba-600", label: t("Ingresos") },
          { color: "bg-slate-400", label: t("Gastos") },
          { color: "stroke-slate-800", label: t("Resultado"), forma: "linea" },
          ...(hayDesglose ? [{ color: "", label: t("Importadas sin desglose (IVA incl.)"), forma: "rayas" as const }] : []),
        ]} />
      </div>
    </div>
  );
}

// ── Acumulado del año: ingresos y gastos, y el beneficio que queda entre las dos curvas ──
export function GraficoAcumulado({ meses, anio }: { meses: Mes[]; anio: number }) {
  const t = useT();
  const id = useIds();
  const { ref, ancho: medido } = useAncho();
  const ancho = medido ?? 720;
  const [sel, setSel] = useState<number | null>(null);
  const ultimo = ultimoMesConDatos(meses);
  const acum = (f: (m: Mes) => number) => {
    let s = 0;
    return meses.slice(0, ultimo).map((m) => (s = Math.round((s + f(m)) * 100) / 100));
  };
  const ing = acum((m) => m.ingresos);
  const gas = acum((m) => m.gastos);
  const res = acum((m) => m.resultado);
  const hayDesglose = meses.some((m) => m.ingresosSinDesglose > 0);
  const ingTot = acum((m) => m.ingresos + m.ingresosSinDesglose);
  const valores = [...ing, ...gas, ...res, ...(hayDesglose ? ingTot : [])];
  const { desde, hasta, ticks } = escalaEje(Math.min(0, ...valores), Math.max(0, ...valores));
  const plotH = ALTO - M.t - M.b;
  const y = (v: number) => M.t + (plotH * (hasta - v)) / (hasta - desde);
  const gw = (ancho - M.l - M.r) / 12;
  const x = (i: number) => M.l + gw * i + gw / 2;
  const pIng: P[] = ing.map((v, i) => [x(i), y(v)]);
  const pGas: P[] = gas.map((v, i) => [x(i), y(v)]);
  const pTot: P[] = ingTot.map((v, i) => [x(i), y(v)]);
  const n = pIng.length;
  // Zona entre las dos curvas: el beneficio acumulado (verde si los ingresos van por encima).
  const banda = n > 1 ? `${curva(pIng)} L${pGas[n - 1][0]},${pGas[n - 1][1]}${curvaInversa(pGas)} Z` : "";
  const areaGas = n > 1 ? `${curva(pGas)} L${pGas[n - 1][0]},${y(0)} L${pGas[0][0]},${y(0)} Z` : "";
  const etiqueta = (v: number, py: number, color: string) => (
    <g className="animate-aparecer motion-reduce:animate-none" style={{ animationDelay: "1.1s" }}>
      <rect x={x(n - 1) + 8} y={py - 10} width={52} height={20} rx={10} className={color} />
      <text x={x(n - 1) + 34} y={py + 4} textAnchor="middle" className="fill-white text-[11px] font-semibold tabular-nums">{eurCorto(v)}</text>
    </g>
  );
  const cabeEtiqueta = n > 0 && x(n - 1) + 64 < ancho - 2;
  const separadas = n > 0 && Math.abs(pIng[n - 1][1] - pGas[n - 1][1]) > 22;

  return (
    <div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setSel(null)}>
        {ultimo === 0 ? <Vacio anio={anio} t={t} /> : medido == null ? <div className="h-[280px]" /> : (
          <svg viewBox={`0 0 ${ancho} ${ALTO}`} role="img" aria-label={`${t("Acumulado del año")} ${anio}`} className="block h-auto w-full select-none">
            <defs>
              <linearGradient id={`banda${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B083" stopOpacity="0.28" /><stop offset="100%" stopColor="#10B083" stopOpacity="0.06" /></linearGradient>
              <linearGradient id={`agas${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#94A3B8" stopOpacity="0.22" /><stop offset="100%" stopColor="#94A3B8" stopOpacity="0" /></linearGradient>
            </defs>
            <Rejilla ancho={ancho} ticks={ticks} y={y} />
            {sel != null && sel < n && <line x1={x(sel)} x2={x(sel)} y1={M.t - 4} y2={ALTO - M.b} strokeDasharray="3 4" className="stroke-slate-300" strokeWidth={1} />}
            {areaGas && <path d={areaGas} fill={`url(#agas${id})`} className="pointer-events-none" />}
            {banda && <path d={banda} fill={`url(#banda${id})`} className="pointer-events-none" />}
            {hayDesglose && n > 1 && <path d={curva(pTot)} fill="none" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" className="pointer-events-none stroke-aproba-300" />}
            {n > 1 && <path d={curva(pGas)} pathLength={1} strokeDasharray="1" fill="none" strokeWidth={2.5} strokeLinecap="round" className="pointer-events-none animate-trazo stroke-slate-400 motion-reduce:animate-none" />}
            {n > 1 && <path d={curva(pIng)} pathLength={1} strokeDasharray="1" fill="none" strokeWidth={3} strokeLinecap="round" className="pointer-events-none animate-trazo stroke-aproba-600 motion-reduce:animate-none" />}
            {n > 0 && <circle cx={pIng[n - 1][0]} cy={pIng[n - 1][1]} r={4.5} strokeWidth={2.5} className="pointer-events-none fill-white stroke-aproba-600" />}
            {n > 0 && <circle cx={pGas[n - 1][0]} cy={pGas[n - 1][1]} r={4.5} strokeWidth={2.5} className="pointer-events-none fill-white stroke-slate-400" />}
            {cabeEtiqueta && etiqueta(ing[n - 1], pIng[n - 1][1], "fill-aproba-600")}
            {cabeEtiqueta && separadas && etiqueta(gas[n - 1], pGas[n - 1][1], "fill-slate-400")}
            {sel != null && sel < n && [pIng[sel], pGas[sel]].map(([px, py], k) => (
              <circle key={k} cx={px} cy={py} r={5} strokeWidth={2.5} className={`pointer-events-none fill-white ${k === 0 ? "stroke-aproba-600" : "stroke-slate-400"}`} />
            ))}
            {meses.map((mm, i) => (
              <rect key={mm.mes} x={M.l + gw * i} y={M.t} width={gw} height={plotH} fill="transparent" className="cursor-pointer" onMouseEnter={() => setSel(i < n ? i : null)} onClick={() => setSel(i < n ? i : null)} />
            ))}
            <EjeMeses gw={gw} resaltar={new Set()} sel={sel} t={t} />
          </svg>
        )}
        {sel != null && sel < n && (
          <Ficha x={x(sel)} ancho={ancho} titulo={`${t("Hasta")} ${t(MESES_LARGOS[sel])} ${anio}`} filas={[
            { color: "bg-aproba-600", label: t("Ingresos acumulados"), valor: eur(ing[sel]) },
            { color: "bg-slate-400", label: t("Gastos acumulados"), valor: eur(gas[sel]) },
            { color: res[sel] < 0 ? "bg-red-500" : "bg-aproba-300", label: t("Beneficio acumulado"), valor: eur(res[sel]), fuerte: true, rojo: res[sel] < 0 },
            ...(ing[sel] > 0 ? [{ color: "bg-transparent", label: t("Margen"), valor: pct(res[sel] / ing[sel]) }] : []),
          ]} />
        )}
      </div>
      <div className="mt-3">
        <Leyenda items={[
          { color: "stroke-aproba-600", label: t("Ingresos acumulados"), forma: "linea" },
          { color: "stroke-slate-400", label: t("Gastos acumulados"), forma: "linea" },
          { color: "bg-aproba-200", label: t("Beneficio acumulado") },
          ...(hayDesglose ? [{ color: "stroke-aproba-300", label: t("Con las importadas sin desglose"), forma: "discontinua" as const }] : []),
        ]} />
      </div>
    </div>
  );
}

// ── Margen mes a mes (rentabilidad): barras de % y la media del periodo ────────────────
export function GraficoMargen({ margenes, anio, media, resaltar = [] }: { margenes: (number | null)[]; anio: number; media: number | null; resaltar?: number[] }) {
  const t = useT();
  const id = useIds();
  const { ref, ancho: medido } = useAncho();
  const ancho = medido ?? 720;
  const [sel, setSel] = useState<number | null>(null);
  const alto = 220;
  const mm = { ...M, t: 16, b: 30 };
  const vals = margenes.filter((v): v is number => v != null);
  if (!vals.length) {
    return <div ref={ref} className="flex h-[220px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">{t("Sin ingresos en")} {anio}</div>;
  }
  const { desde, hasta, ticks } = escalaEje(Math.min(0, ...vals), Math.max(0.25, ...vals), 4);
  const plotH = alto - mm.t - mm.b;
  const y = (v: number) => mm.t + (plotH * (hasta - v)) / (hasta - desde);
  const gw = (ancho - mm.l - mm.r) / 12;
  const bw = Math.max(6, Math.min(26, gw * 0.5));
  const set = new Set(resaltar);
  const v = sel != null ? margenes[sel] : null;
  if (medido == null) return <div ref={ref} className="h-[220px] w-full" />;
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setSel(null)}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${t("Margen mes a mes")} ${anio}`} className="block h-auto w-full select-none">
        <defs>
          <linearGradient id={`mpos${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34D399" /><stop offset="100%" stopColor="#0E8C5F" /></linearGradient>
          <linearGradient id={`mneg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EF4444" /><stop offset="100%" stopColor="#FCA5A5" /></linearGradient>
        </defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={mm.l} x2={ancho - mm.r} y1={y(tk)} y2={y(tk)} strokeWidth={1} className={tk === 0 ? "stroke-slate-300" : "stroke-slate-200/80"} strokeDasharray={tk === 0 ? undefined : "3 5"} />
            <text x={mm.l - 10} y={y(tk) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{pct(tk, 0)}</text>
          </g>
        ))}
        {sel != null && <rect x={mm.l + gw * sel + 2} y={mm.t - 6} width={gw - 4} height={plotH + 12} rx={10} className="fill-slate-100/80" />}
        {margenes.map((mv, i) => {
          const cx = mm.l + gw * i + gw / 2;
          const op = sel != null ? (sel === i ? 1 : 0.4) : set.size > 0 && !set.has(i + 1) ? 0.35 : 1;
          return mv == null
            ? <circle key={i} cx={cx} cy={y(0)} r={2} className="fill-slate-300" />
            : <path key={i} d={barra(cx - bw / 2, bw, y(mv), y(0), 5)} fill={`url(#${mv < 0 ? "mneg" : "mpos"}${id})`} style={{ opacity: op, animationDelay: `${i * 40}ms` }}
                className={`${mv < 0 ? "origin-top" : "origin-bottom"} animate-crecer transition-opacity duration-200 [transform-box:fill-box] motion-reduce:animate-none`} />;
        })}
        {media != null && (
          <g className="pointer-events-none">
            <line x1={mm.l} x2={ancho - mm.r} y1={y(media)} y2={y(media)} strokeWidth={1.5} strokeDasharray="6 5" className="stroke-slate-700" />
            <rect x={ancho - mm.r - 104} y={y(media) - 21} width={104} height={17} rx={8.5} className="fill-slate-800" />
            <text x={ancho - mm.r - 52} y={y(media) - 9} textAnchor="middle" className="fill-white text-[10.5px] font-semibold tabular-nums">{`${t("Media")} ${pct(media)}`}</text>
          </g>
        )}
        {margenes.map((_, i) => (
          <rect key={`h${i}`} x={mm.l + gw * i} y={mm.t} width={gw} height={plotH} fill="transparent" className="cursor-pointer" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
        ))}
        {MESES_CORTOS_ES.map((mes, i) => (i % (gw < 24 ? 2 : 1) === 0 || sel === i ? (
          <text key={mes} x={mm.l + gw * i + gw / 2} y={alto - 9} textAnchor="middle" className={`text-[11px] ${sel === i ? "fill-slate-900 font-semibold" : "fill-slate-500"}`}>{t(mes)}</text>
        ) : null))}
      </svg>
      {sel != null && (
        <Ficha x={mm.l + gw * sel + gw / 2} ancho={ancho} titulo={`${t(MESES_LARGOS[sel])} ${anio}`} filas={v == null
          ? [{ color: "bg-slate-300", label: t("Margen"), valor: t("sin ingresos") }]
          : [{ color: v < 0 ? "bg-red-500" : "bg-aproba-500", label: t("Margen"), valor: pct(v), fuerte: true, rojo: v < 0 }]} />
      )}
    </div>
  );
}
