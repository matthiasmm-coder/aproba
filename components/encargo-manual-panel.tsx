"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { aplicarDescuento, type Descuento } from "@/lib/multi-servicio";
import { useT } from "@/components/lang-provider";

// ALTA EN MODO MANUAL (22/08, pedido de Matthias): sin portal, ES EL GESTOR quien fija
// el encargo — elige los servicios del catálogo de Ajustes, decide el cobro inicial y
// valida viendo exactamente lo que recibirá el cliente: UN email con los servicios, la
// factura si la hay, y la hoja de encargo + el mandato adjuntos para firmar.
//
// No inventa lógica de precio ni de correo: reutiliza las rutas de siempre —
// POST /servicio, PATCH /descuento, POST /pagos (con sinEmail) — y una ruta nueva que
// compone el correo combinado (/encargo-manual). Mismos helpers de precio que el modal
// «Ajustar presupuesto» (aplicarDescuento): lo que ve aquí es lo que se factura.

type Svc = { id: string; label: string; anticipo: number; resto: number; porcentaje?: number };
type Paso = "form" | "confirmar" | "hecho";

export function EncargoManualPanel({ expedienteId, nMiembros = 1 }: {
  expedienteId: string;
  nMiembros?: number; // familia: la tarifa es POR MIEMBRO, como en el portal
}) {
  const t = useT();
  const [paso, setPaso] = useState<Paso>("form");
  const [servicios, setServicios] = useState<Svc[] | null>(null);
  const [clave, setClave] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [tipoDesc, setTipoDesc] = useState<Descuento["tipo"]>("PORCENTAJE");
  const [valorDesc, setValorDesc] = useState(0);
  const [habiaDescuento, setHabiaDescuento] = useState(false); // para no «retirar» un descuento que nunca existió
  const [cobrar, setCobrar] = useState(true);
  const [baseCobro, setBaseCobro] = useState<number | null>(null); // null = automático
  const [email, setEmail] = useState("");
  const [hojaActiva, setHojaActiva] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [fase, setFase] = useState(""); // qué se está haciendo durante el envío
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ email: string; enviado: string; adjuntos: boolean; factura: { numero: string; total: number } | null } | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try {
        // Mismo catálogo que ve el cliente en su enlace: activos y con nombre.
        let res = await sb.from("ServicioConfig").select("clave, label, anticipo, resto, active, porcentaje").order("orden");
        if (res.error) res = await sb.from("ServicioConfig").select("clave, label, anticipo, resto, active").order("orden") as typeof res;
        if (res.error) throw res.error;
        const rows = (res.data ?? []) as { clave: string; label: string | null; anticipo: number | string | null; resto: number | string | null; active: boolean | null; porcentaje?: number | string | null }[];
        setServicios(rows
          .filter((s) => s.active !== false && (s.label ?? "").trim())
          .map((s) => ({ id: s.clave, label: (s.label ?? "").trim(), anticipo: Number(s.anticipo) || 0, resto: Number(s.resto) || 0, porcentaje: Number(s.porcentaje) > 0 ? Number(s.porcentaje) : undefined })));
      } catch {
        setServicios([]);
        setError(t("No se han podido cargar tus servicios. Configúralos en Ajustes."));
      }
      // Email actual del cliente + estado real del expediente (por si se reabre el alta).
      try {
        const { data } = await sb.from("Expediente").select("servicioClave, serviciosExtra, descuento, cliente:Cliente(email)").eq("id", expedienteId).maybeSingle();
        const e = data as { servicioClave?: string | null; serviciosExtra?: string[] | null; descuento?: unknown; cliente?: { email?: string | null } | { email?: string | null }[] | null } | null;
        if (e?.servicioClave) setClave(e.servicioClave);
        if (Array.isArray(e?.serviciosExtra)) setExtras(e.serviciosExtra.filter(Boolean));
        if (e?.descuento) setHabiaDescuento(true);
        const cli = Array.isArray(e?.cliente) ? e?.cliente[0] : e?.cliente;
        if (cli?.email) setEmail(cli.email);
      } catch { /* sin estado previo */ }
      try {
        const { data: ws } = await sb.from("Workspace").select("hojaEncargoActiva").limit(1).maybeSingle();
        setHojaActiva(Boolean((ws as { hojaEncargoActiva?: boolean } | null)?.hojaEncargoActiva));
      } catch { setHojaActiva(null); /* columna sin migrar: se sabrá al enviar */ }
    })();
  }, [t, expedienteId]);

  const elegidos = useMemo(() => (servicios ?? []).filter((s) => s.id === clave || extras.includes(s.id)), [servicios, clave, extras]);
  const descuento: Descuento | null = valorDesc > 0 ? { tipo: tipoDesc, valor: valorDesc } : null;
  const reb = aplicarDescuento(
    { anticipo: elegidos.reduce((a, s) => a + s.anticipo, 0), resto: elegidos.reduce((a, s) => a + s.resto, 0) },
    nMiembros, descuento,
  );
  const anticipoAuto = reb.anticipo; // base sin IVA, ya ×miembros y con descuento
  const base = baseCobro ?? anticipoAuto;
  const svcElegido = (servicios ?? []).find((s) => s.id === clave);
  const disponibles = (servicios ?? []).filter((s) => s.id !== clave && !extras.includes(s.id));
  const labelDe = (id: string) => (servicios ?? []).find((s) => s.id === id)?.label ?? id;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const cobroActivo = cobrar && base > 0;

  const inp = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 sm:text-sm";

  async function enviar() {
    if (busy || !svcElegido) return;
    setBusy(true); setError(null);
    try {
      // 1) Servicios — misma ruta que la ficha y el modal de presupuesto.
      setFase(t("Guardando los servicios…"));
      const rS = await fetch(`/api/expedientes/${expedienteId}/servicio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, label: svcElegido.label, extras: extras.filter((x) => x !== clave) }),
      });
      const dS = await rS.json().catch(() => ({}));
      if (!rS.ok) throw new Error(dS.error ?? t("No se pudo guardar el servicio."));

      // 2) Descuento — solo si hay algo que decir: fijar uno, o retirar el que había.
      // (PATCH null sobre un expediente sin descuento registraba «Descuento retirado»
      // en cada alta: ruido en el historial.)
      if (descuento || habiaDescuento) {
        const rD = await fetch(`/api/expedientes/${expedienteId}/descuento`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descuento }),
        });
        if (!rD.ok) { const d = await rD.json().catch(() => ({})); throw new Error(d.error ?? t("No se pudo guardar el descuento.")); }
      }

      // 3) Factura inicial (sin email propio: irá dentro del correo combinado).
      let facturaId: string | undefined;
      if (cobroActivo) {
        setFase(t("Emitiendo la factura…"));
        const propio = baseCobro !== null && r2(baseCobro) !== r2(anticipoAuto);
        const rP = await fetch("/api/pagos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expedienteId, momento: "ANTICIPO", sinEmail: true,
            // Importe personalizado por el gestor → factura editada (el servidor recalcula
            // IVA y totales; sin ×miembros: el gestor fija el importe que quiere).
            ...(propio ? { factura: { baseImponible: r2(base) } } : {}),
          }),
        });
        const dP = await rP.json().catch(() => ({}));
        if (!rP.ok) throw new Error(dP.error ?? t("No se pudo emitir la factura."));
        facturaId = dP.facturaId;
      }

      // 4) El correo combinado (servicios + factura + hoja de encargo y mandato).
      setFase(t("Enviando el email al cliente…"));
      const rE = await fetch(`/api/expedientes/${expedienteId}/encargo-manual`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), ...(facturaId ? { facturaId } : {}) }),
      });
      const dE = await rE.json().catch(() => ({}));
      if (!rE.ok) throw new Error(dE.error ?? t("No se pudo enviar el email al cliente."));
      setResultado({ email: dE.email, enviado: dE.enviado, adjuntos: Boolean(dE.adjuntos), factura: dE.factura ?? null });
      setPaso("hecho");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar el envío."));
      setPaso("confirmar");
    } finally { setBusy(false); setFase(""); }
  }

  /* ── Hecho ──────────────────────────────────────────────────────────────── */
  if (paso === "hecho" && resultado) {
    return (
      <div className="mt-4 rounded-2xl border border-aproba-200 bg-aproba-50/40 p-5 text-center">
        <p className="text-sm font-semibold text-aproba-800">✓ {t("Encargo enviado a")} {resultado.email}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {elegidos.map((s) => s.label).join(" + ")}
          {resultado.factura ? ` · ${t("factura")} ${resultado.factura.numero} (${eur(resultado.factura.total)})` : ""}
          {resultado.adjuntos ? ` · ${t("hoja de encargo y mandato adjuntos")}` : ""}
        </p>
        {resultado.enviado === "SIMULADO" && (
          <p className="mt-2 text-[11px] text-amber-700">{t("Entorno sin envío real: el email se ha simulado.")}</p>
        )}
        {!resultado.adjuntos && (
          <p className="mt-2 text-[11px] text-slate-400">{t("El email salió sin la hoja de encargo (función desactivada en Ajustes o servicio sin configurar).")}</p>
        )}
        <Link href={`/app/expedientes/${expedienteId}`} className="mt-4 inline-block rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">
          {t("Abrir el expediente")}
        </Link>
      </div>
    );
  }

  /* ── Confirmación: lo que va a recibir el cliente ───────────────────────── */
  if (paso === "confirmar") {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-left">
        <p className="text-sm font-semibold text-slate-800">{t("Esto es lo que recibirá el cliente")}</p>
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-cream-50/60 p-4 text-sm">
          <p><span className="text-slate-400">{t("Para")}: </span><span className="font-medium text-slate-800">{email.trim()}</span></p>
          <p>
            <span className="text-slate-400">{t("Servicios")}: </span>
            <span className="font-medium text-slate-800">{elegidos.map((s) => s.label).join(" + ")}</span>
            {nMiembros > 1 && <span className="text-slate-400"> · {nMiembros} {t("miembros")}</span>}
          </p>
          <p>
            <span className="text-slate-400">{t("Cobro inicial")}: </span>
            {cobroActivo
              ? <span className="font-medium text-slate-800">{t("factura de")} {eur(totalDe(r2(base)))} <span className="text-slate-400">{t("IVA inc.")} · {t("IBAN y pago con tarjeta en el email")}</span></span>
              : <span className="text-slate-500">{t("sin cobro inicial")}</span>}
          </p>
          <p>
            <span className="text-slate-400">{t("Para firmar")}: </span>
            {hojaActiva === false
              ? <span className="text-amber-700">{t("la hoja de encargo está desactivada en Ajustes — el email irá sin ella")}</span>
              : (
                <span className="font-medium text-slate-800">
                  <a href={`/api/expedientes/${expedienteId}/encargo?doc=hoja`} target="_blank" rel="noopener noreferrer" className="text-aproba-700 underline">{t("hoja de encargo")}</a>
                  {" + "}
                  <a href={`/api/expedientes/${expedienteId}/encargo?doc=mandato`} target="_blank" rel="noopener noreferrer" className="text-aproba-700 underline">{t("mandato")}</a>
                  <span className="text-slate-400"> ({t("adjuntos en PDF — ábrelos para revisarlos")})</span>
                </span>
              )}
          </p>
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button onClick={() => { setPaso("form"); setError(null); }} disabled={busy} className="text-sm text-slate-500 transition hover:text-slate-800">{t("Volver")}</button>
          <button onClick={enviar} disabled={busy} className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
            {busy ? (fase || "…") : t("Confirmar y enviar al cliente")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Formulario: servicios + cobro + email ──────────────────────────────── */
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-left">
      <p className="text-sm font-semibold text-slate-800">{t("Define el encargo")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("Elige los servicios del catálogo, decide el cobro inicial y envíaselo todo al cliente en un solo email (factura + hoja de encargo y mandato para firmar).")}</p>

      {servicios === null ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("Cargando…")}</p>
      ) : (
        <>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Servicio principal")}</label>
          <select value={clave} aria-label={t("Servicio del expediente")} onChange={(e) => { const v = e.target.value; setClave(v); setExtras((xs) => xs.filter((x) => x !== v)); setBaseCobro(null); }} className={`mt-1.5 w-full ${inp}`}>
            <option value="" disabled>{t("Elige un servicio…")}</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.label} · {eur(totalDe(r2(s.anticipo + s.resto)))}{s.porcentaje ? ` + ${String(s.porcentaje).replace(".", ",")} %` : ""}</option>
            ))}
          </select>

          {(extras.length > 0 || disponibles.length > 0) && (
            <div className="mt-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Servicios adicionales")}</label>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {extras.map((x) => (
                  <span key={x} className="inline-flex items-center overflow-hidden rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                    <span className="py-1 pl-2.5 pr-1">{labelDe(x)}</span>
                    <button onClick={() => { setExtras((xs) => xs.filter((y) => y !== x)); setBaseCobro(null); }} aria-label={`${t("Quitar")} ${labelDe(x)}`} className="self-stretch px-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                      <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
                {disponibles.length > 0 && (
                  <select value="" aria-label={t("Añadir servicio adicional")} onChange={(e) => { if (e.target.value) { setExtras((xs) => [...xs, e.target.value]); setBaseCobro(null); } }} className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-[16px] sm:text-xs text-slate-500 outline-none focus:border-aproba-600">
                    <option value="">{t("+ Añadir servicio…")}</option>
                    {disponibles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          <div className="mt-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Descuento")}</label>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                {(["PORCENTAJE", "IMPORTE"] as const).map((tp) => (
                  <button key={tp} onClick={() => { setTipoDesc(tp); setBaseCobro(null); }} className={`px-3 py-2 text-xs font-medium transition ${tipoDesc === tp ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
                    {tp === "PORCENTAJE" ? "%" : "€"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input type="number" min={0} max={tipoDesc === "PORCENTAJE" ? 100 : undefined} step={tipoDesc === "PORCENTAJE" ? 1 : 5} value={valorDesc || ""} placeholder="0" aria-label={t("Valor del descuento")} onFocus={(e) => e.target.select()} onChange={(e) => { setValorDesc(Math.max(0, Number(e.target.value) || 0)); setBaseCobro(null); }} className={`w-24 pr-7 tabular-nums ${inp}`} />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{tipoDesc === "PORCENTAJE" ? "%" : "€"}</span>
              </div>
            </div>
          </div>

          {/* Cobro inicial: el anticipo de la tarifa (editable). Sin anticipo configurado
              no hay nada que cobrar ahora — el resto se factura desde la ficha. */}
          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Cobro inicial")}</label>
            <div className="mt-1.5 space-y-1.5">
              <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${cobrar && anticipoAuto + (baseCobro ?? 0) > 0 ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200"}`}>
                <input type="radio" name="cobro" checked={cobrar} onChange={() => setCobrar(true)} className="accent-aproba-600" />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-slate-700">{t("Cobrar ahora")}</span>
                  <span className="relative">
                    <input
                      type="number" min={0} step={10} value={base || ""} placeholder="0"
                      aria-label={t("Base imponible del cobro inicial")}
                      onClick={(e) => { e.preventDefault(); setCobrar(true); }}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setBaseCobro(Math.max(0, Number(e.target.value) || 0))}
                      className={`w-28 pr-6 tabular-nums ${inp}`}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {base > 0 ? `${eur(totalDe(r2(base)))} ${t("IVA inc.")}` : t("sin IVA")}
                    {baseCobro !== null && r2(baseCobro) !== r2(anticipoAuto) ? ` · ${t("personalizado")}` : anticipoAuto > 0 ? ` · ${t("anticipo de la tarifa")}` : ""}
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${!cobrar ? "border-aproba-300 bg-aproba-50/50" : "border-slate-200"}`}>
                <input type="radio" name="cobro" checked={!cobrar} onChange={() => setCobrar(false)} className="accent-aproba-600" />
                <span className="text-slate-700">{t("Sin cobro inicial")} <span className="text-xs text-slate-400">({t("facturarás desde la ficha")})</span></span>
              </label>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Email del cliente")}</label>
            <input
              type="email" value={email} placeholder="cliente@ejemplo.com" aria-label={t("Email del cliente")}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1.5 w-full ${inp}`}
            />
            {!emailOk && email.trim() !== "" && <p className="mt-1 text-[11px] text-amber-700">{t("Ese email no parece válido.")}</p>}
            <p className="mt-1 text-[11px] text-slate-400">{t("Se guardará en la ficha del cliente.")}</p>
          </div>
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex items-center justify-between gap-3">
        <Link href={`/app/expedientes/${expedienteId}`} className="text-xs text-slate-400 transition hover:text-slate-600">
          {t("Saltar por ahora y abrir el expediente")}
        </Link>
        <button
          onClick={() => { setError(null); setPaso("confirmar"); }}
          disabled={!svcElegido || !emailOk || (cobrar && base <= 0)}
          className="rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {t("Revisar y enviar")}
        </button>
      </div>
    </div>
  );
}
