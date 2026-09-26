"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/lang-provider";
import type { Alerta } from "@/lib/alertas";

// LA CAMPANA (26/09/2026, Matthias): a la izquierda de «+ Nuevo expediente». La pastilla
// cuenta lo que pide un gesto hoy (lib/alertas.ts), en el VERDE de la marca (Matthias: nada
// de rojo en el número); lo vencido o caducado se ve en rojo dentro del panel. Se consulta al entrar, al volver a la pestaña, cada 5 minutos y al abrirla:
// el layout no se vuelve a pintar al navegar, así que no puede traer las alertas él.
const CADA = 5 * 60_000;
const TOPE = 8; // por sección; el resto, en su vista

const CHIP: Record<Alerta["nivel"], string> = {
  critico: "bg-red-50 text-red-700",
  urgente: "bg-amber-100 text-amber-800",
  aviso: "bg-amber-50 text-amber-700",
};
const PUNTO: Record<Alerta["nivel"], string> = { critico: "bg-red-500", urgente: "bg-amber-500", aviso: "bg-amber-300" };

function CampanaIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
}

export function CampanaAlertas() {
  const t = useT();
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/alertas", { cache: "no-store" });
      if (r.ok) setAlertas(((await r.json()) as { alertas?: Alerta[] }).alertas ?? []);
    } catch { /* sin red: se queda lo último que se supo */ }
  }, []);

  useEffect(() => {
    void cargar();
    const iv = window.setInterval(() => void cargar(), CADA);
    const alVolver = () => { if (document.visibilityState === "visible") void cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  // Se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierta(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierta]);

  const lista = alertas ?? [];
  const n = lista.length;
  const reqs = lista.filter((a) => a.clase === "requerimiento");
  const rens = lista.filter((a) => a.clase !== "requerimiento");
  const plazo = (a: Alerta) => t(a.plazo.clave).replace("{n}", String(a.plazo.n));

  const seccion = (titulo: string, filas: Alerta[], verTodo: { href: string; label: string }) => filas.length > 0 && (
    <section className="border-t border-slate-100">
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo} <span className="text-slate-300">{filas.length}</span></p>
      <ul>
        {filas.slice(0, TOPE).map((a) => (
          <li key={a.id}>
            <Link href={a.href} onClick={() => setAbierta(false)} className="flex items-start gap-2.5 px-4 py-2 transition hover:bg-cream-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[a.nivel]}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{a.cliente}</span>
                <span className="block truncate text-xs text-slate-500" title={a.detalle}>{a.clase === "requerimiento" ? a.detalle : t(a.detalle)}</span>
              </span>
              <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${CHIP[a.nivel]}`}>{plazo(a)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={verTodo.href} onClick={() => setAbierta(false)} className="block px-4 pb-3 pt-1 text-xs font-semibold text-aproba-700 hover:underline">
        {filas.length > TOPE ? `${t("y {n} más").replace("{n}", String(filas.length - TOPE))} · ` : ""}{verTodo.label} →
      </Link>
    </section>
  );

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => { setAbierta((v) => !v); if (!abierta) void cargar(); }}
        aria-expanded={abierta} aria-haspopup="dialog"
        aria-label={n > 0 ? t("Alertas: {n}").replace("{n}", String(n)) : t("Alertas")} title={t("Alertas")}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-slate-100 ${abierta ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
      >
        <CampanaIcon className="h-5 w-5" />
        {n > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-cream-50 bg-aproba-600`}>
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>

      {abierta && (
        <div role="dialog" aria-label={t("Alertas")} className="fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]">
          <div className="px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{t("Alertas")}</p>
            <p className="text-xs text-slate-500">{t("Lo que vence o espera respuesta del cliente.")}</p>
          </div>
          {alertas === null ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t("Cargando…")}</p>
          ) : n === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-700">{t("Todo al día")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("Ningún plazo cerca ni respuesta pendiente.")}</p>
            </div>
          ) : (
            <>
              {seccion(t("Requerimientos"), reqs, { href: "/app/expedientes?filtro=requerimientos", label: t("Ver requerimientos") })}
              {seccion(t("Renovaciones"), rens, { href: "/app/vencimientos", label: t("Ver renovaciones") })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
