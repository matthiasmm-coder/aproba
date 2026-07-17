"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { aplicarDescuento, descuentoValido, type Descuento } from "@/lib/multi-servicio";
import { useT } from "@/components/lang-provider";

// Cerrar el precio ANTES de enviar el enlace (pedido de Juan: packs familiares, varios
// servicios juntos). Mismo gesto que en la ficha pero sin salir del alta: elegir los
// servicios y aplicar el descuento acordado, viendo lo que verá el cliente.
//
// NO añade lógica de precio: reutiliza las rutas de siempre — POST .../servicio y
// PATCH .../descuento — y el helper aplicarDescuento para la previsualización. El
// descuento es del EXPEDIENTE (uno solo, sobre el total de los servicios elegidos),
// como en la ficha, el portal, la hoja de encargo y las facturas.

type Svc = { id: string; label: string; anticipo: number; resto: number };

export function AjustarPresupuestoModal({ expedienteId, nMiembros = 1, onClose }: {
  expedienteId: string;
  nMiembros?: number; // familia: el servicio se tarifica POR MIEMBRO (igual que el portal)
  onClose: (guardado?: boolean) => void;
}) {
  const t = useT();
  const [servicios, setServicios] = useState<Svc[] | null>(null);
  const [clave, setClave] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [tipo, setTipo] = useState<Descuento["tipo"]>("PORCENTAJE");
  const [valor, setValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try {
        // Misma lista que ve el cliente en su enlace: activos y con nombre.
        const { data, error: e } = await sb.from("ServicioConfig").select("clave, label, anticipo, resto, active").order("orden");
        if (e) throw e;
        const rows = (data ?? []) as { clave: string; label: string | null; anticipo: number | string | null; resto: number | string | null; active: boolean | null }[];
        setServicios(rows
          .filter((s) => s.active !== false && (s.label ?? "").trim())
          .map((s) => ({ id: s.clave, label: (s.label ?? "").trim(), anticipo: Number(s.anticipo) || 0, resto: Number(s.resto) || 0 })));
      } catch {
        setServicios([]);
        setError(t("No se han podido cargar tus servicios. Ajústalo desde la ficha del expediente."));
        return;
      }
      // Estado REAL del expediente: al reabrir («Volver a editar») el formulario debe
      // mostrar lo ya guardado. Si arrancara vacío, guardar borraría el descuento y los
      // servicios en silencio. Sin fila o sin permiso: se queda vacío (no inventa nada).
      try {
        const { data: exp } = await sb.from("Expediente").select("servicioClave, serviciosExtra, descuento").eq("id", expedienteId).maybeSingle();
        const e = exp as { servicioClave?: string | null; serviciosExtra?: string[] | null; descuento?: unknown } | null;
        if (!e) return;
        if (e.servicioClave) setClave(e.servicioClave);
        if (Array.isArray(e.serviciosExtra)) setExtras(e.serviciosExtra.filter(Boolean));
        const d = descuentoValido(e.descuento);
        if (d) { setTipo(d.tipo); setValor(d.valor); setMotivo(d.motivo ?? ""); }
      } catch { /* sin estado previo: formulario vacío */ }
    })();
  }, [t, expedienteId]);

  const elegidos = useMemo(
    () => (servicios ?? []).filter((s) => s.id === clave || extras.includes(s.id)),
    [servicios, clave, extras],
  );
  const tarifaUnit = useMemo(() => ({
    anticipo: elegidos.reduce((a, s) => a + s.anticipo, 0),
    resto: elegidos.reduce((a, s) => a + s.resto, 0),
  }), [elegidos]);
  const descuento: Descuento | null = valor > 0 ? { tipo, valor } : null;
  const reb = aplicarDescuento(tarifaUnit, nMiembros, descuento);
  // Lo que pagará el cliente: los DOS cobros con su IVA (igual que la tarjeta del portal).
  const totalBruto = r2(totalDe(r2(tarifaUnit.anticipo * Math.max(1, nMiembros))) + totalDe(r2(tarifaUnit.resto * Math.max(1, nMiembros))));
  const totalReb = r2(totalDe(reb.anticipo) + totalDe(reb.resto));

  const svcElegido = (servicios ?? []).find((s) => s.id === clave);
  const disponibles = (servicios ?? []).filter((s) => s.id !== clave && !extras.includes(s.id));
  const labelDe = (id: string) => (servicios ?? []).find((s) => s.id === id)?.label ?? id;
  const puedeGuardar = Boolean(svcElegido) && !busy && !(tipo === "PORCENTAJE" && valor > 100);

  async function guardar() {
    if (!svcElegido) { setError(t("Elige un servicio.")); return; }
    setBusy(true); setError(null);
    try {
      // 1) Servicios primero: el descuento se calcula sobre su tarifa (y su guarda de
      //    tasas la necesita). 2) Descuento después. Rutas existentes, sin tocar.
      const rS = await fetch(`/api/expedientes/${expedienteId}/servicio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, label: svcElegido.label, extras: extras.filter((x) => x !== clave) }),
      });
      const dS = await rS.json().catch(() => ({}));
      if (!rS.ok) throw new Error(dS.error ?? t("No se pudo cambiar el servicio."));

      const rD = await fetch(`/api/expedientes/${expedienteId}/descuento`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descuento: descuento ? { ...descuento, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) } : null }),
      });
      const dD = await rD.json().catch(() => ({}));
      if (!rD.ok) throw new Error(dD.error ?? t("No se pudo guardar el descuento."));
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el presupuesto."));
    } finally { setBusy(false); }
  }

  const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{t("Ajustar servicio y descuento")}</h2>
          <button onClick={() => onClose()} disabled={busy} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">{t("Cierra aquí el precio antes de enviar el enlace: el cliente verá ya el presupuesto con el descuento aplicado.")}</p>

        {servicios === null ? (
          <p className="py-8 text-center text-sm text-slate-400">{t("Cargando…")}</p>
        ) : (
          <>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Servicio principal")}</label>
            <select
              aria-label={t("Servicio del expediente")}
              value={clave}
              onChange={(e) => { const v = e.target.value; setClave(v); setExtras((xs) => xs.filter((x) => x !== v)); }}
              className={`mt-1.5 w-full ${inp}`}
            >
              <option value="" disabled>{t("Elige un servicio…")}</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>{s.label} · {eur(totalDe(r2(s.anticipo + s.resto)))}</option>
              ))}
            </select>

            {(extras.length > 0 || disponibles.length > 0) && (
              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Servicios adicionales")}</label>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {extras.map((x) => (
                    <span key={x} className="inline-flex items-center overflow-hidden rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                      <span className="py-1 pl-2.5 pr-1">{labelDe(x)}</span>
                      <button onClick={() => setExtras((xs) => xs.filter((y) => y !== x))} disabled={busy} aria-label={`${t("Quitar")} ${labelDe(x)}`} className="self-stretch px-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                        <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  {disponibles.length > 0 && (
                    <select value="" disabled={busy} aria-label={t("Añadir servicio adicional")} onChange={(e) => { if (e.target.value) setExtras((xs) => [...xs, e.target.value]); }} className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 outline-none focus:border-aproba-600 disabled:opacity-50">
                      <option value="">{t("+ Añadir servicio…")}</option>
                      {disponibles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Descuento")}</label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {(["PORCENTAJE", "IMPORTE"] as const).map((tp) => (
                    <button key={tp} onClick={() => setTipo(tp)} className={`px-3 py-2 text-xs font-medium transition ${tipo === tp ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
                      {tp === "PORCENTAJE" ? "%" : "€"}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    type="number" min={0} max={tipo === "PORCENTAJE" ? 100 : undefined} step={tipo === "PORCENTAJE" ? 1 : 5}
                    value={valor || ""} placeholder="0" aria-label={t("Valor del descuento")} onFocus={(e) => e.target.select()}
                    onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))}
                    className={`w-24 pr-7 tabular-nums ${inp}`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{tipo === "PORCENTAJE" ? "%" : "€"}</span>
                </div>
                <input
                  value={motivo} maxLength={120} placeholder={t("Motivo (p. ej. pack familiar) — opcional")}
                  aria-label={t("Motivo del descuento")} onChange={(e) => setMotivo(e.target.value)}
                  className={`min-w-0 flex-1 ${inp}`}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">{t("Rebaja los honorarios de todos los servicios elegidos. Las tasas y suplidos no se descuentan.")}</p>
            </div>

            {/* Lo que verá el cliente — con IVA, como en su enlace. */}
            {tarifaUnit.anticipo + tarifaUnit.resto > 0 && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-cream-50/60 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-500">{t("El cliente pagará")}</span>
                  <span className="text-right">
                    {reb.rebaja > 0 && <span className="mr-1.5 text-sm text-slate-400 line-through">{eur(totalBruto)}</span>}
                    <span className="text-lg font-bold text-slate-900">{eur(totalReb)}</span>
                    <span className="ml-1 text-xs text-slate-400">{t("IVA inc.")}</span>
                  </span>
                </div>
                <p className="mt-1 text-right text-xs text-slate-400">
                  {reb.anticipo > 0 && reb.resto > 0
                    ? `${eur(totalDe(reb.anticipo))} ${t("al empezar")} + ${eur(totalDe(reb.resto))} ${t("al finalizar")}`
                    : t("en un solo pago")}
                  {nMiembros > 1 ? ` · ${nMiembros} ${t("miembros")}` : ""}
                </p>
                {reb.rebaja > 0 && (
                  <p className="mt-1.5 text-right text-xs font-semibold text-aproba-700">
                    {t("Descuento")} −{eur(r2(totalBruto - totalReb))} {t("IVA inc.")}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={() => onClose()} disabled={busy} className="text-sm text-slate-500 transition hover:text-slate-800">{t("Cancelar")}</button>
          <button onClick={guardar} disabled={!puedeGuardar} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
            {busy ? "…" : t("Guardar presupuesto")}
          </button>
        </div>
      </div>
    </div>
  );
}
