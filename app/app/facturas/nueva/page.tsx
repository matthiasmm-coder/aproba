"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eur, ivaDe, totalDe, totalesFactura, IVA, type Factura, type LineaFactura, type Suplido } from "@/lib/facturas";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { facturacionAvanzada } from "@/lib/planes";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { fmtFechaCorta } from "@/lib/tramites";
import { FacturaView, type Emisor } from "@/components/factura-view";
import { useT } from "@/components/lang-provider";

const GENERICOS = ["Asesoramiento extranjería", "Otro concepto"];
type ServicioTarifa = { id: string; label: string; precio: number };
const TASA_790 = 38.28; // tasa 790-012 (residencia temporal) — suplido típico

export default function NuevaFactura() {
  const t = useT();
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [plan, setPlan] = useState<string>("STARTER");
  const avanzada = facturacionAvanzada(plan);

  // Común
  const [cliente, setCliente] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [emisor, setEmisor] = useState<Emisor>({ nombre: "Mi despacho", nif: null });

  // Simple (Starter)
  const [concepto, setConcepto] = useState("");
  const [base, setBase] = useState("");
  const [autollenado, setAutollenado] = useState(false);

  // Avanzada (Pro/Business)
  const [numero, setNumero] = useState("");
  const [lineas, setLineas] = useState<LineaFactura[]>([{ concepto: "", base: 0 }]);
  const [suplidos, setSuplidos] = useState<Suplido[]>([]);
  const [notas, setNotas] = useState("");

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try {
        const sel = (cols: string) => sb.from("Membership").select(`Workspace(${cols})`).limit(1).maybeSingle();
        let mr = await sel("nombre, nif, domicilio, emailFacturacion, logoUrl"); // logoUrl: columna nueva (4b)
        if (mr.error) mr = await sel("nombre, nif, domicilio, emailFacturacion");
        const wsRaw = (mr.data as { Workspace?: Record<string, string | null> | Record<string, string | null>[] } | null)?.Workspace;
        const ws = Array.isArray(wsRaw) ? wsRaw[0] : wsRaw;
        if (ws) setEmisor({ nombre: ws.nombre ?? "Mi despacho", nif: ws.nif ?? null, domicilio: ws.domicilio ?? null, email: ws.emailFacturacion ?? null, logo: ws.logoUrl ?? null });
      } catch { /* fallback */ }
      try {
        const { data: sub } = await sb.from("Subscription").select("plan").limit(1).maybeSingle();
        if (sub?.plan) setPlan(sub.plan as string);
      } catch { /* STARTER por defecto */ }

      let activos: ServicioTarifa[] = [];
      try {
        const { data } = await sb.from("ServicioConfig").select("clave, label, anticipo, resto").eq("active", true).order("orden");
        if (data?.length) activos = data.map((r) => ({ id: r.clave, label: r.label, precio: Number(r.anticipo) + Number(r.resto) }));
      } catch { /* fallback */ }
      if (!activos.length) activos = DEFAULT_SERVICIOS.filter((s) => s.active).map((s) => ({ id: s.id, label: s.label, precio: s.precio }));
      setServicios(activos);

      const primero = activos[0];
      setConcepto(primero?.label || GENERICOS[0]);
      setBase(primero?.precio ? String(primero.precio) : "");
      setAutollenado(Boolean(primero?.precio));
      setLineas([{ concepto: primero?.label || "", base: primero?.precio || 0 }]);

      // Próximo número de la serie anual (editable en modo avanzado).
      try {
        const year = new Date().getFullYear();
        const { data: last } = await sb.from("Factura").select("numero").like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle();
        const lastN = last ? Number(last.numero.split("-")[1]) : 0;
        setNumero(`${year}-${String(lastN + 1).padStart(4, "0")}`);
      } catch { /* el número se genera al crear */ }
    })();
  }, []);

  const baseNum = Number(base) || 0;
  const tot = totalesFactura(lineas, suplidos);
  const canCrear = avanzada
    ? Boolean(cliente.trim()) && tot.base > 0 && Boolean(numero.trim()) && !creando
    : Boolean(cliente.trim()) && baseNum > 0 && !creando;

  function elegirConcepto(label: string) {
    setConcepto(label);
    const sv = servicios.find((s) => s.label === label);
    if (sv?.precio) { setBase(String(sv.precio)); setAutollenado(true); } else setAutollenado(false);
  }

  const setLinea = (i: number, patch: Partial<LineaFactura>) => setLineas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setSup = (i: number, patch: Partial<Suplido>) => setSuplidos((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const sb = createSupabaseBrowser();
      const { data: mem, error: e1 } = await sb.from("Membership").select("workspaceId").limit(1).maybeSingle();
      if (e1 || !mem) throw new Error(e1?.message ?? t("No se encontró tu despacho."));

      const hoy = new Date();
      const vence = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
      const year = hoy.getFullYear();

      let row: Record<string, unknown>;
      let preview: Factura;

      if (avanzada) {
        const limpiasL = lineas.filter((l) => l.concepto.trim() && Number(l.base) > 0);
        const limpiasS = suplidos.filter((s) => s.concepto.trim() && Number(s.importe) > 0);
        if (!limpiasL.length) throw new Error(t("Añade al menos una línea de honorarios."));
        const { base: b, iva, total } = totalesFactura(limpiasL, limpiasS);
        const num = numero.trim();
        const conceptoResumen = limpiasL.map((l) => l.concepto).join(" · ").slice(0, 200);
        row = {
          id: crypto.randomUUID(), workspaceId: mem.workspaceId, numero: num,
          clienteNombre: cliente.trim(), concepto: conceptoResumen,
          baseImponible: b, iva, total, estado: "EMITIDA",
          lineas: limpiasL, suplidos: limpiasS, notas: notas.trim() || null,
          fechaEmision: hoy.toISOString(), fechaVencimiento: vence.toISOString(),
        };
        preview = { id: row.id as string, numero: num, cliente: cliente.trim(), concepto: conceptoResumen, base: b, estado: "EMITIDA", fecha: fmtFechaCorta(hoy.toISOString()) ?? "", vence: fmtFechaCorta(vence.toISOString()), lineas: limpiasL, suplidos: limpiasS, notas: notas.trim() || null };
      } else {
        // Serie anual secuencial (numeración legal).
        const { data: last, error: e2 } = await sb.from("Factura").select("numero").like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle();
        if (e2) throw new Error(e2.message);
        const num = `${year}-${String((last ? Number(last.numero.split("-")[1]) : 0) + 1).padStart(4, "0")}`;
        row = {
          id: crypto.randomUUID(), workspaceId: mem.workspaceId, numero: num,
          clienteNombre: cliente.trim(), concepto, baseImponible: baseNum, iva: ivaDe(baseNum), total: totalDe(baseNum),
          estado: "EMITIDA", fechaEmision: hoy.toISOString(), fechaVencimiento: vence.toISOString(),
        };
        preview = { id: row.id as string, numero: num, cliente: cliente.trim(), concepto, base: baseNum, estado: "EMITIDA", fecha: fmtFechaCorta(hoy.toISOString()) ?? "", vence: fmtFechaCorta(vence.toISOString()) };
      }

      const { error: e3 } = await sb.from("Factura").insert(row);
      if (e3) throw new Error(
        /duplicate|unique/i.test(e3.message) ? t("Ese número de factura ya existe. Cámbialo.")
        : /lineas|suplidos|schema cache|column/i.test(e3.message) ? t("Falta la migración de facturas avanzadas: ejecuta supabase/factura-lineas.sql.")
        : e3.message,
      );
      setFactura(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo crear la factura. Vuelve a intentarlo."));
    } finally {
      setCreando(false);
    }
  }

  if (factura) {
    return (
      <div>
        <div className="mx-auto mb-5 max-w-2xl rounded-xl border border-aproba-200 bg-aproba-50 px-4 py-3 text-sm text-aproba-700 print:hidden">
          ✓ {t("Factura")} <span className="font-mono font-semibold">{factura.numero}</span> {t("creada y guardada.")}{" "}
          <Link href="/app/facturas" className="font-semibold underline">{t("Ver todas →")}</Link>
        </div>
        <FacturaView f={factura} emisor={emisor} />
      </div>
    );
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/facturas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Facturas")}
      </Link>
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nueva factura")}</h1>

      {!avanzada ? (
        <>
          <p className="mt-1 text-slate-500">{t("Elige el servicio y la tarifa se rellena sola. El IVA y el total se calculan solos.")}</p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">{t("Cliente")}</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del cliente")} className={`mt-1.5 ${inp}`} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t("Concepto")}</label>
              <select value={concepto} onChange={(e) => elegirConcepto(e.target.value)} className={`mt-1.5 ${inp} bg-white`}>
                {servicios.length > 0 && <optgroup label={t("Tus servicios")}>{servicios.map((s) => <option key={s.id} value={s.label}>{s.label}{s.precio ? ` · ${eur(s.precio)}` : ""}</option>)}</optgroup>}
                <optgroup label={t("Otros")}>{GENERICOS.map((c) => <option key={c} value={c}>{t(c)}</option>)}</optgroup>
              </select>
            </div>
            <div>
              <label className="flex items-center justify-between text-sm font-medium text-slate-700">
                <span>{t("Base imponible (€)")}</span>
                {autollenado && <span className="text-xs font-normal text-aproba-700">{t("↩ tarifa del servicio · puedes ajustarla")}</span>}
              </label>
              <input type="number" value={base} onChange={(e) => { setBase(e.target.value); setAutollenado(false); }} placeholder="0" className={`mt-1.5 ${inp}`} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm">
              <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(baseNum)}</span></div>
              <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(ivaDe(baseNum))}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(totalDe(baseNum))}</span></div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
              <span>{t("Con Pro o Business puedes añadir varias líneas, suplidos (tasas, sin IVA), nº y notas personalizados.")}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-slate-500">{t("Añade líneas de honorarios y suplidos (tasas y gastos, sin IVA). El IVA solo se aplica a los honorarios.")}</p>
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">{t("Cliente")}</label>
                <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del cliente")} className={`mt-1.5 ${inp}`} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t("Nº de factura")}</label>
                <input value={numero} onChange={(e) => setNumero(e.target.value)} className={`mt-1.5 ${inp} font-mono`} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Honorarios (con IVA)")}</p>
              <div className="space-y-2">
                {lineas.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input list="conceptos-srv" value={l.concepto} onChange={(e) => setLinea(i, { concepto: e.target.value })} placeholder={t("Concepto")} className={`${inp} flex-1`} />
                    <div className="relative w-32 shrink-0">
                      <input type="number" value={l.base || ""} onChange={(e) => setLinea(i, { base: Number(e.target.value) || 0 })} placeholder="0" className={`${inp} pr-7 text-right tabular-nums`} />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                    </div>
                    <button onClick={() => setLineas((x) => x.filter((_, j) => j !== i))} disabled={lineas.length === 1} aria-label={t("Quitar")} className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <datalist id="conceptos-srv">{servicios.map((s) => <option key={s.id} value={s.label} />)}</datalist>
              <button onClick={() => setLineas((x) => [...x, { concepto: "", base: 0 }])} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">+ {t("Añadir línea")}</button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Suplidos (sin IVA: tasas, gastos…)")}</p>
                <button onClick={() => setSuplidos((x) => [...x, { concepto: "Tasa 790-012", importe: TASA_790 }])} className="text-xs font-semibold text-aproba-700 hover:underline">+ {t("Tasa 790")}</button>
              </div>
              {suplidos.length === 0 ? (
                <p className="text-xs text-slate-400">{t("Sin suplidos. Añade tasas o gastos pagados por cuenta del cliente (no llevan IVA).")}</p>
              ) : (
                <div className="space-y-2">
                  {suplidos.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={s.concepto} onChange={(e) => setSup(i, { concepto: e.target.value })} placeholder={t("Concepto (tasa, registro…)")} className={`${inp} flex-1`} />
                      <div className="relative w-32 shrink-0">
                        <input type="number" value={s.importe || ""} onChange={(e) => setSup(i, { importe: Number(e.target.value) || 0 })} placeholder="0" className={`${inp} pr-7 text-right tabular-nums`} />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                      </div>
                      <button onClick={() => setSuplidos((x) => x.filter((_, j) => j !== i))} aria-label={t("Quitar")} className="shrink-0 rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setSuplidos((x) => [...x, { concepto: "", importe: 0 }])} className="mt-2 text-xs font-semibold text-aproba-700 hover:underline">+ {t("Añadir suplido")}</button>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">{t("Notas (opcional)")}</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder={t("Condiciones, forma de pago, observaciones…")} className={`mt-1.5 ${inp} resize-none`} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm">
              <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(tot.base)}</span></div>
              <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(tot.iva)}</span></div>
              {tot.suplidosTotal > 0 && <div className="flex justify-between text-slate-500"><span>{t("Suplidos (sin IVA)")}</span><span>{eur(tot.suplidosTotal)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(tot.total)}</span></div>
            </div>
          </div>
        </>
      )}

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button onClick={crear} disabled={!canCrear} className="mt-6 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
        {creando ? t("Creando…") : t("Crear factura")}
      </button>
    </div>
  );
}
