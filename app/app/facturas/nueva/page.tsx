"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Factura, datosFiscalesManuales } from "@/lib/facturas";
import { cargarClientesFiscales, type ClienteFiscalOpcion } from "@/lib/clientes-fiscales";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { facturacionAvanzada } from "@/lib/planes";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { FacturaView, type Emisor } from "@/components/factura-view";
import { FacturaEditor, GENERICOS, type ServicioTarifa, type FacturaPayload } from "@/components/factura-editor";
import { useT } from "@/components/lang-provider";
import { SelectorSedeCreacion } from "@/components/selector-sede-creacion";
import { contextoDeTrabajoBrowser, leerCookieSede } from "@/lib/oficinas-browser";

export default function NuevaFactura() {
  const t = useT();
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [plan, setPlan] = useState<string>("STARTER");
  const [numero, setNumero] = useState("");
  // Prefill del cliente (?cliente=…) — p. ej. desde el botón "+ Nueva" de la ficha del cliente.
  const [clientePrefill] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("cliente") ?? "" : ""));
  const [clienteIdPrefill] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("clienteId") ?? "" : ""));
  // Clientes y empresas con NIF y domicilio (24/09/2026): la factura manual los congela.
  const [opcionesFiscales, setOpcionesFiscales] = useState<ClienteFiscalOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const avanzada = facturacionAvanzada(plan);

  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // «Todas» es vista de LECTURA: la factura manual necesita una oficina concreta
  // (su serie depende de ella). Pastilla activa → prerrellena; en «Todas» → obliga.
  const [sedeCreacion, setSedeCreacion] = useState<{ sede: string | null; requerida: boolean }>({ sede: null, requerida: false });
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
      setOpcionesFiscales(await cargarClientesFiscales());

      // Próximo número de la serie anual (editable en modo avanzado). Lo da el
      // servidor: la numeración tiene un único punto de verdad (lib/factura-numero).
      try {
        const ck = leerCookieSede();
        const r = await fetch(`/api/facturas/numero${ck ? `?oficina=${encodeURIComponent(ck)}` : ""}`);
        if (r.ok) setNumero(String((await r.json()).numero ?? ""));
      } catch { /* el número se genera al crear */ }

      setCargando(false);
    })();
  }, []);

  // Al elegir sede en el selector, el número propuesto se recalcula con SU serie.
  function onSedeCreacion(estado: { sede: string | null; requerida: boolean }) {
    setSedeCreacion((prev) => {
      if (estado.requerida && estado.sede && estado.sede !== prev.sede) {
        fetch(`/api/facturas/numero?oficina=${encodeURIComponent(estado.sede)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.numero) setNumero(String(d.numero)); })
          .catch(() => {});
      }
      return estado;
    });
  }

  async function handleSubmit(p: FacturaPayload) {
    setCreando(true);
    setError(null);
    try {
      // «Todas» es vista de LECTURA: la factura manual necesita una oficina concreta
      // (su serie depende de ella). Pastilla activa → prerrellena; en «Todas» → obliga.
      if (sedeCreacion.requerida && !sedeCreacion.sede) {
        throw new Error(t("Estás en «Todas» (solo lectura). Elige arriba la oficina que factura."));
      }
      let sedeTrabajo: string | null = sedeCreacion.requerida ? sedeCreacion.sede : null;
      if (!sedeTrabajo) sedeTrabajo = (await contextoDeTrabajoBrowser()).activa; // pastille validée (source unique)

      // La factura nace en el SERVIDOR (17/09/2026): numeración, totales y registro
      // VERI*FACTU en un único sitio — el navegador ya no inserta en Factura.
      const r = await fetch("/api/facturas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: p.numero, oficinaId: sedeTrabajo, cliente: p.cliente, concepto: p.concepto, baseImponible: p.baseImponible, avanzada: p.avanzada, lineas: p.lineas, suplidos: p.suplidos, notas: p.notas,
          documento: p.documento, direccion: p.direccion, clienteId: p.clienteId, empresaId: p.empresaId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("No se pudo crear la factura. Vuelve a intentarlo."));
      setFactura({
        id: String(d.id), numero: String(d.numero), cliente: p.cliente, concepto: p.concepto, base: p.baseImponible,
        estado: "EMITIDA", fecha: String(d.fecha ?? ""), vence: d.vence ?? null,
        lineas: p.avanzada ? p.lineas : undefined, suplidos: p.avanzada ? p.suplidos : undefined, notas: p.avanzada ? p.notas : undefined,
        // Lo que el servidor congeló (si eligió el cliente sin tocar los campos, los de su ficha).
        clienteDatos: d.clienteDatos ?? datosFiscalesManuales(p.documento, p.direccion),
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

      <div className="mt-6">
        <SelectorSedeCreacion onEstado={onSedeCreacion} />
      </div>

      {cargando ? (
        <div className="space-y-3">
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (
        <div>
          <FacturaEditor
            avanzada={avanzada}
            servicios={servicios}
            inicial={(() => {
              // Desde la ficha de un cliente («+ Nueva»): su NIF y domicilio ya rellenos.
              const pre = clienteIdPrefill ? opcionesFiscales.find((o) => o.tipo === "cliente" && o.id === clienteIdPrefill) : undefined;
              return pre ? { numero, cliente: pre.nombre, documento: pre.documento, direccion: pre.direccion, clienteId: pre.id } : { numero, cliente: clientePrefill };
            })()}
            fiscal={{ opciones: opcionesFiscales }}
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
