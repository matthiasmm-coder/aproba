"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eur, ivaDe, totalDe, IVA, type Factura } from "@/lib/facturas";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { fmtFechaCorta } from "@/lib/tramites";
import { FacturaView } from "@/components/factura-view";
import { useT } from "@/components/lang-provider";

const GENERICOS = ["Asesoramiento extranjería", "Otro concepto"];
type ServicioTarifa = { id: string; label: string; precio: number };

export default function NuevaFactura() {
  const t = useT();
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [cliente, setCliente] = useState("");
  const [concepto, setConcepto] = useState("");
  const [base, setBase] = useState("");
  const [autollenado, setAutollenado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState<Factura | null>(null);

  // Charger los servicios activos (tarifas réelles du workspace) et préselectionner le premier.
  useEffect(() => {
    (async () => {
      let activos: ServicioTarifa[] = [];
      try {
        const supabase = createSupabaseBrowser();
        const { data } = await supabase
          .from("ServicioConfig")
          .select("clave, label, anticipo, resto")
          .eq("active", true)
          .order("orden");
        if (data?.length) {
          activos = data.map((r) => ({ id: r.clave, label: r.label, precio: Number(r.anticipo) + Number(r.resto) }));
        }
      } catch {
        /* fallback ci-dessous */
      }
      if (!activos.length) {
        activos = DEFAULT_SERVICIOS.filter((s) => s.active).map((s) => ({ id: s.id, label: s.label, precio: s.precio }));
      }
      setServicios(activos);
      if (activos.length) {
        setConcepto(activos[0].label || GENERICOS[0]);
        setBase(activos[0].precio ? String(activos[0].precio) : "");
        setAutollenado(Boolean(activos[0].precio));
      } else {
        setConcepto(GENERICOS[0]);
      }
    })();
  }, []);

  const baseNum = Number(base) || 0;
  const canCrear = cliente.trim() && baseNum > 0 && !creando;

  function elegirConcepto(label: string) {
    setConcepto(label);
    const sv = servicios.find((s) => s.label === label);
    if (sv && sv.precio) {
      setBase(String(sv.precio));
      setAutollenado(true);
    } else {
      setAutollenado(false);
    }
  }

  // Crée la factura dans Supabase (sous RLS) avec numérotation séquentielle.
  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowser();

      const { data: mem, error: e1 } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
      if (e1 || !mem) throw new Error(e1?.message ?? t("No se encontró tu despacho."));

      // Prochain numéro de la série annuelle (numérotation légale séquentielle).
      const year = new Date().getFullYear();
      const { data: last, error: e2 } = await supabase
        .from("Factura")
        .select("numero")
        .like("numero", `${year}-%`)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e2) throw new Error(e2.message);
      const lastN = last ? Number(last.numero.split("-")[1]) : 0;
      const numero = `${year}-${String(lastN + 1).padStart(4, "0")}`;

      const hoy = new Date();
      const vence = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
      const row = {
        id: crypto.randomUUID(),
        workspaceId: mem.workspaceId,
        numero,
        clienteNombre: cliente.trim(),
        concepto,
        baseImponible: baseNum,
        iva: ivaDe(baseNum),
        total: totalDe(baseNum),
        estado: "EMITIDA",
        fechaEmision: hoy.toISOString(),
        fechaVencimiento: vence.toISOString(),
      };
      const { error: e3 } = await supabase.from("Factura").insert(row);
      if (e3) throw new Error(e3.message);

      setFactura({
        id: row.id,
        numero,
        cliente: row.clienteNombre,
        concepto,
        base: baseNum,
        estado: "EMITIDA",
        fecha: fmtFechaCorta(row.fechaEmision) ?? "",
        vence: fmtFechaCorta(row.fechaVencimiento),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo crear la factura."));
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
        <FacturaView f={factura} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/app/facturas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Facturas")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nueva factura")}</h1>
      <p className="mt-1 text-slate-500">{t("Elige el servicio y la tarifa se rellena sola. El IVA y el total se calculan solos.")}</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">{t("Cliente")}</label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder={t("Nombre del cliente")} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">{t("Concepto")}</label>
          <select value={concepto} onChange={(e) => elegirConcepto(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100">
            {servicios.length > 0 && (
              <optgroup label={t("Tus servicios")}>
                {servicios.map((s) => (
                  <option key={s.id} value={s.label}>{s.label}{s.precio ? ` · ${eur(s.precio)}` : ""}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={t("Otros")}>
              {GENERICOS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="flex items-center justify-between text-sm font-medium text-slate-700">
            <span>{t("Base imponible (€)")}</span>
            {autollenado && <span className="text-xs font-normal text-aproba-700">{t("↩ tarifa del servicio · puedes ajustarla")}</span>}
          </label>
          <input type="number" value={base} onChange={(e) => { setBase(e.target.value); setAutollenado(false); }} placeholder="0" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
        </div>

        {/* Aperçu totaux */}
        <div className="rounded-xl border border-slate-200 bg-cream-50 p-4">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>{t("Base imponible")}</span><span>{eur(baseNum)}</span></div>
            <div className="flex justify-between text-slate-500"><span>{t("IVA")} ({Math.round(IVA * 100)} %)</span><span>{eur(ivaDe(baseNum))}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900"><span>{t("Total")}</span><span>{eur(totalDe(baseNum))}</span></div>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <button onClick={crear} disabled={!canCrear} className="mt-6 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400">
        {creando ? t("Creando…") : t("Crear factura")}
      </button>
    </div>
  );
}
