"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { aplicarDescuento, tarifaAsignada, type Descuento, type ServiciosAsignacion } from "@/lib/multi-servicio";
import { conTarifasPropias, MAX_NOTA, VALIDEZ_PRESUPUESTO_DIAS, type PresupuestoOpciones, type TarifasPropias } from "@/lib/tarifas-propias";
import { useT } from "@/components/lang-provider";
import { useScrollBloqueado } from "@/lib/scroll-bloqueado";

// «GENERAR PRESUPUESTO» (pedido por Juan, 26/09/2026): antes de descargar o enviar el
// presupuesto, una ventana para personalizarlo — el precio de ESTE expediente (por
// servicio, al inicio y al finalizar), el descuento, la validez y unas observaciones.
// El precio del servicio en Ajustes no cambia; el de este expediente pasa también a la
// hoja de encargo, al enlace del cliente y a las facturas (lib/tarifas-propias).
//
// NO calcula dinero por su cuenta: la vista previa usa los mismos helpers que el servidor
// (conTarifasPropias → tarifaAsignada → aplicarDescuento), y guarda por las rutas de siempre.

export type ServicioPresupuesto = { id: string; label: string; anticipo: number; resto: number; precioOculto?: boolean; porcentaje?: number };

type Props = {
  expedienteId: string;
  referencia: string;
  servicios: ServicioPresupuesto[]; // los del expediente, con el precio del CATÁLOGO
  tarifasPropias: TarifasPropias | null;
  asignacion: ServiciosAsignacion | null;
  nMiembros: number;
  descuento: Descuento | null;
  opciones: PresupuestoOpciones | null;
  suplidosTotal: number; // tasas previstas (sin IVA), solo informativo
};

const num = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? r2(n) : NaN; };
const txt = (n: number) => (n > 0 ? String(n).replace(".", ",") : "");

export function PresupuestoBoton(props: Props) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="inline-block py-2 font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600 sm:py-0">
        {t("generar presupuesto")}
      </button>
      {abierto && <PresupuestoModal {...props} onClose={() => setAbierto(false)} />}
    </>
  );
}

function PresupuestoModal({ expedienteId, referencia, servicios, tarifasPropias, asignacion, nMiembros, descuento, opciones, suplidosTotal, onClose }: Props & { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  useScrollBloqueado();

  // Precio de partida de cada servicio: el propio del expediente si lo hay; si no, el del catálogo.
  const [precios, setPrecios] = useState<Record<string, { anticipo: string; resto: string }>>(() =>
    Object.fromEntries(servicios.map((s) => {
      const p = tarifasPropias?.[s.id] ?? { anticipo: s.anticipo, resto: s.resto };
      return [s.id, { anticipo: txt(p.anticipo), resto: txt(p.resto) }];
    })),
  );
  const [tipo, setTipo] = useState<Descuento["tipo"]>(descuento?.tipo ?? "PORCENTAJE");
  const [valor, setValor] = useState(descuento?.valor ?? 0);
  const [motivo, setMotivo] = useState(descuento?.motivo ?? "");
  const [validez, setValidez] = useState(String(opciones?.validezDias ?? VALIDEZ_PRESUPUESTO_DIAS));
  const [nota, setNota] = useState(opciones?.nota ?? "");
  const [busy, setBusy] = useState<"" | "pdf" | "email">("");
  const [error, setError] = useState<string | null>(null);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  // Precio propio = lo que difiere del catálogo (lo que coincide sigue al catálogo).
  const { tarifas, invalido } = useMemo(() => {
    const out: TarifasPropias = {};
    let mal = false;
    for (const s of servicios) {
      const v = precios[s.id] ?? { anticipo: "", resto: "" };
      const a = v.anticipo.trim() ? num(v.anticipo) : 0;
      const r = v.resto.trim() ? num(v.resto) : 0;
      if (Number.isNaN(a) || Number.isNaN(r) || a > 100_000 || r > 100_000) { mal = true; continue; }
      if (a !== r2(s.anticipo) || r !== r2(s.resto) || s.precioOculto) out[s.id] = { anticipo: a, resto: r };
    }
    return { tarifas: Object.keys(out).length ? out : null, invalido: mal };
  }, [precios, servicios]);

  const descuentoNuevo: Descuento | null = valor > 0 ? { tipo, valor, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) } : null;
  const svsPrecio = conTarifasPropias(servicios, tarifas);
  const tarifa = tarifaAsignada(svsPrecio, asignacion, nMiembros);
  const reb = aplicarDescuento(tarifa, 1, descuentoNuevo);
  const totalBruto = totalDe(r2(tarifa.anticipo + tarifa.resto));
  const totalReb = r2(totalDe(reb.anticipo) + totalDe(reb.resto));
  const dias = Math.round(Number(validez));
  const diasOk = Number.isFinite(dias) && dias >= 1 && dias <= 365;
  const descuentoCambio = JSON.stringify(descuentoNuevo) !== JSON.stringify(descuento ?? null);
  const puede = !busy && !invalido && diasOk && !(tipo === "PORCENTAJE" && valor > 100);

  async function guardar(): Promise<boolean> {
    setError(null);
    try {
      const opcionesNuevas = dias === VALIDEZ_PRESUPUESTO_DIAS && !nota.trim() ? null : { validezDias: dias, nota: nota.trim() };
      const r = await fetch(`/api/expedientes/${expedienteId}/presupuesto`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarifas, opciones: opcionesNuevas }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar el presupuesto."));
      // El descuento después del precio: su guarda de tasas mira ya el precio nuevo.
      if (descuentoCambio) {
        const d = await fetch(`/api/expedientes/${expedienteId}/descuento`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descuento: descuentoNuevo }),
        });
        const jd = await d.json().catch(() => ({}));
        if (!d.ok) throw new Error(jd.error ?? t("No se pudo guardar el descuento."));
      }
      router.refresh(); // la ficha (cobro, descuento) enseña ya el precio nuevo
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el presupuesto."));
      return false;
    }
  }

  async function descargar() {
    setBusy("pdf");
    if (await guardar()) {
      // Descarga (Content-Disposition: attachment): no abre pestaña ni sale de la ficha.
      const a = document.createElement("a");
      a.href = `/api/expedientes/${expedienteId}/encargo?doc=presupuesto`;
      document.body.appendChild(a); a.click(); a.remove();
      onClose();
    }
    setBusy("");
  }

  async function enviar() {
    setBusy("email");
    if (await guardar()) {
      try {
        const r = await fetch(`/api/expedientes/${expedienteId}/enviar-doc?doc=presupuesto`, { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? t("No se pudo enviar el documento."));
        setEnviadoA(typeof j.para === "string" && j.para ? j.para : t("el cliente"));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("No se pudo enviar el documento."));
      }
    }
    setBusy("");
  }

  const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm";
  const lbl = "text-xs font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("Presupuesto")} className="mt-4 w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-left shadow-xl sm:my-8 sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">{t("Presupuesto")} <span className="font-normal text-slate-400">· {referencia}</span></h2>
          <button onClick={onClose} disabled={Boolean(busy)} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">{t("Ajusta el precio de este expediente antes de generar el presupuesto. El precio del servicio en Ajustes no cambia.")}</p>

        {enviadoA ? (
          <div className="rounded-xl border border-aproba-200 bg-aproba-50/60 p-4 text-sm text-slate-700">
            <p className="font-semibold text-aproba-800">{t("Presupuesto enviado ✓")}</p>
            <p className="mt-1">{t("Lo ha recibido {email} con el PDF adjunto.").replace("{email}", enviadoA)}</p>
            <div className="mt-4 text-right">
              <button onClick={onClose} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Cerrar")}</button>
            </div>
          </div>
        ) : (
          <>
            <p className={lbl}>{t("Honorarios de este expediente")}{nMiembros > 1 ? ` · ${t("por persona")}` : ""}</p>
            <div className="mt-2 space-y-3">
              {servicios.map((s) => {
                const v = precios[s.id] ?? { anticipo: "", resto: "" };
                const propio = Boolean(tarifas?.[s.id]);
                const catalogo = s.precioOculto ? t("a consultar en tu catálogo")
                  : s.anticipo + s.resto > 0 ? `${t("catálogo")}: ${eur(r2(s.anticipo + s.resto))} + ${t("IVA")}` : t("sin precio en tu catálogo");
                const set = (campo: "anticipo" | "resto", x: string) => setPrecios((p) => ({ ...p, [s.id]: { ...v, [campo]: x } }));
                return (
                  <div key={s.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{catalogo}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["anticipo", "resto"] as const).map((campo) => (
                        <label key={campo} className="block">
                          <span className="text-[11px] text-slate-500">{campo === "anticipo" ? t("Al inicio") : t("Al finalizar")} <span className="text-slate-400">({t("sin IVA")})</span></span>
                          <span className="relative mt-1 block">
                            <input
                              inputMode="decimal" value={v[campo]} placeholder="0" onFocus={(e) => e.target.select()}
                              onChange={(e) => set(campo, e.target.value.replace(/[^0-9.,]/g, ""))}
                              aria-label={`${s.label} · ${campo === "anticipo" ? t("Al inicio") : t("Al finalizar")}`}
                              className={`w-full pr-7 tabular-nums ${inp}`}
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {propio && !s.precioOculto && s.anticipo + s.resto > 0 && (
                      <button type="button" onClick={() => setPrecios((p) => ({ ...p, [s.id]: { anticipo: txt(s.anticipo), resto: txt(s.resto) } }))} className="mt-2 text-[11px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700">
                        {t("Volver al precio del catálogo")}
                      </button>
                    )}
                    {s.porcentaje ? <p className="mt-1.5 text-[11px] text-slate-400">{t("Además, {pct} % variable, como en tu catálogo.").replace("{pct}", String(s.porcentaje).replace(".", ","))}</p> : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <p className={lbl}>{t("Descuento")}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                  {(["PORCENTAJE", "IMPORTE"] as const).map((tp) => (
                    <button key={tp} type="button" onClick={() => setTipo(tp)} className={`px-3 py-2 text-xs font-medium transition ${tipo === tp ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
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
                <input value={motivo} maxLength={120} placeholder={t("Motivo (p. ej. pack familiar) — opcional")} aria-label={t("Motivo del descuento")} onChange={(e) => setMotivo(e.target.value)} className={`min-w-0 flex-1 ${inp}`} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[7rem_1fr]">
              <label className="block">
                <span className={lbl}>{t("Validez")}</span>
                <span className="relative mt-1.5 block">
                  <input type="number" min={1} max={365} value={validez} onChange={(e) => setValidez(e.target.value)} aria-label={t("Validez del presupuesto en días")} className={`w-full pr-10 tabular-nums ${inp}`} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{t("días")}</span>
                </span>
              </label>
              <label className="block">
                <span className={lbl}>{t("Observaciones")} <span className="font-normal normal-case tracking-normal text-slate-400">— {t("opcional")}</span></span>
                <textarea value={nota} maxLength={MAX_NOTA} rows={2} onChange={(e) => setNota(e.target.value)} placeholder={t("P. ej.: precio para los dos cónyuges; no incluye traducciones")} className={`mt-1.5 w-full resize-y ${inp}`} />
              </label>
            </div>

            {/* Lo que verá el cliente — con IVA, como en su enlace y en su factura. */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-cream-50/60 p-4">
              {tarifa.anticipo + tarifa.resto > 0 ? (
                <>
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
                  {suplidosTotal > 0 && <p className="mt-1 text-right text-xs text-slate-400">+ {eur(r2(suplidosTotal))} {t("de tasas previstas (sin IVA)")}</p>}
                </>
              ) : (
                <p className="text-sm text-slate-500">{t("Sin honorarios: el presupuesto dirá «según presupuesto». Indica un importe para que lo muestre.")}</p>
              )}
              <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-400">{t("Este precio vale también para la hoja de encargo, el enlace del cliente y las facturas de este expediente.")}</p>
            </div>

            {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {invalido && <p role="alert" className="mt-3 text-xs text-red-600">{t("Revisa los importes: solo números, de 0 a 100.000 €.")}</p>}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={onClose} disabled={Boolean(busy)} className="mr-auto text-sm text-slate-500 transition hover:text-slate-800">{t("Cancelar")}</button>
              <button type="button" onClick={enviar} disabled={!puede} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">
                {busy === "email" ? t("enviando…") : t("Enviar por email")}
              </button>
              <button type="button" onClick={descargar} disabled={!puede} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
                {busy === "pdf" ? "…" : t("Descargar PDF")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
