"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPct, newServicio, DEFAULT_SERVICIOS, type Pack, type Servicio } from "@/lib/servicios";
import { arbolCarpetas, nombreDeCarpeta, nombreLibre, nuevaCarpeta, precioDeItem, puedeVerCarpeta, quitarCarpeta, renombrarCarpeta, type Carpeta } from "@/lib/carpetas";

// Clave interna de la carpeta «sin tema» (no es un tema: es su ausencia).
const SIN_TEMA_CLAVE = "__sin__";
import { guardarCarpetas, guardarPacksEspejo, guardarServicios } from "@/lib/config-browser";
import { eur, totalDe } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";
import { AvatarGestor } from "@/components/avatar-gestor";

type SaveState = "idle" | "saving" | "saved" | "error";

// Reordenación por ARRASTRE (compartida por servicios y packs, también en el onboarding).
// Pointer events → funciona con ratón Y con el dedo (el drag&drop HTML5 no existe en
// táctil). Mientras se arrastra, la lista se recoloca en vivo bajo el puntero: el hueco
// de inserción = nº de tarjetas cuyo punto medio queda por encima del puntero.
export function useReordenar<T>(
  setLista: React.Dispatch<React.SetStateAction<T[]>>,
  getId: (x: T) => string,
  // Se llama al SOLTAR, con la altura del puntero: así el llamante puede decidir en qué
  // carpeta (tema) ha caído la tarjeta. Sin esto, arrastrar solo reordenaba.
  alSoltar?: (id: string, y: number) => void,
) {
  const refs = useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const registrar = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const colocar = (id: string, y: number) => {
    // FLIP: posición de cada tarjeta ANTES de reordenar → las que cambien de sitio
    // se deslizan (transform invertido → 0) en vez de saltar. La arrastrada no se
    // anima: aterriza directa en el hueco bajo el puntero.
    const antes = new Map<string, number>();
    refs.current.forEach((el, k) => antes.set(k, el.getBoundingClientRect().top));
    setLista((lista) => {
      const from = lista.findIndex((x) => getId(x) === id);
      if (from < 0) return lista;
      const resto = lista.filter((x) => getId(x) !== id);
      let ins = resto.length;
      for (let k = 0; k < resto.length; k++) {
        const el = refs.current.get(getId(resto[k]));
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { ins = k; break; }
      }
      if (ins === from) return lista;
      const next = [...resto];
      next.splice(ins, 0, lista[from]);
      return next;
    });
    requestAnimationFrame(() => {
      refs.current.forEach((el, k) => {
        if (k === id) return;
        const a = antes.get(k);
        if (a == null) return;
        const d = a - el.getBoundingClientRect().top;
        if (d) el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 160, easing: "ease-out" });
      });
    });
  };

  // Los move/up van a WINDOW, no al asa: en cuanto la lista se reordena, React
  // RECOLOCA el nodo en el DOM (insertBefore) y Chrome libera la captura del
  // puntero — con captura en el asa solo se podía mover UN puesto por gesto.
  const asa = (id: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      dragRef.current = id;
      setDragId(id);
      let ultimaY = e.clientY;
      const move = (ev: PointerEvent) => {
        if (dragRef.current !== id) return;
        ultimaY = ev.clientY;
        // Auto-scroll cerca de los bordes (con touch-none el gesto ya no hace scroll).
        if (ev.clientY < 90) window.scrollBy(0, -14);
        else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
        colocar(id, ev.clientY);
      };
      const fin = () => {
        dragRef.current = null;
        setDragId(null);
        alSoltar?.(id, ultimaY);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", fin);
        window.removeEventListener("pointercancel", fin);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", fin);
      window.addEventListener("pointercancel", fin);
    },
  });

  return { dragId, registrar, asa };
}

// Asa de arrastre (⠿ grip estándar, 2×3 puntos): mantener pulsado y mover la tarjeta
// a su sitio. Teclado: ↑/↓ sobre el asa mueven un puesto (accesibilidad).
export function AsaArrastre({ arrastrando, onMover, label, ...handlers }: {
  arrastrando: boolean;
  onMover: (delta: -1 | 1) => void;
  label: string;
} & Pick<React.DOMAttributes<HTMLButtonElement>, "onPointerDown">) {
  return (
    <button
      type="button"
      aria-label={`${label} — arrastra para reordenar (o usa ↑/↓)`}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); onMover(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); onMover(1); }
      }}
      className={`shrink-0 touch-none rounded-md p-1 transition-colors hover:bg-slate-100 hover:text-slate-500 sm:p-1.5 ${arrastrando ? "cursor-grabbing bg-slate-100 text-slate-500" : "cursor-grab text-slate-300"}`}
      {...handlers}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

// `oficinaId` (multi-oficina) : édite le catalogue PROPRE de cette sede. Les packs
// restent du despacho (Workspace.packs) → masqués sur les sedes (`sinPacks`).
export function ServiciosManager({ inicial, packsInicial, oficinaId = null, sinPacks = false, carpetasInicial = [], equipo = [], miUserId = null, soyAdmin = true }: {
  inicial: Servicio[];
  packsInicial?: Pack[];
  oficinaId?: string | null;
  sinPacks?: boolean;
  // Carpetas del catálogo (Workspace.temas) y quién es quién, para el acceso por persona.
  carpetasInicial?: Carpeta[];
  equipo?: { userId: string; nombre: string; avatarUrl?: string | null }[];
  miUserId?: string | null;
  soyAdmin?: boolean;
}) {
  const t = useT();
  const [servicios, setServicios] = useState<Servicio[]>(inicial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Tarjetas plegadas por defecto: la lista se escanea (nombre · precio · docs) y solo
  // se despliega el servicio que se está editando — antes eran ~8 pantallas de campos.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const [nuevoDoc, setNuevoDoc] = useState<Record<string, string>>({});
  const removed = useRef<Set<string>>(new Set());
  const mounted = useRef(false);
  // Packs: estado y autosave PROPIOS (van a Workspace.packs, no a ServicioConfig).
  // Los packs ya no son una lista aparte: son ítems con servicios dentro. Los que aún
  // vivan solo en Workspace.packs (migración recién puesta) se adoptan aquí, y el primer
  // guardado los deja escritos como cualquier otro ítem.
  const [carpetas, setCarpetas] = useState<Carpeta[]>(carpetasInicial);
  useEffect(() => {
    const huerfanos = (packsInicial ?? []).filter((p) => p.id && !inicial.some((s) => s.id === p.id));
    if (huerfanos.length === 0) return;
    setServicios((lista) => [...lista, ...huerfanos.map((p) => ({
      id: p.id, label: p.nombre, desc: p.desc ?? "", docs: [], active: true,
      precio: 0, anticipo: 0, resto: 0,
      servicioIds: p.servicioIds ?? [], descuentoPct: p.descuentoPct ?? 0,
      categoria: p.categoria || undefined,
      temaId: carpetasInicial.find((c) => c.nombre.trim().toLowerCase() === (p.categoria ?? "").trim().toLowerCase())?.id ?? null,
      precioOculto: p.precioOculto || undefined,
      porcentaje: p.porcentaje && p.porcentaje > 0 ? p.porcentaje : undefined,
      porcentajeSobre: p.porcentajeSobre || undefined,
    } as Servicio))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packsMounted = useRef(false);

  // Persister en base (Supabase, RLS) à chaque changement — debounce 600 ms.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        const claves = [...removed.current];
        await guardarServicios(servicios, claves, oficinaId);
        claves.forEach((c) => removed.current.delete(c));
        // ESPEJO: Workspace.packs se reescribe con los ítems-pack. El portal del cliente,
        // /c, /j y los enlaces ?pack=… siguen leyendo exactamente lo de siempre.
        if (!oficinaId && !sinPacks) await guardarPacksEspejo(servicios);
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [servicios]);

  // Las carpetas viven en Workspace.temas: se guardan aparte, con el mismo debounce.
  useEffect(() => {
    if (!packsMounted.current) {
      packsMounted.current = true;
      return;
    }
    const t = window.setTimeout(() => { void guardarCarpetas(carpetas).catch(() => setSaveState("error")); }, 600);
    return () => window.clearTimeout(t);
  }, [carpetas]);

  const update = (id: string, patch: Partial<Servicio>) =>
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // ── CARPETAS POR TEMA ──────────────────────────────────────────────────────
  // El catálogo se ve como se ve la pantalla de Expedientes: una carpeta por tema y los
  // servicios dentro. Arrastrar una tarjeta a otra carpeta CAMBIA su tema (pedido de
  // Matthias, 19/09) — antes había que escribirlo a mano en un campo libre.
  const zonas = useRef<Map<string, HTMLElement>>(new Map());
  const zonaRef = (tema: string) => (el: HTMLElement | null) => { if (el) zonas.current.set(tema, el); else zonas.current.delete(tema); };

  // Carpeta bajo el puntero al soltar (null = ninguna).
  const carpetaEn = (y: number): string | null => {
    for (const [tema, el] of zonas.current) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return tema;
    }
    return null;
  };

  // Soltar una tarjeta dentro de una carpeta la MUEVE ahí (y su `categoria` sigue al día,
  // que es lo que leen el portal y el árbol de expedientes).
  const dndServicios = useReordenar(setServicios, (s) => s.id, (id, y) => {
    const destino = carpetaEn(y);
    if (destino === null) return;
    const temaId = destino === SIN_TEMA_CLAVE ? null : destino;
    setServicios((lista) => lista.map((s) => (s.id === id
      ? { ...s, temaId, categoria: temaId ? nombreDeCarpeta(carpetas, temaId) : "" }
      : s)));
  });


  // Subir/bajar una tarjeta: el orden del array ES la columna `orden` al guardar.
  const mover = (id: string, delta: -1 | 1) =>
    setServicios((list) => {
      const i = list.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addDoc = (id: string) => {
    const val = (nuevoDoc[id] ?? "").trim();
    if (!val) return;
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, docs: [...s.docs, val] } : s)));
    setNuevoDoc((m) => ({ ...m, [id]: "" }));
  };

  const removeDoc = (id: string, idx: number) =>
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, docs: s.docs.filter((_, i) => i !== idx) } : s)));

  const activos = servicios.filter((s) => s.active).length;

  // ── EL EXPLORADOR ──────────────────────────────────────────────────────────
  // Carpetas visibles para QUIEN mira (un admin lo ve todo), con sus subcarpetas, y los
  // ítems de cada una. Los que no están en ninguna carpeta se ven igual, al final: un
  // servicio nunca desaparece por no tener carpeta.
  const visible = (c: Carpeta) => puedeVerCarpeta(c, miUserId, soyAdmin);
  const arbol = arbolCarpetas(carpetas).filter((n) => visible(n.carpeta));
  const dentroDe = (temaId: string | null) => servicios.filter((s) => (s.temaId ?? null) === temaId);
  const idsEnCarpetas = new Set(carpetas.map((c) => c.id));
  const sueltos = servicios.filter((s) => !s.temaId || !idsEnCarpetas.has(s.temaId));
  const cuentaCarpeta = (c: Carpeta) =>
    dentroDe(c.id).length + carpetas.filter((h) => h.parentId === c.id).reduce((a, h) => a + dentroDe(h.id).length, 0);

  // Crear / renombrar / borrar. Borrar NUNCA borra los servicios de dentro: suben a la
  // superficie (sin carpeta) para que el gestor los vuelva a colocar.
  const crearCarpeta = (parentId: string | null) => {
    const base = parentId ? t("Nueva subcarpeta") : t("Nueva carpeta");
    let nombre = base, i = 2;
    while (!nombreLibre(carpetas, nombre, parentId)) nombre = `${base} ${i++}`;
    const c = nuevaCarpeta(nombre, parentId, carpetas.length);
    setCarpetas((l) => [...l, c]);
    setRenombrando({ id: c.id, nombre });
  };
  const [renombrando, setRenombrando] = useState<{ id: string; nombre: string } | null>(null);
  const [accesoAbierto, setAccesoAbierto] = useState<string | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const confirmarNombre = () => {
    if (!renombrando) return;
    const c = carpetas.find((x) => x.id === renombrando.id);
    const limpio = renombrando.nombre.trim();
    if (c && limpio && nombreLibre(carpetas, limpio, c.parentId ?? null, c.id)) {
      const r = renombrarCarpeta(carpetas, servicios, c.id, limpio);
      setCarpetas(r.carpetas); setServicios(r.items);
    }
    setRenombrando(null);
  };
  const borrarCarpeta = (id: string) => {
    const r = quitarCarpeta(carpetas, servicios, id);
    setCarpetas(r.carpetas); setServicios(r.items);
  };
  const cambiarAcceso = (id: string, userId: string) =>
    setCarpetas((l) => l.map((c) => {
      if (c.id !== id) return c;
      const actual = c.usuarios ?? [];
      return { ...c, usuarios: actual.includes(userId) ? actual.filter((u) => u !== userId) : [...actual, userId] };
    }));

  // Trámites del catálogo (claves fijas, p.ej. residencia_ue/brexit/modificacion) que aún
  // no están en la lista. Añadirlos así conserva la clave → el modelo EX correcto se mapea.
  const enCatalogo = DEFAULT_SERVICIOS.filter((d) => !servicios.some((s) => s.id === d.id));
  const addDelCatalogo = (id: string) => {
    const base = DEFAULT_SERVICIOS.find((d) => d.id === id);
    if (!base || servicios.some((s) => s.id === id)) return;
    setServicios((list) => [...list, { ...base, docs: [...base.docs], active: true }]);
    setAbiertos((a) => ({ ...a, [id]: true })); // recién añadido → abierto para configurarlo
  };

  // Marcado como pack = tiene lista de servicios, aunque aún esté vacía (si no, al marcar
  // la casilla el bloque desaparecía y era imposible elegir el primer servicio).
  const marcadoPack = (x: Servicio) => Array.isArray(x.servicioIds);

  // Cabecera de una carpeta: su nombre (editable en el sitio), cuántas cosas lleva y sus
  // acciones. El acceso se despliega debajo, con la lista del equipo.
  const CabeceraCarpeta = ({ carpeta, n, raiz = false }: { carpeta: Carpeta; n: number; raiz?: boolean }) => {
    const reservada = (carpeta.usuarios ?? []).length > 0;
    return (
      <div className={`flex flex-wrap items-center gap-2 px-4 ${raiz ? "py-3" : "py-2.5"}`}>
        <svg className={`shrink-0 text-slate-400 ${raiz ? "h-4 w-4" : "h-3.5 w-3.5"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6l-1.7-2.2A1 1 0 0 0 9.9 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" /></svg>
        {renombrando?.id === carpeta.id ? (
          <input
            autoFocus value={renombrando.nombre}
            onChange={(e) => setRenombrando({ id: carpeta.id, nombre: e.target.value })}
            onBlur={confirmarNombre}
            onKeyDown={(e) => { if (e.key === "Enter") confirmarNombre(); if (e.key === "Escape") setRenombrando(null); }}
            className="min-w-0 flex-1 rounded-md border border-aproba-400 px-2 py-1 text-sm font-semibold outline-none"
          />
        ) : (
          <button
            type="button" onClick={() => setRenombrando({ id: carpeta.id, nombre: carpeta.nombre })}
            className={`rounded px-1 text-left font-semibold transition hover:bg-slate-100 ${raiz ? "text-sm text-slate-800" : "text-[13px] text-slate-600"}`}
            title={t("Renombrar")}
          >
            {carpeta.nombre}
          </button>
        )}
        <span className="text-xs tabular-nums text-slate-400">{n}</span>
        {reservada && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500" title={t("Carpeta reservada")}>
            {(carpeta.usuarios ?? []).length} {t("con acceso")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {raiz && (
            <button type="button" onClick={() => crearCarpeta(carpeta.id)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
              + {t("Subcarpeta")}
            </button>
          )}
          {equipo.length > 0 && (
            <button
              type="button" onClick={() => setAccesoAbierto((x) => (x === carpeta.id ? null : carpeta.id))}
              className={`rounded-md px-2 py-1 text-xs font-medium transition hover:bg-slate-100 ${accesoAbierto === carpeta.id ? "text-aproba-700" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t("Acceso")}
            </button>
          )}
          <button
            type="button" onClick={() => borrarCarpeta(carpeta.id)}
            aria-label={`${t("Eliminar carpeta")} ${carpeta.nombre}`}
            title={t("Eliminar carpeta (lo que haya dentro queda sin carpeta)")}
            className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </span>
        {accesoAbierto === carpeta.id && (
          <div className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs text-slate-500">
              {t("Quién ve esta carpeta. Sin nadie marcado, la ve todo el equipo; los administradores la ven siempre.")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {equipo.map((m) => {
                const marcado = (carpeta.usuarios ?? []).includes(m.userId);
                return (
                  <button
                    key={m.userId} type="button" onClick={() => cambiarAcceso(carpeta.id, m.userId)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${marcado ? "border-aproba-500 bg-aproba-50 text-aproba-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                  >
                    <AvatarGestor nombre={m.nombre} foto={m.avatarUrl} size={18} />
                    {m.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Una tarjeta del catálogo (servicio o pack). Función, no componente: así los
  // campos de texto no pierden el foco al reordenarse la lista.
  const tarjeta = (s: Servicio) => (
            <div key={s.id} ref={dndServicios.registrar(s.id)} className={`rounded-xl border bg-white p-4 transition-colors ${s.active ? "border-slate-200" : "border-slate-200 bg-slate-50/60"} ${dndServicios.dragId === s.id ? "relative z-10 opacity-95 shadow-lg ring-2 ring-aproba-300" : ""}`}>
              {/* Ligne titre + toggle (gap réduit en móvil : l'asa + toggle + corbeille
                  laissent peu de place au nom) */}
              <div className="flex items-center gap-2 sm:gap-3">
                <AsaArrastre
                  arrastrando={dndServicios.dragId === s.id}
                  onMover={(d) => mover(s.id, d)}
                  label={s.label || t("Servicio")}
                  {...dndServicios.asa(s.id)}
                />
                <button
                  type="button"
                  onClick={() => setAbiertos((a) => ({ ...a, [s.id]: !a[s.id] }))}
                  aria-expanded={Boolean(abiertos[s.id])}
                  aria-label={t("Mostrar u ocultar los detalles del servicio")}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className={`h-4 w-4 transition-transform ${abiertos[s.id] ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
                <input
                  value={s.label}
                  placeholder={t("Nombre del servicio")}
                  onChange={(e) => update(s.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[16px] sm:text-sm font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
                />
                <button
                  onClick={() => update(s.id, { active: !s.active })}
                  role="switch"
                  aria-checked={s.active}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${s.active ? "bg-aproba-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.active ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <button
                  onClick={() => { removed.current.add(s.id); setServicios((list) => list.filter((x) => x.id !== s.id)); }}
                  aria-label={t("Eliminar servicio")}
                  disabled={servicios.length <= 1}
                  title={servicios.length <= 1 ? t("Conserva al menos un servicio: si el catálogo queda vacío, reaparecen los de ejemplo.") : undefined}
                  className="shrink-0 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:pointer-events-none disabled:opacity-30"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>


              <div hidden={!abiertos[s.id]}>
              <input
                value={s.desc}
                placeholder={t("Descripción breve (la verá el cliente)")}
                onChange={(e) => update(s.id, { desc: e.target.value })}
                className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[16px] sm:text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
              />


              {/* ── Hacer un pack ───────────────────────────────────────────────
                  Un servicio con servicios dentro ES un pack: su clave no cambia, así que
                  los expedientes que ya lo citan siguen resolviendo su nombre. El precio
                  deja de teclearse: es la suma de los incluidos menos el descuento. */}
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 transition hover:border-slate-300">
                <input
                  type="checkbox" checked={marcadoPack(s)}
                  onChange={(e) => update(s.id, e.target.checked
                    ? { servicioIds: [], descuentoPct: s.descuentoPct ?? 0 }
                    : { servicioIds: undefined, descuentoPct: undefined })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-700">{t("Hacer un pack")}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{t("Agrupa varios servicios bajo este nombre. El precio es la suma de los incluidos menos el descuento que indiques.")}</span>
                </span>
              </label>

              {marcadoPack(s) && (
                <div className="mt-2 rounded-lg border border-aproba-100 bg-aproba-50/40 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("Servicios incluidos")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {servicios.filter((x) => x.id !== s.id && !marcadoPack(x)).map((x) => {
                      const dentro = (s.servicioIds ?? []).includes(x.id);
                      return (
                        <button
                          key={x.id} type="button"
                          onClick={() => update(s.id, { servicioIds: dentro ? (s.servicioIds ?? []).filter((i) => i !== x.id) : [...(s.servicioIds ?? []), x.id] })}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${dentro ? "border-aproba-500 bg-white text-aproba-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                        >
                          {dentro ? "✓ " : "+ "}{x.label || t("Servicio")}
                        </button>
                      );
                    })}
                    {servicios.filter((x) => x.id !== s.id && !marcadoPack(x)).length === 0 && (
                      <span className="text-xs text-slate-400">{t("Crea antes los servicios que quieras incluir.")}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">{t("Descuento")}</span>
                      <div className="relative inline-block">
                        <input type="number" min={0} max={100} step={5} value={s.descuentoPct || ""} placeholder="0" onFocus={(e) => e.target.select()}
                          onChange={(e) => update(s.id, { descuentoPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                          className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-[16px] tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 sm:text-sm" />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                      </div>
                    </label>
                    {(() => {
                      const { suma, total, pct } = precioDeItem(s, servicios);
                      return (
                        <p className="pb-1.5 text-sm text-slate-600">
                          {eur(suma)}{pct > 0 ? <> − {pct} % = <span className="font-semibold text-slate-800">{eur(total)}</span></> : <span className="font-semibold text-slate-800"> {t("en total")}</span>}
                          <span className="ml-1 text-xs text-slate-400">{t("(sin IVA)")}</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Pago del cliente : anticipo (al firmar) + resto (al finalizar).
                  En un pack no se teclea: lo dan los servicios incluidos. */}
              <div className="mt-3 border-t border-slate-100 pt-3" hidden={marcadoPack(s)}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Pago del cliente")}</p>
                <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">{t("Al firmar")}</span>
                    <div className="relative inline-block">
                      <input type="number" min={0} step={10} value={s.anticipo || ""} placeholder="0" onFocus={(e) => e.target.select()}
                        onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { anticipo: v, precio: v + s.resto }); }}
                        className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-[16px] sm:text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                    </div>
                  </label>
                  <span className="pb-2.5 text-slate-300">+</span>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">{t("Al finalizar")}</span>
                    <div className="relative inline-block">
                      <input type="number" min={0} step={10} value={s.resto || ""} placeholder="0" onFocus={(e) => e.target.select()}
                        onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { resto: v, precio: s.anticipo + v }); }}
                        className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-[16px] sm:text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                    </div>
                  </label>
                  <div className="pb-2 text-xs text-slate-400">
                    {t("Total")} <span className="font-semibold text-slate-700">{eur(s.anticipo + s.resto)}</span>
                    <span className="mx-1">·</span> {t("IVA inc.")} <span className="font-semibold text-slate-600">{eur(totalDe(s.anticipo + s.resto))}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {s.anticipo > 0 && s.resto > 0
                    ? t("El cliente paga en la plataforma al enviar sus documentos y al finalizar — cada pago genera su factura automáticamente.")
                    : s.anticipo > 0
                      ? t("El cliente paga todo en la plataforma al enviar sus documentos — la factura se genera automáticamente.")
                      : s.resto > 0
                        ? t("El cliente paga todo en la plataforma al finalizar el trámite — la factura se genera automáticamente.")
                        : t("Sin cobro configurado: no se pedirá pago en la plataforma.")}
                </p>

                {/* Honorarios variables: % sobre una base (p. ej. compraventa). Informativo
                    de cara al cliente; la facturación automática solo usa los importes fijos. */}
                <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">{t("+ Porcentaje (opcional)")}</span>
                    <div className="relative inline-block">
                      <input type="number" min={0} max={100} step={0.1} value={s.porcentaje || ""} placeholder="0" onFocus={(e) => e.target.select()}
                        onChange={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); update(s.id, { porcentaje: v || undefined }); }}
                        className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-[16px] sm:text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                    </div>
                  </label>
                  {/* basis ≥ min utile : avec flex-1 (basis 0) la ligne ne wrap jamais et
                      l'input déborde de la tarjeta en móvil. */}
                  <label className="block grow basis-[200px]">
                    <span className="mb-1 block text-xs text-slate-500">{t("Sobre qué se aplica")}</span>
                    <input value={s.porcentajeSobre ?? ""} placeholder={t("p. ej. el precio de la compraventa")}
                      onChange={(e) => update(s.id, { porcentajeSobre: e.target.value })}
                      disabled={!s.porcentaje}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 disabled:bg-slate-50 disabled:text-slate-400" />
                  </label>
                </div>
                {Boolean(s.porcentaje) && (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {t("El cliente verá")} «{fmtPct(s.porcentaje ?? 0)} % {s.porcentajeSobre?.trim() ? `${t("sobre")} ${s.porcentajeSobre.trim()}` : t("sobre la base que indiques")}» {t("junto al precio fijo. La facturación automática solo usa los importes fijos: el importe del porcentaje lo facturas tú cuando conozcas la base.")}
                  </p>
                )}

                {/* «Precio a consultar»: oculta los importes en el portal, servicio a servicio */}
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 transition hover:border-slate-300">
                  <input type="checkbox" checked={Boolean(s.precioOculto)} onChange={(e) => update(s.id, { precioOculto: e.target.checked || undefined })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-700">{t("Precio a consultar")}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{t("El cliente no verá importes de este servicio en su portal ni se le pedirá pago online. La hoja de encargo sí incluye el precio pactado.")}</span>
                  </span>
                </label>
              </div>

              {/* Tasas y suplidos del trámite (SIN IVA, fuera de los honorarios) */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Tasas y suplidos")}</p>
                <div className="space-y-1.5">
                  {(s.suplidos ?? []).map((sup, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={sup.concepto}
                        placeholder={t("Concepto (p. ej. Tasa 790-012)")}
                        onChange={(e) => update(s.id, { suplidos: (s.suplidos ?? []).map((x, j) => j === i ? { ...x, concepto: e.target.value } : x) })}
                        className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
                      />
                      <div className="relative inline-block">
                        <input type="number" min={0} step={0.01} value={sup.importe || ""} placeholder="0" onFocus={(e) => e.target.select()}
                          onChange={(e) => update(s.id, { suplidos: (s.suplidos ?? []).map((x, j) => j === i ? { ...x, importe: Math.max(0, Number(e.target.value) || 0) } : x) })}
                          className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-[16px] sm:text-xs tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                      </div>
                      <button onClick={() => update(s.id, { suplidos: (s.suplidos ?? []).filter((_, j) => j !== i) })} aria-label={`${t("Quitar")} ${sup.concepto || t("suplido")}`} className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500">
                        <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => update(s.id, { suplidos: [...(s.suplidos ?? []), { concepto: "", importe: 0 }] })}
                  className="mt-1.5 text-xs font-medium text-aproba-700 hover:underline"
                >
                  {t("+ Añadir tasa o suplido")}
                </button>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t("Sin IVA y aparte de los honorarios. Salen en el presupuesto del cliente, en la hoja de encargo y en la primera factura del expediente (se repercuten por su importe exacto).")}
                </p>
              </div>

              {/* Documentos requeridos */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Documentos requeridos")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.docs.map((d, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs text-slate-600">
                      {t(d)}
                      <button onClick={() => removeDoc(s.id, i)} aria-label={`${t("Quitar")} ${d}`} className="rounded p-0.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  {s.docs.length === 0 && s.active && <span className="text-xs font-medium text-amber-600">⚠️ {t("Sin documentos: el cliente no podrá subir nada en su portal.")}</span>}
                  {s.docs.length === 0 && !s.active && <span className="text-xs text-slate-400">{t("Sin documentos.")}</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={nuevoDoc[s.id] ?? ""}
                    onChange={(e) => setNuevoDoc((m) => ({ ...m, [s.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addDoc(s.id); }}
                    placeholder={t("Añadir documento…")}
                    className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
                  />
                  <button onClick={() => addDoc(s.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400">{t("Añadir")}</button>
                </div>
              </div>

              {/* «Servicios no incluidos» de la hoja de encargo — varía por trámite */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Servicios no incluidos (hoja de encargo)")}</p>
                <textarea
                  value={s.noIncluye ?? ""}
                  onChange={(e) => update(s.id, { noIncluye: e.target.value })}
                  rows={2}
                  maxLength={1500}
                  placeholder={t("P. ej.: recursos administrativos o judiciales, trámites de otros organismos, desplazamientos…")}
                  className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-1.5 text-[16px] sm:text-xs leading-relaxed outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">{t("Aparece en el apartado «Servicios no incluidos» de la hoja de encargo de este servicio.")}</p>
              </div>

              {/* Cita presencial : ce trámite implique-t-il un RDV physique, et qui s'y rend ? */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Cita presencial")}</span>
                  <button
                    onClick={() => update(s.id, { citaPresencial: !s.citaPresencial })}
                    role="switch"
                    aria-checked={Boolean(s.citaPresencial)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${s.citaPresencial ? "bg-aproba-600" : "bg-slate-300"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.citaPresencial ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
                {s.citaPresencial ? (
                  <div className="mt-2">
                    <p className="mb-1.5 text-xs text-slate-500">{t("¿Quién acude a la cita?")}</p>
                    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                      {(["cliente", "gestor"] as const).map((q) => (
                        <button key={q} onClick={() => update(s.id, { citaQuien: q })} className={`px-3 py-1.5 text-xs font-medium transition ${(s.citaQuien ?? "cliente") === q ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
                          {q === "cliente" ? t("El cliente") : t("El gestor")}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      {(s.citaQuien ?? "cliente") === "cliente"
                        ? t("El cliente recibirá la fecha, hora, lugar e instrucciones de la cita.")
                        : t("El cliente solo será informado de la fecha; acude el gestor en su nombre.")}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">{t("Este trámite no requiere cita presencial — el expediente pasa directamente a finalizado.")}</p>
                )}
              </div>
              </div>
            </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos} {t("activos")}</span> {t("de")} {servicios.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && t("Guardando…")}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
          {saveState === "error" && t("Error al guardar — reintenta")}
        </span>
      </div>

      <div className="mb-3 flex justify-end">
        <button
          type="button" onClick={() => crearCarpeta(null)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6l-1.7-2.2A1 1 0 0 0 9.9 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
          {t("Nueva carpeta")}
        </button>
      </div>

      {/* ── EL EXPLORADOR ──────────────────────────────────────────────────────
          Carpetas y subcarpetas, y dentro los servicios y los packs. Cada carpeta es
          una zona de soltado: arrastrar una tarjeta dentro la mueve ahí. */}
      <div className="space-y-4">
        {arbol.map(({ carpeta, hijas }) => (
          <div key={carpeta.id} className="rounded-2xl border border-slate-200 bg-white/60">
            <CabeceraCarpeta carpeta={carpeta} n={cuentaCarpeta(carpeta)} raiz />
            <div ref={zonaRef(carpeta.id)} className={`space-y-3 px-3 pb-3 transition-colors ${dndServicios.dragId ? "rounded-b-2xl bg-aproba-50/40" : ""}`}>
              {dentroDe(carpeta.id).map(tarjeta)}
              {dentroDe(carpeta.id).length === 0 && hijas.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">{t("Arrastra aquí un servicio o un pack")}</p>
              )}
              {hijas.filter(visible).map((h) => (
                <div key={h.id} className="rounded-xl border border-slate-200 bg-white">
                  <CabeceraCarpeta carpeta={h} n={dentroDe(h.id).length} />
                  <div ref={zonaRef(h.id)} className={`space-y-3 px-3 pb-3 transition-colors ${dndServicios.dragId ? "rounded-b-xl bg-aproba-50/40" : ""}`}>
                    {dentroDe(h.id).map(tarjeta)}
                    {dentroDe(h.id).length === 0 && (
                      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">{t("Arrastra aquí un servicio o un pack")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Sin carpeta: ni se esconden ni se pierden. */}
        <div className="rounded-2xl border border-dashed border-slate-200">
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-sm font-semibold text-slate-500">{t("Sin carpeta")}</span>
            <span className="text-xs tabular-nums text-slate-400">{sueltos.length}</span>
          </div>
          <div ref={zonaRef(SIN_TEMA_CLAVE)} className={`space-y-3 px-3 pb-3 transition-colors ${dndServicios.dragId ? "rounded-b-2xl bg-aproba-50/40" : ""}`}>
            {sueltos.map(tarjeta)}
            {sueltos.length === 0 && (
              <p className="px-1 pb-2 text-xs text-slate-400">{t("Todo está en una carpeta.")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={() => setNuevoAbierto((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("Nuevo servicio")}
        </button>

        {nuevoAbierto && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
            <button
              onClick={() => {
                const nuevo = newServicio();
                setServicios((list) => [...list, nuevo]);
                setAbiertos((a) => ({ ...a, [nuevo.id]: true }));
                setNuevoAbierto(false);
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:border-aproba-300 hover:bg-aproba-50/40"
            >
              {t("En blanco")}
              <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{t("Le pones tú el nombre, el precio y los documentos.")}</span>
            </button>

            {/* Los trámites OFICIALES traen su clave: es lo que enlaza el expediente con
                su modelo EX y sus documentos. Un servicio escrito a mano no lo hace. */}
            {enCatalogo.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("O un trámite oficial")}</p>
                <p className="mb-2 text-[11px] text-slate-400">{t("Vienen con sus documentos y con los formularios oficiales (EX) que Aproba rellena sola.")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {enCatalogo.map((d) => (
                    <button
                      key={d.id} type="button"
                      onClick={() => { addDelCatalogo(d.id); setNuevoAbierto(false); }}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700"
                    >
                      + {d.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}