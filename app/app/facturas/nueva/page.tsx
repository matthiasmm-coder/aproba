"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Factura } from "@/lib/facturas";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { facturacionAvanzada } from "@/lib/planes";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { fmtFechaCorta } from "@/lib/tramites";
import { FacturaView, type Emisor } from "@/components/factura-view";
import { FacturaEditor, GENERICOS, type ServicioTarifa, type FacturaPayload } from "@/components/factura-editor";
import { useT } from "@/components/lang-provider";

export default function NuevaFactura() {
  const t = useT();
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [plan, setPlan] = useState<string>("STARTER");
  const [numero, setNumero] = useState("");
  const [cargando, setCargando] = useState(true);
  const avanzada = facturacionAvanzada(plan);

  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [emisor, setEmisor] = useState<Emisor>({ nombre: "Mi despacho", nif: null });

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

      // Próximo número de la serie anual (editable en modo avanzado).
      try {
        const year = new Date().getFullYear();
        const { data: last } = await sb.from("Factura").select("numero").like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle();
        const lastN = last ? Number(last.numero.split("-")[1]) : 0;
        setNumero(`${year}-${String(lastN + 1).padStart(4, "0")}`);
      } catch { /* el número se genera al crear */ }

      setCargando(false);
    })();
  }, []);

  async function handleSubmit(p: FacturaPayload) {
    setCreando(true);
    setError(null);
    try {
      const sb = createSupabaseBrowser();
      const { data: mem, error: e1 } = await sb.from("Membership").select("workspaceId").limit(1).maybeSingle();
      if (e1 || !mem) throw new Error(e1?.message ?? t("No se encontró tu despacho."));

      const hoy = new Date();
      const vence = new Date(hoy.getTime() + 30 * 24 * 3600 * 1000);
      const year = hoy.getFullYear();

      // Avanzada: respeta el nº editado. Simple: numera secuencialmente (legal).
      let num = p.numero?.trim() ?? "";
      if (!num) {
        const { data: last, error: e2 } = await sb.from("Factura").select("numero").like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle();
        if (e2) throw new Error(e2.message);
        num = `${year}-${String((last ? Number(last.numero.split("-")[1]) : 0) + 1).padStart(4, "0")}`;
      }

      const row: Record<string, unknown> = {
        id: crypto.randomUUID(), workspaceId: mem.workspaceId, numero: num,
        clienteNombre: p.cliente, concepto: p.concepto,
        baseImponible: p.baseImponible, iva: p.iva, total: p.total, estado: "EMITIDA",
        fechaEmision: hoy.toISOString(), fechaVencimiento: vence.toISOString(),
        ...(p.avanzada ? { lineas: p.lineas, suplidos: p.suplidos, notas: p.notas } : {}),
      };

      const { error: e3 } = await sb.from("Factura").insert(row);
      if (e3) throw new Error(
        /duplicate|unique/i.test(e3.message) ? t("Ese número de factura ya existe. Cámbialo.")
        : /lineas|suplidos|schema cache|column/i.test(e3.message) ? t("Falta la migración de facturas avanzadas: ejecuta supabase/factura-lineas.sql.")
        : e3.message,
      );
      setFactura({
        id: row.id as string, numero: num, cliente: p.cliente, concepto: p.concepto, base: p.baseImponible,
        estado: "EMITIDA", fecha: fmtFechaCorta(hoy.toISOString()) ?? "", vence: fmtFechaCorta(vence.toISOString()),
        lineas: p.avanzada ? p.lineas : undefined, suplidos: p.avanzada ? p.suplidos : undefined, notas: p.avanzada ? p.notas : undefined,
      });
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

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/facturas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Facturas")}
      </Link>
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nueva factura")}</h1>
      <p className="mt-1 text-slate-500">
        {avanzada
          ? t("Añade líneas de honorarios y suplidos (tasas y gastos, sin IVA). El IVA solo se aplica a los honorarios.")
          : t("Elige el servicio y la tarifa se rellena sola. El IVA y el total se calculan solos.")}
      </p>

      {cargando ? (
        <div className="mt-6 space-y-3">
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (
        <div className="mt-6">
          <FacturaEditor
            avanzada={avanzada}
            servicios={servicios}
            inicial={{ numero }}
            onSubmit={handleSubmit}
            submitLabel={t("Crear factura")}
            busy={creando}
            error={error}
          />
        </div>
      )}
    </div>
  );
}
