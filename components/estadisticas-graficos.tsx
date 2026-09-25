"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";
import { eur } from "@/lib/facturas";
import { MESES_CORTOS_ES, escalaEje, eurCorto, ultimoMesConDatos, type Mes } from "@/lib/estadisticas-facturacion";

// Gráficos de Facturas › Estadísticas. SVG propio, sin librería: dos gráficos no justifican
// 100 kB de dependencia. Se dibujan al ancho REAL del contenedor (ResizeObserver): con un
// viewBox fijo, en el móvil los textos del eje quedaban a 5 px.

function useAncho(inicial = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

const ALTO = 260;
const M = { l: 50, r: 10, t: 14, b: 26 };

function Eje({ ancho, ticks, y }: { ancho: number; ticks: number[]; y: (v: number) => number }) {
  return (
    <g>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={ancho - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-slate-300" : "stroke-slate-100"} strokeWidth={1} />
          <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{eurCorto(v)}</text>
        </g>
      ))}
    </g>
  );
}

function Meses({ ancho, gw, resaltar, t }: { ancho: number; gw: number; resaltar: Set<number>; t: (s: string) => string }) {
  // Con poco sitio, un mes de cada dos (las barras siguen todas).
  const cada = gw < 24 ? 2 : 1;
  return (
    <g>
      {MESES_CORTOS_ES.map((m, i) => (i % cada === 0 ? (
        <text key={m} x={M.l + gw * i + gw / 2} y={ALTO - 8} textAnchor="middle"
          className={`text-[11px] ${resaltar.size === 0 || resaltar.has(i + 1) ? "fill-slate-500" : "fill-slate-300"}`}>{t(m)}</text>
      ) : null))}
      <line x1={M.l} x2={ancho - M.r} y1={ALTO - M.b} y2={ALTO - M.b} className="stroke-transparent" />
    </g>
  );
}

function Leyenda({ items }: { items: { clase: string; label: string; linea?: boolean; discontinua?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.linea
            ? <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" strokeWidth="2" strokeDasharray={it.discontinua ? "4 3" : undefined} className={it.clase} /></svg>
            : <span className={`inline-block h-2.5 w-2.5 rounded-sm ${it.clase}`} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Ingresos y gastos (base imponible) por mes, con la línea del resultado.
export function GraficoMensual({ meses, anio, resaltar = [] }: { meses: Mes[]; anio: number; resaltar?: number[] }) {
  const t = useT();
  const { ref, ancho } = useAncho();
  const [sel, setSel] = useState<number | null>(null);
  const hayDesglose = meses.some((m) => m.ingresosSinDesglose > 0 || m.gastosSinDesglose > 0);
  const ultimo = ultimoMesConDatos(meses);
  const valores = meses.flatMap((m) => [m.ingresos + m.ingresosSinDesglose, m.gastos + m.gastosSinDesglose, m.resultado, m.ingresos, m.gastos]);
  const { desde, hasta, ticks } = escalaEje(Math.min(0, ...valores), Math.max(0, ...valores));
  const plotH = ALTO - M.t - M.b;
  const y = (v: number) => M.t + (plotH * (hasta - v)) / (hasta - desde);
  const gw = (ancho - M.l - M.r) / 12;
  const bw = Math.max(3, Math.min(18, gw * 0.3));
  const set = new Set(resaltar);
  const tenue = (i: number) => set.size > 0 && !set.has(i + 1);
  const barra = (x: number, v: number) => ({ x, y: Math.min(y(v), y(0)), width: bw, height: Math.max(v === 0 ? 0 : 1, Math.abs(y(v) - y(0))) });
  const puntos = meses.slice(0, ultimo).map((m, i) => `${M.l + gw * i + gw / 2},${y(m.resultado)}`).join(" ");
  const m = sel != null ? meses[sel] : null;

  return (
    <div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setSel(null)}>
        {ultimo === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">{t("Sin facturas en")} {anio}</div>
        ) : (
          <svg viewBox={`0 0 ${ancho} ${ALTO}`} role="img" aria-label={`${t("Ingresos y gastos por mes")} ${anio}`} className="block h-auto w-full">
            <Eje ancho={ancho} ticks={ticks} y={y} />
            {meses.map((mm, i) => {
              const x0 = M.l + gw * i;
              const cx = x0 + gw / 2;
              return (
                <g key={mm.mes} opacity={tenue(i) ? 0.35 : 1}>
                  {sel === i && <rect x={x0 + 1} y={M.t} width={gw - 2} height={plotH} rx={4} className="fill-slate-100" />}
                  <rect {...barra(cx - bw - 1.5, mm.ingresos)} rx={2} className="fill-aproba-600" />
                  {mm.ingresosSinDesglose > 0 && (
                    <rect x={cx - bw - 1.5} width={bw} y={y(Math.max(0, mm.ingresos) + mm.ingresosSinDesglose)} height={Math.abs(y(mm.ingresosSinDesglose) - y(0))} rx={2} className="fill-aproba-200" />
                  )}
                  <rect {...barra(cx + 1.5, mm.gastos)} rx={2} className="fill-slate-400" />
                  {mm.gastosSinDesglose > 0 && (
                    <rect x={cx + 1.5} width={bw} y={y(Math.max(0, mm.gastos) + mm.gastosSinDesglose)} height={Math.abs(y(mm.gastosSinDesglose) - y(0))} rx={2} className="fill-slate-200" />
                  )}
                  {/* Zona sensible de todo el mes: ratón o dedo. */}
                  <rect x={x0} y={M.t} width={gw} height={plotH} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
                    <title>{`${t(MESES_CORTOS_ES[i])} ${anio} · ${t("Ingresos")} ${eur(mm.ingresos)} · ${t("Gastos")} ${eur(mm.gastos)} · ${t("Resultado")} ${eur(mm.resultado)}`}</title>
                  </rect>
                </g>
              );
            })}
            {ultimo > 0 && <polyline points={puntos} fill="none" strokeWidth={2} strokeLinejoin="round" className="pointer-events-none stroke-slate-800" />}
            {meses.slice(0, ultimo).map((mm, i) => (
              <circle key={mm.mes} cx={M.l + gw * i + gw / 2} cy={y(mm.resultado)} r={sel === i ? 4 : 2.75} className={`pointer-events-none ${mm.resultado < 0 ? "fill-red-500" : "fill-slate-800"} stroke-white`} strokeWidth={1.5} />
            ))}
            <Meses ancho={ancho} gw={gw} resaltar={set} t={t} />
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Leyenda items={[
          { clase: "bg-aproba-600", label: t("Ingresos") },
          { clase: "bg-slate-400", label: t("Gastos") },
          { clase: "stroke-slate-800", label: t("Resultado"), linea: true },
          ...(hayDesglose ? [{ clase: "bg-aproba-200", label: t("Importadas sin desglose (IVA incl.)") }] : []),
        ]} />
        <p className="min-h-[1rem] text-xs tabular-nums text-slate-600">
          {m ? <><span className="font-semibold capitalize">{t(MESES_CORTOS_ES[m.mes - 1])} {anio}</span> · {t("Ingresos")} {eur(m.ingresos)} · {t("Gastos")} {eur(m.gastos)} · <span className={m.resultado < 0 ? "font-semibold text-red-600" : "font-semibold text-slate-900"}>{t("Resultado")} {eur(m.resultado)}</span></>
            : <span className="text-slate-400">{t("Pasa por un mes para ver su detalle.")}</span>}
        </p>
      </div>
    </div>
  );
}

// Acumulado del año: cuánto se lleva facturado y gastado, mes a mes.
export function GraficoAcumulado({ meses, anio }: { meses: Mes[]; anio: number }) {
  const t = useT();
  const { ref, ancho } = useAncho();
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
  const linea = (vs: number[]) => vs.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = ing.length ? `${x(0)},${y(0)} ${linea(ing)} ${x(ing.length - 1)},${y(0)}` : "";

  return (
    <div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setSel(null)}>
        {ultimo === 0 ? (
          <div className="flex h-[260px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">{t("Sin facturas en")} {anio}</div>
        ) : (
          <svg viewBox={`0 0 ${ancho} ${ALTO}`} role="img" aria-label={`${t("Acumulado del año")} ${anio}`} className="block h-auto w-full">
            <Eje ancho={ancho} ticks={ticks} y={y} />
            {sel != null && <line x1={x(sel)} x2={x(sel)} y1={M.t} y2={ALTO - M.b} className="stroke-slate-200" strokeWidth={1} />}
            <polygon points={area} className="fill-aproba-100/60" />
            {hayDesglose && <polyline points={linea(ingTot)} fill="none" strokeWidth={2} strokeDasharray="5 4" className="stroke-aproba-300" />}
            <polyline points={linea(ing)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-aproba-600" />
            <polyline points={linea(gas)} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-slate-400" />
            <polyline points={linea(res)} fill="none" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" className="stroke-slate-800" />
            {sel != null && sel < ultimo && [ing[sel], gas[sel], res[sel]].map((v, k) => (
              <circle key={k} cx={x(sel)} cy={y(v)} r={3.5} className={`${k === 0 ? "fill-aproba-600" : k === 1 ? "fill-slate-400" : "fill-slate-800"} stroke-white`} strokeWidth={1.5} />
            ))}
            {meses.map((mm, i) => (
              <rect key={mm.mes} x={M.l + gw * i} y={M.t} width={gw} height={plotH} fill="transparent" onMouseEnter={() => setSel(i < ultimo ? i : null)} onClick={() => setSel(i < ultimo ? i : null)} />
            ))}
            <Meses ancho={ancho} gw={gw} resaltar={new Set()} t={t} />
          </svg>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Leyenda items={[
          { clase: "stroke-aproba-600", label: t("Ingresos acumulados"), linea: true },
          { clase: "stroke-slate-400", label: t("Gastos acumulados"), linea: true },
          { clase: "stroke-slate-800", label: t("Resultado acumulado"), linea: true, discontinua: true },
          ...(hayDesglose ? [{ clase: "stroke-aproba-300", label: t("Con las importadas sin desglose"), linea: true, discontinua: true }] : []),
        ]} />
        <p className="min-h-[1rem] text-xs tabular-nums text-slate-600">
          {sel != null && sel < ultimo
            ? <><span className="font-semibold">{t("Hasta")} {t(MESES_CORTOS_ES[sel])}</span> · {t("Ingresos")} {eur(ing[sel])} · {t("Gastos")} {eur(gas[sel])} · <span className={res[sel] < 0 ? "font-semibold text-red-600" : "font-semibold text-slate-900"}>{t("Resultado")} {eur(res[sel])}</span></>
            : <span className="text-slate-400">{t("Pasa por un mes para ver su detalle.")}</span>}
        </p>
      </div>
    </div>
  );
}
