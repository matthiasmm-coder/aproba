"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPct, newPack, newServicio, temasUsados, DEFAULT_SERVICIOS, type Pack, type Servicio } from "@/lib/servicios";
import { guardarPacks, guardarServicios } from "@/lib/config-browser";
import { eur, totalDe } from "@/lib/facturas";
import { useT } from "@/components/lang-provider";

type SaveState = "idle" | "saving" | "saved" | "error";

// Reordenación por ARRASTRE (compartida por servicios y packs, también en el onboarding).
// Pointer events → funciona con ratón Y con el dedo (el drag&drop HTML5 no existe en
// táctil). Mientras se arrastra, la lista se recoloca en vivo bajo el puntero: el hueco
// de inserción = nº de tarjetas cuyo punto medio queda por encima del puntero.
export function useReordenar<T>(setLista: React.Dispatch<React.SetStateAction<T[]>>, getId: (x: T) => string) {
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
      const move = (ev: PointerEvent) => {
        if (dragRef.current !== id) return;
        // Auto-scroll cerca de los bordes (con touch-none el gesto ya no hace scroll).
        if (ev.clientY < 90) window.scrollBy(0, -14);
        else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 14);
        colocar(id, ev.clientY);
      };
      const fin = () => {
        dragRef.current = null;
        setDragId(null);
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

export function ServiciosManager({ inicial, packsInicial }: { inicial: Servicio[]; packsInicial?: Pack[] }) {
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
  const [packs, setPacks] = useState<Pack[]>(packsInicial ?? []);
  const [packsSave, setPacksSave] = useState<SaveState>("idle");
  const [packsError, setPacksError] = useState<string | null>(null);
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
        await guardarServicios(servicios, claves);
        claves.forEach((c) => removed.current.delete(c));
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [servicios]);

  useEffect(() => {
    if (!packsMounted.current) {
      packsMounted.current = true;
      return;
    }
    setPacksSave("saving");
    const t = window.setTimeout(async () => {
      try {
        await guardarPacks(packs);
        setPacksSave("saved");
        setPacksError(null);
        window.setTimeout(() => setPacksSave((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        setPacksSave("error");
        setPacksError(e instanceof Error ? e.message : null);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [packs]);

  const update = (id: string, patch: Partial<Servicio>) =>
    setServicios((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const updatePack = (id: string, patch: Partial<Pack>) =>
    setPacks((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const dndServicios = useReordenar(setServicios, (s) => s.id);
  const dndPacks = useReordenar(setPacks, (p) => p.id);

  const moverPack = (id: string, delta: -1 | 1) =>
    setPacks((list) => {
      const i = list.findIndex((p) => p.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
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
  // Temas ya usados (servicios + packs) → datalist compartida: el gestor reutiliza
  // sus temas escribiendo dos letras, sin obligarle a un desplegable cerrado.
  const temas = temasUsados(servicios, packs);
  const campoTema = (valor: string | undefined, onChange: (v: string) => void) => (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{t("Tema (agrupa en el portal)")}</span>
      <input
        list="aproba-temas"
        value={valor ?? ""}
        placeholder={t("p. ej. Empresa, Nacionalidad…")}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
      />
    </label>
  );

  // Trámites del catálogo (claves fijas, p.ej. residencia_ue/brexit/modificacion) que aún
  // no están en la lista. Añadirlos así conserva la clave → el modelo EX correcto se mapea.
  const enCatalogo = DEFAULT_SERVICIOS.filter((d) => !servicios.some((s) => s.id === d.id));
  const addDelCatalogo = (id: string) => {
    const base = DEFAULT_SERVICIOS.find((d) => d.id === id);
    if (!base || servicios.some((s) => s.id === id)) return;
    setServicios((list) => [...list, { ...base, docs: [...base.docs], active: true }]);
    setAbiertos((a) => ({ ...a, [id]: true })); // recién añadido → abierto para configurarlo
  };

  return (
    <div>
      <datalist id="aproba-temas">{temas.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos} {t("activos")}</span> {t("de")} {servicios.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && t("Guardando…")}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
          {saveState === "error" && t("Error al guardar — reintenta")}
        </span>
      </div>

      <div className="space-y-3">
        {servicios.map((s) => (
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
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
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

            {!abiertos[s.id] && (
              <button
                type="button"
                onClick={() => setAbiertos((a) => ({ ...a, [s.id]: true }))}
                className="mt-1 block w-full pl-14 text-left text-xs text-slate-400 transition hover:text-slate-600"
              >
                {s.precioOculto
                  ? t("Precio a consultar")
                  : `${s.anticipo + s.resto > 0 ? `${s.anticipo + s.resto} €` : t("Gratis")}${s.porcentaje ? ` + ${fmtPct(s.porcentaje)} %` : ""}`}
                {" · "}{s.docs.length} {t("docs")}
                {(s.suplidos ?? []).length > 0 ? ` · ${(s.suplidos ?? []).length} ${t("tasas")}` : ""}
                {s.categoria?.trim() ? ` · ${s.categoria.trim()}` : ""}
              </button>
            )}

            <div hidden={!abiertos[s.id]}>
            <input
              value={s.desc}
              placeholder={t("Descripción breve (la verá el cliente)")}
              onChange={(e) => update(s.id, { desc: e.target.value })}
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
            />

            <div className="mt-3">{campoTema(s.categoria, (v) => update(s.id, { categoria: v }))}</div>

            {/* Pago del cliente : anticipo (al firmar) + resto (al finalizar) */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Pago del cliente")}</p>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{t("Al firmar")}</span>
                  <div className="relative">
                    <input type="number" min={0} step={10} value={s.anticipo || ""} placeholder="0" onFocus={(e) => e.target.select()}
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { anticipo: v, precio: v + s.resto }); }}
                      className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  </div>
                </label>
                <span className="pb-2.5 text-slate-300">+</span>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{t("Al finalizar")}</span>
                  <div className="relative">
                    <input type="number" min={0} step={10} value={s.resto || ""} placeholder="0" onFocus={(e) => e.target.select()}
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); update(s.id, { resto: v, precio: s.anticipo + v }); }}
                      className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
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
                  <div className="relative">
                    <input type="number" min={0} max={100} step={0.1} value={s.porcentaje || ""} placeholder="0" onFocus={(e) => e.target.select()}
                      onChange={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); update(s.id, { porcentaje: v || undefined }); }}
                      className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
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
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 disabled:bg-slate-50 disabled:text-slate-400" />
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
                      className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
                    />
                    <div className="relative">
                      <input type="number" min={0} step={0.01} value={sup.importe || ""} placeholder="0" onFocus={(e) => e.target.select()}
                        onChange={(e) => update(s.id, { suplidos: (s.suplidos ?? []).map((x, j) => j === i ? { ...x, importe: Math.max(0, Number(e.target.value) || 0) } : x) })}
                        className="w-24 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-xs tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100" />
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
                  className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
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
                className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-1.5 text-xs leading-relaxed outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
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
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {enCatalogo.length > 0 && (
          <select
            value=""
            onChange={(e) => { addDelCatalogo(e.target.value); }}
            // min-w-0 + w-full: sin ellos el ancho intrínseco del select (su opción más
            // larga) desborda la tarjeta en móvil y ensancha TODA la sección.
            className="min-w-0 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 outline-none transition-colors hover:border-aproba-400 focus:border-aproba-500 sm:w-auto sm:flex-1"
          >
            <option value="" disabled>{t("Añadir trámite del catálogo…")}</option>
            {enCatalogo.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        )}
        <button
          onClick={() => setServicios((list) => [...list, newServicio()])}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700 sm:flex-1"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("Nuevo servicio")}
        </button>
      </div>

      {/* ── Packs de servicios ── */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">{t("Packs de servicios")}</p>
          <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${packsSave === "idle" ? "opacity-0" : "opacity-100"} ${packsSave === "error" ? "text-red-600" : "text-aproba-700"}`}>
            {packsSave === "saving" && t("Guardando…")}
            {packsSave === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
            {packsSave === "error" && t("Error al guardar — reintenta")}
          </span>
        </div>
        <p className="mb-4 text-xs text-slate-500">{t("Agrupa varios servicios bajo un nombre y un precio «desde…». El cliente lo ve como una oferta única en su portal.")}</p>
        {packsSave === "error" && packsError && (
          <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{packsError}</p>
        )}

        <div className="space-y-3">
          {packs.map((p) => (
            <div key={p.id} ref={dndPacks.registrar(p.id)} className={`rounded-xl border border-aproba-100 bg-aproba-50/40 p-4 ${dndPacks.dragId === p.id ? "relative z-10 opacity-95 shadow-lg ring-2 ring-aproba-300" : ""}`}>
              <div className="flex items-center gap-2 sm:gap-3">
                <AsaArrastre
                  arrastrando={dndPacks.dragId === p.id}
                  onMover={(d) => moverPack(p.id, d)}
                  label={p.nombre || t("Pack")}
                  {...dndPacks.asa(p.id)}
                />
                <input
                  value={p.nombre}
                  placeholder={t("Nombre del pack (p. ej. Pack Compraventa)")}
                  onChange={(e) => updatePack(p.id, { nombre: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
                />
                <button
                  onClick={() => setPacks((list) => list.filter((x) => x.id !== p.id))}
                  aria-label={t("Eliminar pack")}
                  className="shrink-0 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
              <input
                value={p.desc}
                placeholder={t("Descripción breve (la verá el cliente)")}
                onChange={(e) => updatePack(p.id, { desc: e.target.value })}
                className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-aproba-500 focus:bg-white"
              />

              <div className="mt-3 border-t border-aproba-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Servicios incluidos")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {servicios.map((s) => {
                    const dentro = p.servicioIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={dentro}
                        onClick={() => updatePack(p.id, { servicioIds: dentro ? p.servicioIds.filter((x) => x !== s.id) : [...p.servicioIds, s.id] })}
                        className={`rounded-md border px-2.5 py-1 text-xs transition ${dentro ? "border-aproba-300 bg-aproba-600 font-semibold text-white" : "border-slate-200 bg-white text-slate-600 hover:border-aproba-300"}`}
                      >
                        {s.label || t("Sin nombre")}
                      </button>
                    );
                  })}
                </div>
                {p.servicioIds.length === 0 && <p className="mt-1.5 text-xs font-medium text-amber-600">⚠️ {t("Elige al menos un servicio para que el pack aparezca en el portal.")}</p>}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-aproba-100 pt-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{t("Precio «desde» (sin IVA)")}</span>
                  <div className="relative">
                    <input type="number" min={0} step={10} value={p.precioDesde || ""} placeholder="0" onFocus={(e) => e.target.select()}
                      disabled={Boolean(p.precioOculto)}
                      onChange={(e) => updatePack(p.id, { precioDesde: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-28 rounded-md border border-slate-200 py-1.5 pl-2.5 pr-7 text-sm tabular-nums outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100 disabled:bg-slate-50 disabled:text-slate-400" />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-2 pb-1.5">
                  <input type="checkbox" checked={Boolean(p.precioOculto)} onChange={(e) => updatePack(p.id, { precioOculto: e.target.checked || undefined })}
                    className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                  <span className="text-xs font-medium text-slate-600">{t("Precio a consultar")}</span>
                </label>
                {!p.precioOculto && p.precioDesde > 0 && (() => {
                  // El «desde» es un reclamo: al elegir el pack, el cliente paga la SUMA
                  // de los servicios incluidos. Si no coinciden lo avisamos aquí — si no,
                  // el cliente ve «desde 900 €» y la pantalla de pago le pide 1.210 €.
                  const suma = p.servicioIds.reduce((a, id) => a + (servicios.find((x) => x.id === id)?.precio ?? 0), 0);
                  const desalineado = suma > 0 && Math.abs(suma - p.precioDesde) >= 1;
                  return (
                    <span className={`pb-2 text-xs ${desalineado ? "font-medium text-amber-600" : "text-slate-400"}`}>
                      {t("El cliente verá")} «{t("desde")} {eur(p.precioDesde)}»
                      {desalineado && <> · {t("pagará")} {eur(suma)} ({t("suma de los servicios, sin IVA")})</>}
                    </span>
                  );
                })()}
              </div>

              <div className="mt-3">{campoTema(p.categoria, (v) => updatePack(p.id, { categoria: v }))}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPacks((list) => [...list, newPack()])}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-aproba-400 hover:text-aproba-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("Crear pack")}
        </button>
      </div>
    </div>
  );
}
