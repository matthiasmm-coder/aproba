"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Expediente } from "@/lib/types";
import { useT } from "@/components/lang-provider";
import { Tasa790Modal } from "./tasa790-modal";

const IconDescarga = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
);

export function FormulariosView({ exp, oficiales = [], oficialesPorMiembro = {}, todos = [], applicants = [], p2Opciones = {}, p2Inicial = {} }: {
  exp: Expediente; oficiales?: string[]; oficialesPorMiembro?: Record<string, string[]>; todos?: { code: string; label: string }[];
  applicants?: { id: string; nombre: string }[]; // expediente familiar: un juego por solicitante
  p2Opciones?: Record<string, { value: string; label: string }[]>; // casilla p.2 forzable por modelo
  p2Inicial?: Record<string, string>; // casilla p.2 ya persistida en el expediente
}) {
  const t = useT();
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [errorMarcar, setErrorMarcar] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>(oficiales);
  // Familia: selección POR miembro (modelos de SUS servicios); el añadido manual elige miembro.
  const [selMiembro, setSelMiembro] = useState<Record<string, string[]>>(oficialesPorMiembro);
  const union = applicants.length ? [...new Set(Object.values(selMiembro).flat())] : seleccion;
  // Casilla de trámite de la p.2 elegida por modelo ("" = automático, según el trámite).
  // Se PERSISTE en el expediente para que el export ZIP y el portal del cliente rellenen
  // la misma casilla (fire-and-forget; sin migración degrada a solo-esta-descarga).
  const [p2Sel, setP2Sel] = useState<Record<string, string>>(p2Inicial);
  const elegirP2 = (tipo: string, valor: string) => {
    setP2Sel((s) => ({ ...s, [tipo]: valor }));
    setMarcado(false);
    void fetch(`/api/expedientes/${exp.id}/p2`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: tipo, valor }),
    }).catch(() => {});
  };

  const esFamilia = applicants.length > 0;
  const porAñadir = todos.filter((x) => !seleccion.includes(x.code));
  const urlOficial = (tipo: string, clienteId?: string) =>
    `/api/expedientes/${exp.id}/formularios?tipo=${encodeURIComponent(tipo)}&modo=oficial${clienteId ? `&clienteId=${clienteId}` : ""}${p2Sel[tipo] ? `&p2=${encodeURIComponent(p2Sel[tipo])}` : ""}`;
  const quitar = (tipo: string) => {
    setSeleccion((s) => s.filter((x) => x !== tipo));
    // Quitar el modelo también olvida su casilla p.2 (si no, reaparecería al re-añadirlo).
    if (p2Sel[tipo]) elegirP2(tipo, "");
    setMarcado(false);
  };
  const añadir = (tipo: string) => { setSeleccion((s) => [...new Set([...s, tipo])]); setMarcado(false); };

  async function marcarGenerados() {
    setMarcando(true);
    setErrorMarcar(false);
    try {
      const res = await fetch(`/api/expedientes/${exp.id}/formularios`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipos: union, ...(applicants.length ? { porMiembro: selMiembro } : {}) }),
      });
      if (res.ok) { setMarcado(true); router.refresh(); } else { setErrorMarcar(true); }
    } catch {
      setErrorMarcar(true);
    } finally {
      setMarcando(false);
    }
  }

  // Descargar un formulario YA ES generarlo: el estado avanza solo (fire-and-forget),
  // sin obligar al gestor a un segundo clic ritual «Marcar como generados».
  const alDescargar = () => { if (!marcado && !marcando) void marcarGenerados(); };

  const descarga = (tipo: string, clienteId?: string, label?: string) => (
    <a key={`${clienteId ?? ""}${tipo}`} href={urlOficial(tipo, clienteId)} onClick={alDescargar} className="inline-flex items-center gap-2 rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">
      {IconDescarga}{tipo}{label ? ` ${label}` : ""}
    </a>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/app/expedientes/${exp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          {t("Volver al expediente")}
        </Link>
      </div>

      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Formularios oficiales")}</h1>
        <p className="text-sm text-slate-500">{exp.clienteNombre} · {exp.tipoLabel}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">{t("Modelos del Ministerio, rellenados con los datos del expediente")}</p>
        <p className="mt-1 text-xs text-slate-500">
          {esFamilia
            ? t("Un juego de formularios por cada solicitante, rellenado con SUS datos. Revisa y firma antes de presentar.")
            : t("Rellenamos los datos de la persona extranjera. Revisa, marca el tipo de trámite y firma antes de presentar.")}
        </p>

        {/* Gestión del conjunto de formularios (chips con quitar). En familia se gestiona
            POR miembro más abajo — la fila global desaparece (pedido de Matthias). */}
        {!esFamilia && <div className="mt-4 flex flex-wrap items-center gap-2">
          {seleccion.map((tipo) => (
            <span key={tipo} className="inline-flex items-center overflow-hidden rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
              <span className="px-3 py-1.5">{tipo}</span>
              <button onClick={() => quitar(tipo)} title={t("Quitar")} aria-label={`${t("Quitar")} ${tipo}`} className="self-stretch border-l border-slate-200 px-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
          {seleccion.length === 0 && <span className="text-xs text-slate-400">{t("Añade los formularios de este trámite con el selector de abajo.")}</span>}
          {porAñadir.length > 0 && (
            <select value="" onChange={(e) => { if (e.target.value) añadir(e.target.value); }} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 outline-none focus:border-aproba-600">
              <option value="">{t("+ Añadir formulario…")}</option>
              {porAñadir.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.label}</option>)}
            </select>
          )}
        </div>}

        {/* Casilla de trámite de la p.2 (EX-17: inicial/renovación/duplicado; EX-15: NIE).
            «Automático» la deduce del trámite del expediente; el gestor puede forzarla. */}
        {union.some((tipo) => p2Opciones[tipo]?.length) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {union.filter((tipo) => p2Opciones[tipo]?.length).map((tipo) => (
              <label key={tipo} className="inline-flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">{tipo}</span> {t("· casilla de la pág. 2:")}
                <select
                  value={p2Sel[tipo] ?? ""}
                  onChange={(e) => elegirP2(tipo, e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-aproba-600"
                >
                  <option value="">{t("Automático (según el trámite)")}</option>
                  {p2Opciones[tipo].map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        {/* Descargas rellenadas */}
        {esFamilia ? (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            {applicants.map((a) => {
              const propios = selMiembro[a.id] ?? [];
              const paraAñadir = todos.filter((x) => !propios.includes(x.code));
              return (
              <div key={a.id}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{a.nombre}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {propios.map((tipo) => (
                    <span key={tipo} className="inline-flex items-center gap-1">
                      {descarga(tipo, a.id)}
                      <button onClick={() => setSelMiembro((m) => ({ ...m, [a.id]: (m[a.id] ?? []).filter((x) => x !== tipo) }))} aria-label={`${t("Quitar")} ${tipo}`} className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  {paraAñadir.length > 0 && (
                    <select value="" onChange={(e) => { const v = e.target.value; if (v) setSelMiembro((m) => ({ ...m, [a.id]: [...(m[a.id] ?? []), v] })); }} className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 outline-none focus:border-aproba-600">
                      <option value="">{t("+ Añadir formulario…")}</option>
                      {paraAñadir.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.label}</option>)}
                    </select>
                  )}
                  {/* La tasa es NOMINATIVA → una por solicitante, con sus datos. */}
                  <Tasa790Modal expedienteId={exp.id} clienteId={a.id} etiqueta={`${t("Tasa 790-012")} · ${a.nombre.split(" ")[0]}`} />
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <>
            {seleccion.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {seleccion.map((tipo) => descarga(tipo, undefined, t("rellenado")))}
              </div>
            )}
            <div className="mt-4">
              <Tasa790Modal expedienteId={exp.id} />
            </div>
          </>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          {marcado ? (
            // Salida hacia la SIGUIENTE etapa del flujo (revisión → Mercurio), no un
            // callejón sin salida: el gestor sabe siempre qué toca después.
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-aproba-50 px-3.5 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-aproba-700">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                {t("Formularios generados")}
              </span>
              <Link href={`/app/expedientes/${exp.id}#centinela`} className="text-sm font-semibold text-aproba-700 hover:underline">
                {t("Siguiente: revisar como Extranjería y presentar")} →
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              {errorMarcar && <p role="alert" className="text-xs text-red-600">{t("No se pudo guardar. Reintenta con el botón.")}</p>}
              <button onClick={marcarGenerados} disabled={marcando} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-60">
                {marcando ? t("Guardando…") : t("Marcar como generados")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
