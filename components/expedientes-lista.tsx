"use client";

import { etiquetaTrabajadores } from "@/lib/trabajadores";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CerrarExpedienteDialog } from "@/components/cerrar-expediente-dialog";
import { AvatarGestor, AvataresProvider, useAvatar, type Avatares } from "@/components/avatar-gestor";
import { useT } from "@/components/lang-provider";
import { ArchiveIcon, VistasExpedientes } from "@/components/vistas-expedientes";
import { SALIDAS, etiquetaSalida, salidaDeEstado, type Salida } from "@/lib/types";
import { loadArchivados, setArchivadoServidor } from "@/lib/archivo";
import { construirArbol, grupoDe as grupoArbol, raizDe, temaDe, SIN_TEMA, type PackLite } from "@/lib/expedientes-arbol";
import { anioPorDefecto, aniosDelResumen, construirArbolHistorial, filtrarResumen, salidasDelResumen, totalResumen, type CarpetaServicio, type CatalogoLite } from "@/lib/historial-arbol";
import type { FilaHistorial, ResumenHistorial } from "@/lib/data/historial";
import type { ExpedienteEstado } from "@/lib/types";
import { esperaAlCliente as esperandoCliente } from "@/lib/progreso";
import type { BoardItem } from "@/components/board-client";

// EXPEDIENTES — 18/09/2026 (Matthias, tras la reunión con Luis y Marta Asenjo).
//
// Las dos vistas se recorren como SUS carpetas: tema → servicio o pack → expediente.
// Hoy trabajan así en su disco («Nacionalidad», «Servicios penales»…), y el tablero de
// dos columnas ya no era un tablero: la fase la calcula el servidor, nadie arrastra nada
// (Juan: 0 de 81 en «presentado»).
//
//   · EN CURSO   → el árbol abierto, con lo que toca hacer en cada expediente.
//   · HISTORIAL  → el mismo árbol, plegado, para buscar lo ya cerrado.
//   · FUTURO     → no vive aquí: es Vigía (vencimientos y renovaciones).
//
// En la fila NO va el porcentaje (no dice qué falta) sino las CASILLAS de la ficha:
// Datos · Documentos · Formularios · Cobro, verdes cuando esa sección está lista.

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export type { PackLite };
// `tema`, `servicioLabel` y `claves` los resuelve el servidor desde el catálogo del
// despacho (el campo «categoría» de Ajustes, el mismo que agrupa el portal del cliente).
export type ItemLista = BoardItem & { tema?: string | null; servicioLabel?: string | null; claves?: string[]; anio?: string | null };

const MEMORIA_ARBOL = "aproba.expedientes.arbol.v1";
// Una carpeta abierta pinta 25 expedientes; el resto, a petición. Con 15 años de
// historial una carpeta puede tener cientos y la página se volvería pesada de golpe.
const TRANCHE = 25;

const categoriaDe = (e: ItemLista): Salida | null => (SALIDAS.find((s) => s.key === e.salida)?.key ?? salidaDeEstado(e.estado) ?? null);
const chipDe = (c: Salida | null) =>
  c === "concedido" ? "bg-aproba-100 text-aproba-700"
  : c === "denegado" ? "bg-red-50 text-red-600"
  : c === "desistido" ? "bg-slate-100 text-slate-500"
  : "bg-amber-50 text-amber-700";

// Fecha límite: reloj dibujado (antes, el emoji ⏱ — cada sistema lo pinta a su manera).
function PlazoIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
}
function ChevronIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>;
}

// Casilla de una sección de la ficha: verde con ✓ cuando está lista, hueca cuando no.
// La etiqueta se lee SIEMPRE (19/09): en el móvil se veían cuatro círculos sin saber de
// qué hablaban. Debajo del círculo y abreviada cuando no cabe; al lado desde lg.
function Casilla({ ok, label, corto }: { ok: boolean; label: string; corto?: string }) {
  return (
    <span
      title={`${label}: ${ok ? "✓" : "—"}`}
      className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[11px] font-medium lg:flex-row lg:gap-1 lg:rounded-full ${ok ? "bg-aproba-50 text-aproba-700" : "bg-slate-50 text-slate-400"}`}
    >
      {ok ? (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <span className="h-2.5 w-2.5 rounded-full border border-current" />
      )}
      <span className="text-[10px] leading-none lg:hidden">{corto ?? label}</span>
      <span className="hidden lg:inline">{label}</span>
    </span>
  );
}

function Fila({ e, cerrado, sangria = "pl-9", onArchive, onRestaurar, onReclasificar }: {
  e: ItemLista;
  cerrado: boolean;
  sangria?: string;
  onArchive?: (e: ItemLista) => void;
  onRestaurar?: (id: string) => void;
  onReclasificar?: (e: ItemLista, s: Salida) => void;
}) {
  const t = useT();
  const foto = useAvatar(e.asignadoA);
  const comp = e.progreso?.completitud;
  const docs = e.progreso?.docs;
  const cat = cerrado ? categoriaDe(e) : null;
  return (
    <div className={`group flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-50 py-2.5 pr-3 transition hover:bg-cream-50 ${sangria}`}>
      <Link href={`/app/expedientes/${e.id}`} data-guia={e.referencia === "EJEMPLO" ? "tarjeta-ejemplo" : undefined} className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={e.clienteNombre}>{e.clienteNombre}</span>
          {e.fechaLimite && !cerrado && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"><PlazoIcon className="h-3 w-3" />{e.fechaLimite}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
          {e.empresaNombre && e.empresaNombre !== e.clienteNombre && <span className="truncate font-medium text-slate-500" title={e.empresaNombre}>{e.empresaNombre} ·</span>}
          {e.empresaNombre && e.empresaNombre === e.clienteNombre && typeof e.nTrabajadores === "number" && <span className="font-medium text-slate-500">{etiquetaTrabajadores(e.nTrabajadores, t)} ·</span>}
          <span className="font-mono">{e.referencia}</span>
          {cerrado && e.presentadoEl && <span>· {t("presentado el")} {e.presentadoEl}</span>}
          {!cerrado && docs && docs.requeridos > 0 && <span>· {docs.recibidos}/{docs.requeridos} {t("docs")}</span>}
        </span>
      </Link>

      {/* En móvil las casillas bajan a su propia línea (order-last + basis-full): arriba
          quedan el nombre, la foto del responsable y archivar. Desde sm, todo en una. */}
      {!cerrado && comp && (
        <span className="order-last flex basis-full items-center gap-1.5 sm:order-none sm:basis-auto sm:gap-1">
          <Casilla ok={comp.info >= 1} label={t("Datos")} />
          <Casilla ok={Boolean(docs?.completo)} label={t("Docs")} />
          <Casilla ok={comp.formularios >= 1} label={t("Formularios")} corto={t("Form.")} />
          <Casilla ok={Boolean(e.cobro?.facturado)} label={t("Cobro")} />
        </span>
      )}

      {cerrado && cat && <span className={`order-last shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:order-none ${chipDe(cat)}`}>{t(etiquetaSalida(cat) ?? "")}</span>}
      {cerrado && onReclasificar && (
        <select
          aria-label={t("Cambiar categoría")} value={cat ?? ""}
          onChange={(ev) => { const v = ev.target.value as Salida | ""; if (v) onReclasificar(e, v); }}
          className="order-last shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-aproba-600 sm:order-none"
        >
          <option value="" disabled>{cat ? t("Cambiar…") : t("Clasificar…")}</option>
          {SALIDAS.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
        </select>
      )}

      <AvatarGestor nombre={e.asignadoA} foto={foto} size={24} />
      {!cerrado && onArchive && (
        <button onClick={() => onArchive(e)} aria-label={t("Archivar")} title={t("Archivar")} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 lg:text-slate-300 lg:opacity-0 lg:group-hover:opacity-100">
          <ArchiveIcon className="h-4 w-4" />
        </button>
      )}
      {cerrado && onRestaurar && (
        <button onClick={() => onRestaurar(e.id)} className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-aproba-300 hover:text-aproba-700">{t("Restaurar")}</button>
      )}
    </div>
  );
}

// Filas por tranches: las primeras TRANCHE y un botón para traer las siguientes.
function ListaFilas({ lista, cerrado, sangria, onArchive, onRestaurar, onReclasificar }: {
  lista: ItemLista[]; cerrado: boolean; sangria: string;
  onArchive?: (e: ItemLista) => void; onRestaurar?: (id: string) => void; onReclasificar?: (e: ItemLista, s: Salida) => void;
}) {
  const t = useT();
  const [tope, setTope] = useState(TRANCHE);
  const restantes = lista.length - tope;
  return (
    <>
      {lista.slice(0, tope).map((e) => (
        <Fila key={e.id} e={e} cerrado={cerrado} sangria={sangria} onArchive={onArchive} onRestaurar={onRestaurar} onReclasificar={onReclasificar} />
      ))}
      {restantes > 0 && (
        <button
          type="button" onClick={() => setTope((v) => v + TRANCHE)}
          className={`w-full border-t border-slate-50 py-2.5 pr-3 text-left text-xs font-semibold text-aproba-700 transition hover:bg-cream-50 ${sangria}`}
        >
          {t("Ver los {n} restantes").replace("{n}", String(restantes))}
        </button>
      )}
    </>
  );
}

function Nivel({ titulo, n, enCurso, abierto, onToggle, raiz = false, anio = false, vacia = false, children }: { titulo: string; n?: number; enCurso?: number; abierto: boolean; onToggle: () => void; raiz?: boolean; anio?: boolean; vacia?: boolean; children: React.ReactNode }) {
  return (
    <div className={raiz ? `border-l-2 border-t border-slate-100 first:border-t-0 ${abierto ? "border-l-aproba-500 bg-aproba-50/20" : "border-l-transparent"}` : ""}>
      <button
        type="button" onClick={onToggle} aria-expanded={abierto}
        className={`flex w-full items-center gap-2 text-left transition hover:bg-cream-50/60 ${raiz ? "px-4 py-2.5" : anio ? "border-t border-slate-50 py-1.5 pl-14 pr-4" : "border-t border-slate-50 py-2 pl-9 pr-4"}`}
      >
        <ChevronIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${vacia ? "text-transparent" : "text-slate-300"} ${abierto ? "rotate-90" : ""}`} />
        <span className={`min-w-0 flex-1 truncate ${raiz ? `text-sm font-semibold ${vacia ? "text-slate-400" : "text-slate-800"}` : anio ? "text-[12px] font-medium tabular-nums text-slate-400" : "text-[13px] text-slate-500"}`}>{titulo}</span>
        {vacia && <span className="shrink-0 text-[11px] text-slate-300">{"—"}</span>}
        {/* Círculo verde = expedientes EN CURSO de ese tema. Nada si no hay ninguno
            (un tema solo con historial no debe pedir atención). */}
        {typeof n === "number" && <span className={`shrink-0 text-xs tabular-nums ${raiz ? "font-semibold text-slate-400" : "text-slate-300"}`}>{n}</span>}
        {typeof enCurso === "number" && enCurso > 0 && (
          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-aproba-600 px-1.5 text-[11px] font-semibold tabular-nums text-white">{enCurso}</span>
        )}
      </button>
      {abierto && children}
    </div>
  );
}

function FilasArchivo({ carpeta, sufijo, query, srv, aItem, onRestaurar, onReclasificar }: {
  carpeta: CarpetaServicio;
  sufijo: string;
  query: Record<string, string>;
  srv: ReturnType<typeof useArchivoServidor>;
  aItem: (f: FilaHistorial) => ItemLista;
  onRestaurar: (id: string) => void;
  onReclasificar: (e: ItemLista, s: Salida) => void;
}) {
  const t = useT();
  const clave = carpeta.clave + sufijo;
  const filas = srv.filas.get(clave);
  if (!filas) {
    return (
      <p className="border-t border-slate-50 py-2.5 pl-14 pr-4 text-xs text-slate-400">
        {srv.cargando.has(clave) ? t("Cargando…") : t("Abriendo…")}
      </p>
    );
  }
  // El recuento de la carpeta lo da el servidor: si quedan filas por traer, se dice.
  const faltan = Math.max(0, carpeta.n - filas.length);
  return (
    <>
      <ListaFilas lista={filas} cerrado sangria="pl-[4.5rem]" onRestaurar={onRestaurar} onReclasificar={onReclasificar} />
      {faltan > 0 && (
        <button
          type="button" disabled={srv.cargando.has(clave)}
          onClick={() => srv.pedirMas(clave, { ...query, offset: String(filas.length) }, aItem)}
          className="w-full border-t border-slate-50 py-2.5 pl-14 pr-3 text-left text-xs font-semibold text-aproba-700 transition hover:bg-cream-50 disabled:opacity-50"
        >
          {srv.cargando.has(clave) ? t("Cargando…") : t("Ver los {n} restantes").replace("{n}", String(faltan))}
        </button>
      )}
    </>
  );
}

// ── El archivo, leído carpeta a carpeta ──────────────────────────────────────
// Guarda las filas ya traídas (clave de carpeta → filas) y no vuelve a pedirlas. El
// gestor abre «Nacionalidad · 2019» y solo entonces viajan esas filas.
function useArchivoServidor() {
  const [filas, setFilas] = useState<Map<string, ItemLista[]>>(new Map());
  const [cargando, setCargando] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pedidas = useRef(new Set<string>());

  // `anadir` = segunda página y siguientes de la MISMA carpeta (un año con 300 cerrados
  // llega de 200 en 200; nunca se corta en silencio, el gestor ve cuántos faltan).
  const traer = useCallback(async (clave: string, q: Record<string, string>, aItem: (f: FilaHistorial) => ItemLista, anadir = false) => {
    if (!anadir && pedidas.current.has(clave)) return;
    pedidas.current.add(clave);
    setCargando((s) => new Set(s).add(clave));
    try {
      const res = await fetch(`/api/expedientes/historial?${new URLSearchParams(q)}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { filas: FilaHistorial[] };
      const nuevas = (j.filas ?? []).map(aItem);
      setFilas((m) => new Map(m).set(clave, anadir ? [...(m.get(clave) ?? []), ...nuevas] : nuevas));
      setError(null);
    } catch {
      if (!anadir) pedidas.current.delete(clave); // reintentable: cerrar y volver a abrir
      setError("No se pudo cargar esta carpeta del historial.");
    } finally {
      setCargando((s) => { const n = new Set(s); n.delete(clave); return n; });
    }
  }, []);
  const pedir = useCallback((clave: string, q: Record<string, string>, aItem: (f: FilaHistorial) => ItemLista) => traer(clave, q, aItem), [traer]);
  const pedirMas = useCallback((clave: string, q: Record<string, string>, aItem: (f: FilaHistorial) => ItemLista) => traer(clave, q, aItem, true), [traer]);

  // Una fila restaurada deja de pertenecer al archivo: se quita de su carpeta al vuelo.
  const quitar = useCallback((id: string) => {
    setFilas((m) => {
      const n = new Map<string, ItemLista[]>();
      for (const [k, v] of m) n.set(k, v.filter((x) => x.id !== id));
      return n;
    });
  }, []);

  return { filas, cargando, error, pedir, pedirMas, quitar };
}

export function ExpedientesLista({ items, asignados, temas, packs = [], filtroInicial = null, vistaInicial = "curso", renovaciones = 0, archivo = null, avatares = {}, carpetasVacias = [] }: {
  items: ItemLista[];
  asignados: string[];
  temas: string[];
  packs?: PackLite[];
  // ARCHIVO EN EL SERVIDOR: recuentos por servicio × año (las carpetas) y el catálogo
  // que las nombra. null = migración pendiente → el archivo viaja en `items`, como antes.
  archivo?: { resumen: ResumenHistorial[]; catalogo: CatalogoLite[]; etiquetasTipo?: Record<string, string> } | null;
  // `?filtro=esperando` viene de Inicio («N esperando cliente →»). Sin esto, el enlace
  // llevaba a la lista COMPLETA: el gestor pulsaba un recuento y no veía ese recuento.
  filtroInicial?: "esperando" | null;
  // `?vista=historial`: la pestaña «Historial» de la pantalla de renovaciones vuelve aquí
  // abriendo directamente el archivo. Y el recuento de la pestaña «Renovaciones» (el
  // mismo número que el KPI «Caducan pronto» del Inicio).
  vistaInicial?: "curso" | "historial";
  renovaciones?: number;
  // Fotos del equipo por nombre: la fila pinta la foto del responsable, no sus iniciales.
  avatares?: Avatares;
  // Carpetas de Ajustes que hoy no llevan ningún expediente: se pintan igual, vacías.
  carpetasVacias?: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [asignado, setAsignado] = useState("");
  const [tema, setTema] = useState("");
  const [view, setView] = useState<"curso" | "historial">(vistaInicial);
  // La URL acompaña a la vista (?vista=historial) sin recargar: así un F5 — o el enlace
  // «Historial» desde Renovaciones — vuelve a abrir lo que se estaba mirando.
  const cambiarVista = (v: "curso" | "historial") => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "historial") url.searchParams.set("vista", "historial"); else url.searchParams.delete("vista");
    window.history.replaceState(window.history.state, "", url.pathname + (url.search || ""));
  };
  const [soloEsperando, setSoloEsperando] = useState(filtroInicial === "esperando");
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  // El plegado se RECUERDA entre visitas (localStorage, por navegador): al volver, el
  // gestor encuentra sus carpetas como las dejó — como en su disco. Dos conjuntos porque
  // el defecto cambia según la vista: lo cerrado a mano y lo abierto a mano.
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [memoriaLista, setMemoriaLista] = useState(false);
  const [dialogo, setDialogo] = useState<ItemLista | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [catFiltro, setCatFiltro] = useState<string>("");

  useEffect(() => {
    // Con el archivo en el SERVIDOR, `items` ya viene sin archivados y el servidor es la
    // única verdad: leer también la caché local escondería de «En curso» un expediente
    // restaurado desde otro puesto (el fallo «mi expediente ha desaparecido»).
    const s = archivo ? new Set<string>() : loadArchivados();
    for (const e of items) if (e.archivado) s.add(e.id);
    setArchivados(s);
  }, [items, archivo]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MEMORIA_ARBOL);
      if (raw) {
        const j = JSON.parse(raw) as { cerrados?: string[]; abiertos?: string[] };
        if (Array.isArray(j.cerrados)) setCerrados(new Set(j.cerrados));
        if (Array.isArray(j.abiertos)) setAbiertos(new Set(j.abiertos));
      }
    } catch { /* sin memoria: se abre con los valores por defecto */ }
    setMemoriaLista(true);
  }, []);

  useEffect(() => {
    if (!memoriaLista) return; // no pisar lo guardado antes de haberlo leído
    try {
      window.localStorage.setItem(MEMORIA_ARBOL, JSON.stringify({ cerrados: [...cerrados], abiertos: [...abiertos] }));
    } catch { /* cuota llena o modo privado: el plegado simplemente no se recuerda */ }
  }, [cerrados, abiertos, memoriaLista]);

  const activos = useMemo(() => items.filter((e) => !archivados.has(e.id)), [items, archivados]);
  const historial = useMemo(() => items.filter((e) => archivados.has(e.id)), [items, archivados]);

  // Apertura por defecto ADAPTATIVA. Un despacho pequeño quiere verlo todo de una vez;
  // uno con 40 servicios en 15 temas no: abrirlo entero son 8 pantallas de scroll. Por
  // encima del umbral, los temas nacen plegados y se abre el que se va a trabajar.
  // En el historial, siempre plegado: ahí se busca, no se lee entero.
  const TOPE_ABIERTO = 30;
  const abiertoPorDefecto = view === "curso" && activos.length <= TOPE_ABIERTO;
  // `porDefecto` = cómo nace ESA carpeta (no siempre el defecto global): una carpeta con
  // un solo servicio nace abierta con su tema, y aun así su flecha tiene que plegarla.
  // Antes su estado colgaba de la clave de la RAÍZ mientras el clic escribía la del
  // grupo: la flecha no hacía nada (reportado por Matthias el 19/09).
  const estaAbierto = (k: string, porDefecto = abiertoPorDefecto) =>
    Boolean(q.trim()) || (porDefecto ? !cerrados.has(k) : abiertos.has(k));
  const toggle = (k: string, porDefecto = abiertoPorDefecto) => {
    if (porDefecto) setCerrados((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    else setAbiertos((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };

  async function cerrar(e: ItemLista, salida: Salida) {
    if (cerrando) return;
    setCerrando(true); setErrorCierre(null);
    try {
      const res = await fetch(`/api/expedientes/${e.id}/cerrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salida, avisar: false }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo cerrar el expediente."));
      setArchivados((prev) => new Set(prev).add(e.id));
      setDialogo(null);
      setAviso(`${e.referencia} · ${t("archivado")} · ${t(etiquetaSalida(salida) ?? "")}`);
      router.refresh();
    } catch (err) {
      setErrorCierre(err instanceof Error ? err.message : t("No se pudo cerrar el expediente."));
    } finally { setCerrando(false); }
  }

  async function reclasificar(e: ItemLista, salida: Salida) {
    try {
      const res = await fetch(`/api/expedientes/${e.id}/salida`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salida }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo reclasificar."));
      setAviso(`${e.referencia} → ${t(etiquetaSalida(salida) ?? "")}`);
      router.refresh();
    } catch (err) { setAviso(err instanceof Error ? err.message : t("No se pudo reclasificar.")); }
  }
  // Restaurar desde el archivo SERVIDOR: la fila desaparece de su carpeta al instante y
  // el servidor devuelve el expediente a «En curso» (router.refresh trae los recuentos).
  const restaurarArchivo = (id: string) => {
    archivoSrv.quitar(id);
    void setArchivadoServidor(id, false).then(() => router.refresh());
  };

  const restaurar = (id: string) => {
    setArchivados((prev) => { const n = new Set(prev); n.delete(id); return n; });
    void setArchivadoServidor(id, false).then(() => router.refresh());
  };

  const grupoDe = (e: ItemLista) => grupoArbol(e, packs);

  const pasa = (e: ItemLista) => {
    if (soloEsperando && !esperandoCliente(e)) return false;
    if (asignado && e.asignadoA !== asignado) return false;
    if (tema && temaDe(e) !== tema) return false;
    const nq = norm(q.trim());
    if (!nq) return true;
    return norm(e.clienteNombre).includes(nq) || norm(e.clienteNacionalidad).includes(nq) || norm(grupoDe(e)).includes(nq)
      || norm(e.referencia).includes(nq) || norm(e.empresaNombre ?? "").includes(nq)
      || (e.extrasLabels ?? []).some((l) => norm(l).includes(nq));
  };


  const ordenPrioridad = (e: ItemLista) => e.progreso?.score ?? 50;
  const ordenarFilas = (l: ItemLista[]) =>
    view === "curso"
      ? [...l].sort((a, b) => ordenPrioridad(a) - ordenPrioridad(b))
      : [...l].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, "es"));

  // Un solo árbol por vista. Los dos bloques («Te toca a ti» / «Esperando al cliente»)
  // se retiran el 18/09: con 15 temas duplicaban el árbol entero y el estado de cada
  // expediente ya se lee en sus casillas. El recuento de espera sigue en el subtítulo.
  const bloques = useMemo(() => {
    const base = (view === "curso" ? activos : historial)
      .filter(pasa)
      .filter((e) => view !== "historial" || !catFiltro || (categoriaDe(e) ?? "sin") === catFiltro);
    return [{ key: view, arbol: construirArbol(base, {
      temas, packs, porAnios: view === "historial", ordenarFilas,
      etiquetaSinClasificar: t("Sin clasificar"), etiquetaSinFecha: t("Sin fecha"),
      // Solo en «En curso»: el archivo se recorre para buscar, no para ver la estructura.
      carpetasVacias: view === "curso" && !q.trim() && !tema && !asignado && !soloEsperando ? carpetasVacias : [],
    }) }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activos, historial, q, asignado, tema, catFiltro, temas, packs, soloEsperando, carpetasVacias]);

  const total = bloques.reduce((a, b) => a + b.arbol.reduce((x, r) => x + r.n, 0), 0);


  // Activos por carpeta raíz: es el círculo verde, y en «En curso» es el ÚNICO recuento
  // de la carpeta. Por eso cuenta lo FILTRADO: con un filtro puesto, un 9 sobre una
  // carpeta que enseña una fila es una cifra que miente.
  const activosPorRaiz = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of activos.filter(pasa)) m.set(raizDe(e, packs), (m.get(raizDe(e, packs)) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos, packs, q, asignado, tema, soloEsperando]);

  // ── ARCHIVO SERVIDOR ───────────────────────────────────────────────────────
  const archivoSrv = useArchivoServidor();
  const catalogoArchivo = useMemo(() => new Map((archivo?.catalogo ?? []).map((c) => [c.clave, c])), [archivo]);
  const etiquetaTipo = useCallback((tipo: string) => archivo?.etiquetasTipo?.[tipo] ?? (tipo ? tipo : ""), [archivo]);
  const aItem = useCallback((f: FilaHistorial): ItemLista => {
    const info = catalogoArchivo.get(f.servicio);
    return {
      // Expediente DE EMPRESA archivado: el nombre es la empresa (el servidor deja «—» sin persona).
      id: f.id, referencia: f.referencia, clienteNombre: (f.cliente && f.cliente !== "—" ? f.cliente : f.empresa) || "—", clienteNacionalidad: "",
      empresaNombre: f.empresa || null, tipoLabel: info?.label || etiquetaTipo(f.tipo) || f.servicio || "—",
      estado: f.estado as ExpedienteEstado, asignadoA: f.asignado || "Sin asignar",
      presentadoEl: f.presentacion || undefined, archivado: true, salida: f.salida || null,
      validados: 0, total: 0, tema: info?.tema ?? null, servicioLabel: info?.label ?? null,
      claves: f.servicio ? [f.servicio] : [], anio: f.anio || null,
    };
  }, [catalogoArchivo, etiquetaTipo]);

  // Recuentos ya filtrados por tema/responsable (las pastillas de salida cuentan sobre eso).
  const resumenBase = useMemo(
    () => (archivo ? filtrarResumen(archivo.resumen, { asignado: asignado || null, tema: tema && tema !== SIN_TEMA ? tema : null }, catalogoArchivo) : []),
    [archivo, asignado, tema, catalogoArchivo],
  );
  // El AÑO es un filtro, uno a la vez (el corriente al entrar). La lista de años se
  // calcula ANTES de filtrar por año, si no desaparecerían los demás.
  const aniosArchivo = useMemo(() => aniosDelResumen(resumenBase), [resumenBase]);
  const [anio, setAnio] = useState<string | null>(null);
  const anioElegido = anio !== null && aniosArchivo.some((a) => a.anio === anio) ? anio : anioPorDefecto(aniosArchivo);
  const resumenAnio = useMemo(
    () => (anioElegido === null ? resumenBase : filtrarResumen(resumenBase, { anio: anioElegido }, catalogoArchivo)),
    [resumenBase, anioElegido, catalogoArchivo],
  );
  const salidasArchivo = useMemo(() => salidasDelResumen(resumenAnio), [resumenAnio]);
  const arbolArchivo = useMemo(() => (archivo ? construirArbolHistorial(
    filtrarResumen(resumenAnio, { salida: catFiltro || null }, catalogoArchivo),
    { catalogo: catalogoArchivo, temas, etiquetaSinClasificar: t("Sin clasificar"), etiquetaTipo,
      carpetasVacias: !q.trim() && !tema && !asignado && !catFiltro ? carpetasVacias : [] },
  ) : []), [archivo, resumenAnio, catFiltro, catalogoArchivo, temas, t, etiquetaTipo, carpetasVacias, q, tema, asignado]);
  const totalArchivo = archivo ? totalResumen(archivo.resumen) : historial.length;

  // Búsqueda en el archivo: la hace el SERVIDOR (si no, buscar solo miraría lo ya traído).
  const [busqueda, setBusqueda] = useState<{ q: string; filas: ItemLista[]; mas: boolean } | null>(null);
  useEffect(() => {
    if (!archivo) return;
    const txt = q.trim();
    if (!txt) { setBusqueda(null); return; }
    let vivo = true;
    const id = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ q: txt, limit: "26" });
        if (asignado) p.set("asignado", asignado);
        const res = await fetch(`/api/expedientes/historial?${p}`);
        if (!res.ok) return;
        const j = (await res.json()) as { filas: FilaHistorial[] };
        if (!vivo) return;
        const filas = (j.filas ?? []).map(aItem);
        setBusqueda({ q: txt, filas: filas.slice(0, 25), mas: filas.length > 25 });
      } catch { /* la pantalla sigue con lo que tiene */ }
    }, 300);
    return () => { vivo = false; clearTimeout(id); };
  }, [q, asignado, archivo, aItem]);

  // Los parámetros de una carpeta: los filtros puestos viajan con ella (si no, «Concedido»
  // contaría 3 y enseñaría 8).
  const queryCarpeta = useCallback((g: CarpetaServicio): Record<string, string> => {
    const q: Record<string, string> = { servicio: g.servicio, tipo: g.tipo, anio: anioElegido ?? "", limit: "200" };
    if (asignado) q.asignado = asignado;
    if (catFiltro) q.salida = catFiltro === "sin" ? "" : catFiltro;
    return q;
  }, [asignado, catFiltro, anioElegido]);

  // Una carpeta abierta pide SUS filas. La llave incluye los filtros: con «Concedido» o
  // con un responsable puesto, las filas de esa carpeta no son las mismas.
  useEffect(() => {
    if (!archivo || view !== "historial" || q.trim()) return;
    const sufijo = `|${asignado}|${catFiltro}|${anioElegido ?? ""}`;
    for (const r of arbolArchivo) {
      const kRaiz = `historial/${r.clave}`;
      if (!estaAbierto(kRaiz)) continue;
      for (const g of r.grupos) {
        const defG = r.grupos.length === 1 ? estaAbierto(kRaiz) : abiertoPorDefecto;
        if (!estaAbierto(`historial/${g.clave}`, defG)) continue;
        void archivoSrv.pedir(g.clave + sufijo, queryCarpeta(g), aItem);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo, view, q, arbolArchivo, abiertos, cerrados, asignado, catFiltro, anioElegido, aItem, queryCarpeta]);

  // Buscar en «En curso» y no encontrar nada NO quiere decir que no exista: puede estar
  // archivado (y al revés). Se dice cuántos coinciden en la otra vista y se va de un clic.
  // Con el archivo en el servidor, ese recuento lo da su búsqueda (la lista local está vacía).
  const enLaOtraVista = (() => {
    if (!q.trim()) return 0;
    if (view === "historial") return activos.filter(pasa).length;
    return archivo ? (busqueda?.filas.length ?? 0) : historial.filter(pasa).length;
  })();

  const nEsperando = activos.filter(esperandoCliente).length;
  const filtrosAsignado = asignados.filter((a) => a !== "Sin asignar");
  const chip = (activo: boolean) => `rounded-full border px-2.5 py-1 text-xs font-medium transition ${activo ? "border-aproba-500 bg-aproba-50 text-aproba-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`;

  return (
    <AvataresProvider value={avatares}>
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Expedientes")}</h1>
          <p className="text-sm text-slate-500">
            {view === "curso"
              ? `${activos.length} ${t("en curso")}${nEsperando > 0 ? ` · ${nEsperando} ${t("esperando al cliente")}` : ""}`
              : archivo && anioElegido !== null
                ? `${totalResumen(resumenAnio)} ${t("en el historial")} · ${anioElegido || t("sin fecha")}`
                : `${totalArchivo} ${t("en el historial")}`}
          </p>
        </div>
        <VistasExpedientes activa={view} totalHistorial={totalArchivo} totalRenovaciones={renovaciones} onCambiar={cambiarVista} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente, trámite, referencia…")} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-8 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm" />
          {q && <button onClick={() => setQ("")} aria-label={t("Borrar")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500">✕</button>}
        </div>
        {temas.length > 0 && (
          <select value={tema} onChange={(e) => setTema(e.target.value)} aria-label={t("Tema")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 outline-none focus:border-aproba-600">
            <option value="">{t("Todos los temas")}</option>
            {temas.map((x) => <option key={x} value={x}>{x}</option>)}
            <option value={SIN_TEMA}>{t("Otros trámites")}</option>
          </select>
        )}
        {filtrosAsignado.length > 0 && (
          <select value={asignado} onChange={(e) => setAsignado(e.target.value)} aria-label={t("Responsable")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 outline-none focus:border-aproba-600">
            <option value="">{t("Todo el equipo")}</option>
            {filtrosAsignado.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {/* «Esperando al cliente» a la DERECHA del equipo (21/09, Matthias): primero se
            elige de quién son los expedientes, luego se afina por estado. */}
        {view === "curso" && (nEsperando > 0 || soloEsperando) && (
          <button type="button" onClick={() => setSoloEsperando((v) => !v)} className={chip(soloEsperando)}>
            {t("Esperando al cliente")} <span className="opacity-70">{nEsperando}</span>
          </button>
        )}
        {/* AÑO (solo en el historial): un filtro, uno solo a la vez — así la carpeta no
            repite «2026» en cada línea cuando toda la pantalla ya es de 2026. Lista
            desplegable a la derecha del equipo (20/09, Matthias), no una fila de chips. */}
        {view === "historial" && archivo && aniosArchivo.length > 0 && !busqueda && (
          <select value={anioElegido ?? ""} onChange={(e) => setAnio(e.target.value)} aria-label={t("Año")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 outline-none focus:border-aproba-600">
            {aniosArchivo.map((a) => <option key={a.anio || "sin"} value={a.anio}>{a.anio || t("Sin fecha")} ({a.n})</option>)}
          </select>
        )}
      </div>

      {view === "historial" && totalArchivo > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ key: "", label: "Todas" }, ...SALIDAS.map((s) => ({ key: s.key as string, label: s.label })), { key: "sin", label: "Sin clasificar" }].map((c) => {
            const n = archivo
              ? (c.key === "" ? totalResumen(resumenBase) : salidasArchivo.get(c.key) ?? 0)
              : c.key === "" ? historial.length : historial.filter((e) => (categoriaDe(e) ?? "sin") === c.key).length;
            if (c.key !== "" && n === 0) return null;
            return <button key={c.key} onClick={() => setCatFiltro(c.key)} className={chip(catFiltro === c.key)}>{t(c.label)} <span className="opacity-70">{n}</span></button>;
          })}
        </div>
      )}

      {archivo && view === "historial" ? (
        // ARCHIVO DEL SERVIDOR: las carpetas salen de los recuentos; las filas se piden
        // al abrir un año. Buscar no recorre el árbol: pregunta al servidor.
        busqueda ? (
          busqueda.filas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-400">{t("Nada con estos filtros.")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white">
              <ListaFilas lista={busqueda.filas} cerrado sangria="pl-4"
                onRestaurar={restaurarArchivo}
                onReclasificar={(x, sal) => void reclasificar(x, sal)} />
              {busqueda.mas && (
                <p className="border-t border-slate-50 px-4 py-2.5 text-xs text-slate-400">
                  {t("Se muestran los 25 primeros. Afina la búsqueda para ver el resto.")}
                </p>
              )}
            </div>
          )
        ) : arbolArchivo.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-400">{totalArchivo === 0 ? t("Todavía no has cerrado ningún expediente.") : t("Nada con estos filtros.")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white">
            {arbolArchivo.map((r) => {
              const kRaiz = `historial/${r.clave}`;
              return (
                <Nivel key={kRaiz} titulo={r.titulo} n={r.n === 0 ? undefined : r.n} vacia={r.n === 0} abierto={estaAbierto(kRaiz)} onToggle={() => toggle(kRaiz)} raiz>
                  {r.grupos.map((g) => {
                    const kg = `historial/${g.clave}`;
                    const defG = r.grupos.length === 1 ? estaAbierto(kRaiz) : abiertoPorDefecto;
                    const abiertoG = estaAbierto(kg, defG);
                    return (
                      <Nivel key={kg} titulo={g.nombre} n={g.n} abierto={abiertoG} onToggle={() => toggle(kg, defG)}>
                        <FilasArchivo
                          carpeta={g} sufijo={`|${asignado}|${catFiltro}|${anioElegido ?? ""}`} query={queryCarpeta(g)}
                          srv={archivoSrv} aItem={aItem}
                          onRestaurar={restaurarArchivo}
                          onReclasificar={(x, sal) => void reclasificar(x, sal)} />
                      </Nivel>
                    );
                  })}
                </Nivel>
              );
            })}
          </div>
        )
      ) : total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          {view === "curso" && activos.length === 0 ? (
            <>
              <p className="text-3xl">🗂️</p>
              <p className="mt-3 font-semibold text-slate-700">{t("Tu primer expediente en 3 pasos")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{t("Creas el expediente y envías el enlace → tu cliente rellena sus datos y sube los documentos → la IA los valida y tú generas los formularios oficiales.")}</p>
              <Link href="/app/expedientes/nuevo" className="mt-5 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Crear mi primer expediente")}</Link>
            </>
          ) : (
            <p className="text-sm text-slate-400">{view === "historial" && historial.length === 0 ? t("Todavía no has cerrado ningún expediente.") : t("Nada con estos filtros.")}</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {bloques.map((b) => (
            <section key={b.key} className="space-y-3">
              {(
                // UN SOLO panel para todo el árbol: 15 temas son 15 FILAS, no 15 cajas.
                // La jerarquía la marcan la sangría y el peso del texto, como un
                // explorador de archivos.
                <div className="overflow-hidden rounded-2xl bg-white">
                  {b.arbol.map((r) => (
                    <Nivel
                      key={`${b.key}/${r.clave}`} titulo={r.titulo} vacia={r.n === 0}
                      n={view === "curso" ? undefined : r.n}
                      enCurso={view === "curso" ? (activosPorRaiz.get(r.clave) ?? 0) : undefined}
                      abierto={estaAbierto(`${b.key}/${r.clave}`)} onToggle={() => toggle(`${b.key}/${r.clave}`)} raiz
                    >
                      {/* Servicio sin tema (o sin clasificar): las filas cuelgan de la raíz. */}
                      {r.filas.length > 0 && (
                        <ListaFilas lista={r.filas} cerrado={view === "historial"} sangria="pl-9"
                          onArchive={(x) => { setErrorCierre(null); setDialogo(x); }}
                          onRestaurar={restaurar}
                          onReclasificar={(x, sal) => void reclasificar(x, sal)} />
                      )}
                      {r.grupos.map((g) => {
                        const k = `${b.key}/${g.clave}`;
                        // Un solo servicio: nace abierto con su tema (sin pedir un clic de
                        // más) pero se pliega como cualquier otro.
                        const defecto = r.grupos.length === 1 ? estaAbierto(`${b.key}/${r.clave}`) : abiertoPorDefecto;
                        const abierto = estaAbierto(k, defecto);
                        return (
                          <Nivel key={k} titulo={g.nombre} n={g.lista.length} abierto={abierto} onToggle={() => toggle(k, defecto)}>
                            {g.anios
                              ? g.anios.map((an) => {
                                  const ka = `${b.key}/${an.clave}`;
                                  // Un solo año: se abre con el servicio (no se pide un clic de más).
                                  const abiertoAnio = g.anios!.length === 1 ? abierto : estaAbierto(ka);
                                  return (
                                    <Nivel key={ka} titulo={an.nombre} n={an.lista.length} abierto={abiertoAnio} onToggle={() => toggle(ka)} anio>
                                      <ListaFilas lista={an.lista} cerrado sangria="pl-[4.5rem]"
                                        onRestaurar={restaurar}
                                        onReclasificar={(x, sal) => void reclasificar(x, sal)} />
                                    </Nivel>
                                  );
                                })
                              : (
                                <ListaFilas lista={g.lista} cerrado={view === "historial"} sangria="pl-14"
                                  onArchive={(x) => { setErrorCierre(null); setDialogo(x); }}
                                  onRestaurar={restaurar}
                                  onReclasificar={(x, sal) => void reclasificar(x, sal)} />
                              )}
                          </Nivel>
                        );
                      })}
                    </Nivel>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {archivoSrv.error && view === "historial" && (
        <p className="mt-3 text-center text-xs text-red-600">{t("No se pudo cargar esta carpeta del historial.")}</p>
      )}

      {enLaOtraVista > 0 && (
        <button
          type="button" onClick={() => setView(view === "curso" ? "historial" : "curso")}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-xs font-semibold text-aproba-700 transition hover:border-aproba-300 hover:bg-aproba-50/40"
        >
          {(view === "curso" ? t("{n} más en el historial") : t("{n} más en curso")).replace("{n}", String(enLaOtraVista))} →
        </button>
      )}

      {dialogo && (
        <CerrarExpedienteDialog
          referencia={dialogo.referencia} cliente={dialogo.clienteNombre} sinFactura busy={cerrando} error={errorCierre}
          onClose={() => { if (!cerrando) setDialogo(null); }}
          onConfirm={({ salida }) => void cerrar(dialogo, salida)}
        />
      )}
      {aviso && (
        <div className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-float">
          <span>{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-slate-400 hover:text-white" aria-label={t("Cerrar")}>✕</button>
        </div>
      )}
    </div>
    </AvataresProvider>
  );
}
