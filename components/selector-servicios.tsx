"use client";

import { useEffect, useMemo, useState } from "react";
import { agruparPorTema, fmtPct, packPct, type Pack } from "@/lib/servicios";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { useT } from "@/components/lang-provider";

// SELECTOR DE SERVICIOS Y PACKS del gestor (18/09/2026, petición de Luis y Marta llevada
// a la pantalla de alta por Matthias): se elige AQUÍ, al crear el expediente, no en la
// pantalla siguiente. Controlado por el padre; no escribe nada en base — quien lo monta
// decide cuándo guardar (POST /api/expedientes/[id]/servicio).
//
// Un pack es UNA elección (sus servicios entran juntos y su descuento se aplica); los
// servicios sueltos se marcan uno a uno. Misma regla que el portal del cliente.

export type Svc = { id: string; label: string; precio: number; anticipo: number; resto: number; categoria?: string; porcentaje?: number };
export type SeleccionServicios = { claves: string[]; packId: string | null; bloquear: boolean };
export const SELECCION_VACIA: SeleccionServicios = { claves: [], packId: null, bloquear: true };

export function SelectorServicios({ valor, onChange, nMiembros = 1, oficinaId = null }: {
  valor: SeleccionServicios;
  onChange: (v: SeleccionServicios) => void;
  nMiembros?: number;
  oficinaId?: string | null;
}) {
  const t = useT();
  const [servicios, setServicios] = useState<Svc[] | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try {
        // Catálogo de la SEDE si la tiene propio; si no, el común del despacho.
        // ⚠️ ServicioConfig NO tiene columna `precio` (el precio es anticipo + resto):
        // pedirla hacía fallar el SELECT entero y la pantalla decía «no tienes servicios».
        const cols = "clave, label, active, anticipo, resto, categoria, porcentaje, oficinaId, servicioIds";
        let res = await sb.from("ServicioConfig").select(cols).order("orden");
        if (res.error) res = await sb.from("ServicioConfig").select("clave, label, active, anticipo, resto, categoria, porcentaje, oficinaId").order("orden") as typeof res;
        if (res.error) res = await sb.from("ServicioConfig").select("clave, label, active, anticipo, resto, categoria").order("orden") as typeof res;
        if (res.error) res = await sb.from("ServicioConfig").select("clave, label, active, anticipo, resto").order("orden") as typeof res;
        if (res.error) throw res.error;
        const filas = (res.data ?? []) as { clave: string; label: string | null; active: boolean | null; anticipo: number | string | null; resto: number | string | null; categoria?: string | null; porcentaje?: number | null; oficinaId?: string | null; servicioIds?: string[] | null }[];
        const deSede = oficinaId ? filas.filter((s) => s.oficinaId === oficinaId) : [];
        const usar = deSede.length ? deSede : filas.filter((s) => !s.oficinaId);
        setServicios(usar
          // Un ítem con servicios dentro es un PACK: se elige abajo, en su lista.
          .filter((s) => s.active !== false && (s.label ?? "").trim() && !(s.servicioIds ?? []).length)
          .map((s) => ({
            id: s.clave, label: (s.label ?? "").trim(),
            precio: (Number(s.anticipo) || 0) + (Number(s.resto) || 0),
            anticipo: Number(s.anticipo) || 0, resto: Number(s.resto) || 0,
            categoria: s.categoria ?? undefined, porcentaje: Number(s.porcentaje) > 0 ? Number(s.porcentaje) : undefined,
          })));
      } catch { setServicios([]); }
      try {
        const { data: mem } = await sb.from("Membership").select("workspaceId").limit(1).maybeSingle();
        if (mem?.workspaceId) {
          const { data: ws } = await sb.from("Workspace").select("packs").eq("id", mem.workspaceId).maybeSingle();
          const raw = (ws as { packs?: unknown } | null)?.packs;
          const lista = Array.isArray(raw) ? raw : [];
          setPacks(lista.filter((p): p is Pack => Boolean(p && typeof p === "object" && (p as Pack).id && (p as Pack).nombre)));
        }
      } catch { /* sin packs */ }
    })();
  }, [oficinaId]);

  const svDe = useMemo(() => (ids: string[]) => (servicios ?? []).filter((s) => ids.includes(s.id)), [servicios]);
  const packSel = packs.find((p) => p.id === valor.packId) ?? null;
  const dePack = packSel ? svDe(packSel.servicioIds ?? []).map((s) => s.id) : [];
  const elegidos = useMemo(() => {
    const todos = new Set([...dePack, ...valor.claves]);
    return (servicios ?? []).filter((s) => todos.has(s.id));
  }, [servicios, valor.claves, dePack]);

  // Precio que verá el cliente: los dos cobros con su IVA (misma cuenta que el portal),
  // con el descuento del pack si lo hay. Informativo: el importe real lo calcula el servidor.
  const anticipo = r2(elegidos.reduce((a, s) => a + s.anticipo, 0) * Math.max(1, nMiembros));
  const resto = r2(elegidos.reduce((a, s) => a + s.resto, 0) * Math.max(1, nMiembros));
  const bruto = r2(totalDe(anticipo) + totalDe(resto));
  const pct = packSel ? packPct(packSel) : 0;
  const total = pct > 0 ? r2(bruto * (1 - pct / 100)) : bruto;
  const conPorcentaje = elegidos.some((s) => s.porcentaje);

  const toggleServicio = (id: string) => {
    if (dePack.includes(id)) return; // ya viene en el pack: marcarlo no cambiaría nada
    const claves = valor.claves.includes(id) ? valor.claves.filter((c) => c !== id) : [...valor.claves, id];
    onChange({ ...valor, claves });
  };
  const togglePack = (pk: Pack) => onChange({ ...valor, packId: valor.packId === pk.id ? null : pk.id });

  const nElegidos = elegidos.length;
  const grupos = agruparPorTema(servicios ?? []);
  const conTema = grupos.some((g) => g.clave);
  const packsVivos = packs.filter((pk) => svDe(pk.servicioIds ?? []).length > 0);

  const tarjeta = (s: Svc) => {
    const enPack = dePack.includes(s.id);
    const marcado = enPack || valor.claves.includes(s.id);
    return (
      <button
        key={s.id} type="button" onClick={() => toggleServicio(s.id)} aria-pressed={marcado} aria-disabled={enPack || undefined}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          enPack ? "cursor-default border-slate-200 bg-slate-50" : marcado ? "border-aproba-500 bg-aproba-50/60" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{s.label}</span>
          <span className="block text-xs text-slate-400">
            {eur(totalDe(r2(s.anticipo + s.resto)))}{s.porcentaje ? ` + ${fmtPct(s.porcentaje)} %` : ""}
            {enPack ? ` · ${t("incluido en el pack")}` : ""}
          </span>
        </span>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${marcado ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>
          {marcado && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
        </span>
      </button>
    );
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-sm font-semibold text-slate-800">{t("Servicios del expediente")}</span>
          {/* Sin nada elegido, ninguna segunda línea: el bloque ya se explica solo. */}
          {nElegidos > 0 && (
            <span className="block text-xs text-slate-500">
              {`${elegidos.map((s) => s.label).join(" + ")} · ${conPorcentaje ? `${eur(total)} +` : eur(total)}${pct > 0 ? ` (−${fmtPct(pct)} %)` : ""}`}
            </span>
          )}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {abierto && (
        servicios === null ? (
          <p className="mt-3 text-xs text-slate-400">{t("Cargando…")}</p>
        ) : servicios.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">{t("No tienes servicios configurados todavía (Ajustes → Servicios).")}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {packsVivos.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Packs")}</p>
                {packsVivos.map((pk) => {
                  const dentro = valor.packId === pk.id;
                  const svs = svDe(pk.servicioIds ?? []);
                  const suma = r2(svs.reduce((a, s) => a + totalDe(r2(s.anticipo + s.resto)), 0));
                  const p = packPct(pk);
                  return (
                    <button
                      key={pk.id} type="button" onClick={() => togglePack(pk)} aria-pressed={dentro}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${dentro ? "border-aproba-500 bg-aproba-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{pk.nombre}</span>
                        <span className="block truncate text-xs text-slate-400">{svs.map((s) => s.label).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        {p > 0 && <span className="mr-1.5 text-slate-400 line-through">{eur(suma)}</span>}
                        <span className="font-semibold text-slate-700">{eur(p > 0 ? r2(suma * (1 - p / 100)) : suma)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {conTema ? (
              grupos.map((g) => (
                <div key={g.clave || "otros"} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.titulo || t("Otros trámites")}</p>
                  {(g.items as Svc[]).map(tarjeta)}
                </div>
              ))
            ) : (
              <div className="space-y-2">{servicios.map(tarjeta)}</div>
            )}

            {nElegidos > 0 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-cream-50/60 px-3 py-2.5">
                <input type="checkbox" checked={valor.bloquear} onChange={(e) => onChange({ ...valor, bloquear: e.target.checked })} className="mt-0.5 accent-aproba-600" />
                <span className="text-xs leading-relaxed text-slate-600">
                  <b className="font-semibold text-slate-800">{t("Dejarlo fijado en el enlace del cliente")}</b>
                  <span className="block">{t("Lo verá marcado y no podrá quitarlo. Sí podrá añadir otros servicios de tu catálogo.")}</span>
                </span>
              </label>
            )}
          </div>
        )
      )}
    </div>
  );
}

// Normaliza la selección a lo que espera la API: principal + extras (orden del catálogo).
export function clavesDeSeleccion(v: SeleccionServicios, packs: Pack[] = []): string[] {
  const pk = packs.find((p) => p.id === v.packId);
  return [...new Set([...(pk?.servicioIds ?? []), ...v.claves])];
}
