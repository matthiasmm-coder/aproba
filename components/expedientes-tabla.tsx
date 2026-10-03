"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";
import { csvTabla, ESTADO_TRAMITE, estadoVisible, MAX_COLABORADOR, RESOLUCIONES, resolucionDe, salidaDeResolucion, type EstadoVisible, type FilaTabla } from "@/lib/expedientes-tabla";
import { normalizarEstado } from "@/lib/progreso";
import { confirmar } from "@/components/confirm-dialog";
import { faltaParaConsultar } from "@/lib/numero-oficial";
import { NumeroOficial } from "@/components/numero-oficial";

// VISTA TABLA (23/09/2026 — petición de Jennifer; retirada el 24/09, RESTAURADA el 28/09).
// Réplica de su Excel: mismas columnas, mismo orden, bandas por año. Las columnas que
// Aproba aún no guarda van marcadas con un punto ámbar y salen vacías a propósito: el
// prototipo enseña lo que HAY hoy y lo que habría que añadir, sin inventar datos.
//
// «Consultar»: la web oficial (infoext2) pide NIE o nº de expediente, fecha de
// presentación y año de nacimiento, y exige un captcha. Aproba no puede ni debe
// consultarla sola: aquí prepara los tres datos y abre la consulta; el captcha lo
// valida el gestor.

export type { FilaTabla } from "@/lib/expedientes-tabla";

const INFOEXT = "https://infoext2.delegaciondelgobierno.gob.es/infoext2/consulta.html";


const fechaCorta = (iso: string) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

const COLOR_ESTADO: Partial<Record<EstadoVisible, string>> = {
  EN_PREPARACION: "bg-slate-100 text-slate-600",
  PREPARADO: "bg-aproba-50 text-aproba-700",
  PRESENTADO: "bg-sky-50 text-sky-700",
};

function Nueva({ t }: { t: (k: string) => string }) {
  return <span title={t("Columna nueva: Aproba todavía no guarda este dato")} className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-amber-400 align-middle" />;
}

function Vacia({ t }: { t: (k: string) => string }) {
  return <span title={t("Columna nueva: Aproba todavía no guarda este dato")} className="inline-block h-4 w-14 rounded border border-dashed border-amber-300 bg-amber-50/40" />;
}

// ── Celdas editables (03/10/2026 — Jennifer: «seleccionar el campo y escribir»; «todos los
// campos, en el fondo»). El gesto del nº oficial: clic → campo; Intro o salir guarda; Escape
// cancela. La fila abre la ficha: las celdas no dejan pasar el clic.
type T = (k: string) => string;
const parar = (e: React.SyntheticEvent) => e.stopPropagation();
const hoyMadrid = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

function Vaciable({ onClick, t, titulo }: { onClick: () => void; t: T; titulo: string }) {
  return (
    <button type="button" onClick={(e) => { parar(e); onClick(); }} title={titulo}
      className="group inline-flex h-5 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] font-semibold text-slate-300 transition hover:border-aproba-400 hover:text-aproba-700">
      <span className="opacity-0 group-hover:opacity-100">+ {t("Añadir")}</span>
    </button>
  );
}

// Guarda una sola vez aunque Intro y la pérdida de foco lleguen juntos (o abra un diálogo).
function useGuardado(t: T) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enCurso = useRef(false);
  async function correr(fn: () => Promise<boolean>): Promise<boolean> {
    if (enCurso.current) return false;
    enCurso.current = true; setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : t("No se pudo guardar.")); return false; }
    finally { enCurso.current = false; setBusy(false); }
  }
  return { busy, error, setError, correr };
}

function CeldaTexto({ valor, listId, onGuardar, t }: { valor: string; listId: string; onGuardar: (v: string) => Promise<boolean>; t: T }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);
  const g = useGuardado(t);
  const guardar = () => g.correr(async () => {
    const v = borrador.replace(/\s+/g, " ").trim();
    if (v === valor || (await onGuardar(v))) setEditando(false);
    return true;
  });
  if (editando) {
    return (
      <span onClick={parar} className="inline-flex items-center">
        <input autoFocus list={listId} value={borrador} maxLength={MAX_COLABORADOR} disabled={g.busy}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") { setBorrador(valor); setEditando(false); g.setError(null); } }}
          onBlur={() => void guardar()}
          aria-label={t("Colaborador")} placeholder={t("Entidad o subcontrata")}
          className="w-40 rounded border border-aproba-400 bg-white px-1.5 py-0.5 text-[16px] outline-none ring-2 ring-aproba-100 sm:text-xs" />
        {g.error && <span role="alert" className="ml-1 text-[11px] text-red-600">{g.error}</span>}
      </span>
    );
  }
  return valor
    ? <button type="button" onClick={(e) => { parar(e); setBorrador(valor); setEditando(true); }} title={t("Editar")} className="max-w-[10rem] truncate text-left text-xs text-slate-700 hover:underline hover:decoration-dotted">{valor}</button>
    : <Vaciable t={t} titulo={t("Añadir el colaborador")} onClick={() => { setBorrador(""); setEditando(true); }} />;
}

function CeldaFecha({ valor, etiqueta, mostrar, vacio, onGuardar, t }: {
  valor: string; etiqueta: string; mostrar?: (iso: string) => React.ReactNode; vacio?: React.ReactNode;
  onGuardar: (v: string | null) => Promise<boolean>; t: T;
}) {
  const [editando, setEditando] = useState(false);
  const g = useGuardado(t);
  const actual = valor.slice(0, 10);
  const guardar = (v: string) => g.correr(async () => {
    if (v === actual || (await onGuardar(v || null))) setEditando(false);
    return true;
  });
  if (editando) {
    return (
      <span onClick={parar} className="inline-flex items-center">
        <input type="date" autoFocus defaultValue={actual} max={hoyMadrid()} disabled={g.busy} aria-label={etiqueta}
          onKeyDown={(e) => { if (e.key === "Enter") void guardar(e.currentTarget.value); if (e.key === "Escape") { setEditando(false); g.setError(null); } }}
          onBlur={(e) => void guardar(e.currentTarget.value)}
          className="rounded border border-aproba-400 bg-white px-1 py-0.5 text-[16px] outline-none ring-2 ring-aproba-100 sm:text-xs" />
        {g.error && <span role="alert" className="ml-1 text-[11px] text-red-600">{g.error}</span>}
      </span>
    );
  }
  return actual
    ? <button type="button" onClick={(e) => { parar(e); setEditando(true); }} title={t("Editar")} className="text-xs hover:underline hover:decoration-dotted">{mostrar ? mostrar(actual) : fechaCorta(actual)}</button>
    : <span onClick={parar} className="inline-flex items-center gap-1">{vacio}<Vaciable t={t} titulo={etiqueta} onClick={() => setEditando(true)} /></span>;
}

function Consultar({ f, t }: { f: FilaTabla; t: (k: string) => string }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const anioNac = f.fechaNacimiento.slice(0, 4);
  const faltan = faltaParaConsultar(f).map((x) => t(x));
  const copiar = async (etiqueta: string, valor: string) => {
    if (await copiarTexto(valor)) { setCopiado(etiqueta); window.setTimeout(() => setCopiado(null), 1500); }
  };
  if (faltan.length) {
    return <span title={`${t("Falta para consultar:")} ${faltan.join(", ")}`} className="cursor-help text-[11px] text-slate-300">{t("Consultar")}</span>;
  }
  return (
    <span className="relative">
      <button type="button" onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-aproba-700 transition hover:border-aproba-300">
        {t("Consultar")}
      </button>
      {abierto && (
        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-20 w-64 whitespace-normal rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Estado en Extranjería")}</p>
          {([[t("Nº expediente"), f.numeroOficial], [t("NIE"), f.nie], [t("Fecha de presentación"), fechaCorta(f.fechaPresentacion)], [t("Año de nacimiento"), anioNac]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
            <button key={k} type="button" onClick={() => copiar(k, v)} className="mt-1.5 flex w-full items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
              <span className="text-slate-500">{k}</span>
              <span className="font-mono text-slate-900">{copiado === k ? `✓ ${t("copiado")}` : v}</span>
            </button>
          ))}
          <a href={INFOEXT} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-lg bg-aproba-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-aproba-700">
            {t("Abrir la consulta oficial")} ↗
          </a>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{t("La web oficial pide un captcha: lo validas tú. Aproba no puede consultarla por su cuenta.")}</p>
        </div>
      )}
    </span>
  );
}

export type MiembroTabla = { id: string; nombre: string };
export function ExpedientesTabla({ filas, conBuscador = true, onNumeroOficial, nombreExport = "expedientes", miembros = [], migracion = false, onCambio }: {
  filas: FilaTabla[]; conBuscador?: boolean; onNumeroOficial?: (id: string, numero: string) => void; nombreExport?: string;
  miembros?: MiembroTabla[];
  migracion?: boolean; // supabase/expediente-tabla.sql ejecutada: colaborador y tasa pagada se guardan
  onCambio?: (id: string, cambios: Partial<FilaTabla>) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  // Los colaboradores ya escritos, para no teclearlos dos veces (lista del navegador).
  const colaboradores = useMemo(() => [...new Set(filas.map((f) => f.colaborador).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [filas]);

  async function enviar(url: string, method: "PATCH" | "POST", body: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error ?? t("No se pudo guardar."));
    return j as Record<string, unknown>;
  }
  const guardarColaborador = async (f: FilaTabla, v: string) => {
    await enviar(`/api/expedientes/${f.id}/tabla`, "PATCH", { colaborador: v });
    onCambio?.(f.id, { colaborador: v });
    return true;
  };
  const guardarTasa = async (f: FilaTabla, v: string | null) => {
    await enviar(`/api/expedientes/${f.id}/tabla`, "PATCH", { tasaPagadaEl: v });
    onCambio?.(f.id, { tasaPagadaEl: v ?? "" });
    return true;
  };
  // Una fecha en un expediente aún en preparación = se presentó ese día: se confirma.
  const guardarPresentacion = async (f: FilaTabla, v: string | null) => {
    if (v && f.estado === "EN_PREPARACION" && !(await confirmar({
      titulo: t("¿Marcar como presentado?"),
      mensaje: t("El expediente pasará a «Presentado», con fecha {fecha}.").replace("{fecha}", fechaCorta(v)),
      confirmarLabel: t("Marcar como presentado"),
    }))) return false;
    const j = await enviar(`/api/expedientes/${f.id}/tabla`, "PATCH", { fechaPresentacion: v });
    onCambio?.(f.id, { fechaPresentacion: v ?? "", ...(v ? { anio: v.slice(0, 4) } : {}), ...(j.estado ? { estado: normalizarEstado(String(j.estado)) } : {}) });
    return true;
  };
  const guardarAsignado = async (f: FilaTabla, userId: string) => {
    await enviar(`/api/expedientes/${f.id}/asignado`, "PATCH", { userId: userId || null });
    onCambio?.(f.id, { asignadoAId: userId || null, tramitadoPor: miembros.find((m) => m.id === userId)?.nombre ?? "" });
  };
  const guardarResolucion = async (f: FilaTabla, salida: string) => {
    const j = await enviar(`/api/expedientes/${f.id}/salida`, "POST", { salida });
    onCambio?.(f.id, { salida, ...(j.estado ? { estado: normalizarEstado(String(j.estado)) } : {}) });
  };

  // Bandas por año, la más reciente arriba; dentro, lo último presentado primero.
  const grupos = useMemo(() => {
    const s = q.trim().toLowerCase();
    const vis = s ? filas.filter((f) => [f.nombre, f.nie, f.pasaporte, f.referencia, f.numeroOficial, f.tramitadoPor].some((x) => x.toLowerCase().includes(s))) : filas;
    const por = new Map<string, FilaTabla[]>();
    for (const f of vis) { const k = f.anio || "—"; por.set(k, [...(por.get(k) ?? []), f]); }
    return [...por.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([anio, lista]) => ({ anio, lista: lista.sort((x, y) => (y.fechaPresentacion || "").localeCompare(x.fechaPresentacion || "")) }));
  }, [filas, q]);

  const visibles = useMemo(() => grupos.flatMap((g) => g.lista), [grupos]);
  // Se exporta LO QUE SE VE, en el orden de la pantalla (bandas por año incluidas).
  function exportar() {
    const hoy = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([csvTabla(visibles)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `${nombreExport}-${hoy}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = "whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide";
  const td = "whitespace-nowrap px-2.5 py-2 text-xs text-slate-700";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {conBuscador ? (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar por nombre, NIE o referencia…")}
            className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600" />
        ) : <span />}
        <div className="flex items-center gap-3">
          {!migracion && <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Nueva t={t} /> {t("columnas que Aproba todavía no guarda")}</p>}
          <button type="button" onClick={exportar} disabled={visibles.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {t("Exportar a Excel")}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse">
          {/* Cabecera en el verde de Aproba (Matthias, 28/09), como los botones principales. */}
          <thead className="bg-aproba-600 text-white">
            <tr>
              <th className={th}>{t("Nombre completo")}</th>
              <th className={th}>{t("NIE")}</th>
              <th className={th} title={t("Nº de expediente de Extranjería")}>{t("Nº expediente")}</th>
              <th className={th}>{t("Año")}</th>
              <th className={th} title={t("Fecha de nacimiento")}>{t("F. nacimiento")}</th>
              <th className={th}>{t("Estado de trámite")}</th>
              <th className={th} title={t("Fecha de presentación")}>{t("F. presentación")}</th>
              <th className={th}>{t("Tramitado por")}</th>
              <th className={th}>{t("Colaborador")}{!migracion && <Nueva t={t} />}</th>
              <th className={th}>{t("Resolución")}</th>
              <th className={th}>{t("Tasa pagada")}{!migracion && <Nueva t={t} />}</th>
              <th className={th}><span className="sr-only">{t("Consultar")}</span></th>
            </tr>
          </thead>
          <tbody>
            {grupos.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">{t("Ningún expediente coincide.")}</td></tr>
            )}
            {grupos.map((g) => (
              <FilasAnio key={g.anio} anio={g.anio} lista={g.lista} t={t} td={td} onAbrir={(id) => router.push(`/app/expedientes/${id}`)} onNumeroOficial={onNumeroOficial}
                editar={{ miembros, migracion, guardarColaborador, guardarTasa, guardarPresentacion, guardarAsignado, guardarResolucion }} />
            ))}
          </tbody>
        </table>
        <datalist id="colaboradores-tabla">{colaboradores.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
    </div>
  );
}

type Edicion = {
  miembros: MiembroTabla[]; migracion: boolean;
  guardarColaborador: (f: FilaTabla, v: string) => Promise<boolean>;
  guardarTasa: (f: FilaTabla, v: string | null) => Promise<boolean>;
  guardarPresentacion: (f: FilaTabla, v: string | null) => Promise<boolean>;
  guardarAsignado: (f: FilaTabla, userId: string) => Promise<void>;
  guardarResolucion: (f: FilaTabla, salida: string) => Promise<void>;
};

// «Tramitado por» y «Resolución»: una lista desplegable dentro de la celda.
function CeldaLista({ valor, opciones, etiqueta, onCambiar, clase = "", t }: {
  valor: string; opciones: { valor: string; texto: string; deshabilitada?: boolean }[]; etiqueta: string;
  onCambiar: (v: string) => Promise<void>; clase?: string; t: T;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span onClick={parar} className="inline-flex items-center">
      <select value={valor} disabled={busy} aria-label={etiqueta} title={error ?? etiqueta}
        onChange={async (e) => {
          const v = e.target.value; setBusy(true); setError(null);
          try { await onCambiar(v); } catch (err) { setError(err instanceof Error ? err.message : t("No se pudo guardar.")); } finally { setBusy(false); }
        }}
        className={`max-w-[10rem] cursor-pointer truncate rounded border border-transparent bg-transparent py-0.5 pl-0.5 pr-5 text-[16px] outline-none transition hover:border-slate-300 focus:border-aproba-500 disabled:opacity-50 sm:text-xs ${error ? "border-red-300 text-red-600" : clase}`}>
        {opciones.map((o) => <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>{o.texto}</option>)}
      </select>
    </span>
  );
}

function FilasAnio({ anio, lista, t, td, onAbrir, onNumeroOficial, editar }: { anio: string; lista: FilaTabla[]; t: (k: string) => string; td: string; onAbrir: (id: string) => void; onNumeroOficial?: (id: string, numero: string) => void; editar: Edicion }) {
  return (
    <>
      <tr className="bg-slate-100">
        <td colSpan={12} className="px-2.5 py-1.5 text-center text-[11px] font-bold tracking-wide text-slate-600">
          {anio} <span className="font-normal text-slate-400">· {lista.length}</span>
        </td>
      </tr>
      {lista.map((f) => (
        <tr key={f.id} onClick={() => onAbrir(f.id)} className={`cursor-pointer border-t border-slate-100 transition hover:bg-aproba-50/40 ${f.archivado ? "text-slate-400" : ""}`}>
          <td className={`${td} font-medium text-slate-900`}>
            {f.nombre || "—"}
            <span className="block font-mono text-[10px] font-normal text-slate-400">{f.referencia}</span>
          </td>
          <td className={`${td} font-mono`}>{f.nie || <span className="text-slate-300">—</span>}</td>
          <td className={td}><NumeroOficial key={f.id} expedienteId={f.id} inicial={f.numeroOficial} variante="celda" onGuardado={(n) => onNumeroOficial?.(f.id, n)} /></td>
          <td className={td}>{f.anio}</td>
          <td className={td}>{fechaCorta(f.fechaNacimiento) || <span className="text-slate-300">—</span>}</td>
          <td className={td}>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[estadoVisible(f)] ?? "bg-slate-100 text-slate-500"}`}>
              {t(ESTADO_TRAMITE[estadoVisible(f)])}
            </span>
          </td>
          <td className={td}>
            <CeldaFecha key={`fp-${f.id}-${f.fechaPresentacion}`} valor={f.fechaPresentacion} etiqueta={t("Fecha de presentación")} t={t}
              onGuardar={(v) => editar.guardarPresentacion(f, v)} />
          </td>
          <td className={td}>
            {editar.miembros.length
              ? <CeldaLista t={t} etiqueta={t("Tramitado por")} valor={f.asignadoAId ?? ""}
                  opciones={[{ valor: "", texto: t("Sin asignar") },
                    ...(f.asignadoAId && !editar.miembros.some((m) => m.id === f.asignadoAId) ? [{ valor: f.asignadoAId, texto: f.tramitadoPor || "—" }] : []),
                    ...editar.miembros.map((m) => ({ valor: m.id, texto: m.nombre }))]}
                  clase={f.asignadoAId ? "text-slate-700" : "text-slate-400"}
                  onCambiar={(v) => editar.guardarAsignado(f, v)} />
              : (f.tramitadoPor || <span className="text-slate-300">—</span>)}
          </td>
          <td className={td}>
            {editar.migracion
              ? <CeldaTexto key={`co-${f.id}-${f.colaborador}`} valor={f.colaborador} listId="colaboradores-tabla" t={t} onGuardar={(v) => editar.guardarColaborador(f, v)} />
              : <Vacia t={t} />}
          </td>
          <td className={td}>
            <CeldaLista t={t} etiqueta={t("Resolución")} valor={salidaDeResolucion(f)}
              opciones={[{ valor: "", texto: "—", deshabilitada: true }, ...RESOLUCIONES.map((r) => ({ valor: r.salida, texto: t(r.label) }))]}
              clase={resolucionDe(f) === "No favorable" ? "font-semibold text-red-600" : resolucionDe(f) ? "font-semibold text-aproba-700" : "text-slate-300"}
              onCambiar={(v) => editar.guardarResolucion(f, v)} />
          </td>
          <td className={td}>
            {editar.migracion
              ? <CeldaFecha key={`tp-${f.id}-${f.tasaPagadaEl}`} valor={f.tasaPagadaEl} etiqueta={t("Fecha de pago de la tasa")} t={t}
                  mostrar={(iso) => <span className="font-semibold text-aproba-700">✓ {fechaCorta(iso)}</span>}
                  vacio={f.tasaGenerada ? <span title={t("Aproba sabe que la tasa está generada, no si está pagada")} className="text-slate-500">{t("generada")} ·</span> : null}
                  onGuardar={(v) => editar.guardarTasa(f, v)} />
              : f.tasaGenerada
                ? <span title={t("Aproba sabe que la tasa está generada, no si está pagada")} className="text-slate-500">{t("generada")} · <Vacia t={t} /></span>
                : <Vacia t={t} />}
          </td>
          <td className={`${td} text-right`}><Consultar f={f} t={t} /></td>
        </tr>
      ))}
    </>
  );
}
