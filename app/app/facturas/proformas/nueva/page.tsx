"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { documentoSinEtiqueta } from "@/lib/facturas";
import { cargarClientesFiscales, type ClienteFiscalOpcion } from "@/lib/clientes-fiscales";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { facturacionAvanzada } from "@/lib/planes";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { COLS_PROFORMA, DIAS_VALIDEZ_PROFORMA, mapFilaProforma, type Proforma } from "@/lib/proformas";
import { FacturaEditor, type ServicioTarifa, type FacturaPayload, type FacturaEditorInicial } from "@/components/factura-editor";
import { useT } from "@/components/lang-provider";
import { SelectorSedeCreacion } from "@/components/selector-sede-creacion";
import { contextoDeTrabajoBrowser } from "@/lib/oficinas-browser";

// NUEVA (o EDITAR) FACTURA PROFORMA (pedido de Juan, 29/09/2026): el formulario de la factura
// manual, con su número de proforma (serie PRO, lo pone el servidor) y «Válida hasta».
// ?editar=<id> la abre para corregirla mientras no se haya convertido ni anulado.
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

export default function NuevaProforma() {
  const t = useT();
  const router = useRouter();
  const [editarId] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("editar") ?? "" : ""));
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [plan, setPlan] = useState<string>("STARTER");
  const [numero, setNumero] = useState("");
  const [validaHasta, setValidaHasta] = useState(enDias(DIAS_VALIDEZ_PROFORMA));
  const [opcionesFiscales, setOpcionesFiscales] = useState<ClienteFiscalOpcion[]>([]);
  const [existente, setExistente] = useState<Proforma | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sedeCreacion, setSedeCreacion] = useState<{ sede: string | null; requerida: boolean }>({ sede: null, requerida: false });
  const avanzada = facturacionAvanzada(plan);

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try {
        const { data: sub } = await sb.from("Subscription").select("plan").limit(1).maybeSingle();
        if (sub?.plan) setPlan(sub.plan as string);
      } catch { /* STARTER por defecto */ }
      let activos: ServicioTarifa[] = [];
      try {
        const { data } = await sb.from("ServicioConfig").select("clave, label, anticipo, resto").eq("active", true).order("orden");
        if (data?.length) activos = data.map((r) => ({ id: r.clave, label: r.label, precio: Number(r.anticipo) + Number(r.resto) }));
      } catch { /* catálogo por defecto */ }
      if (!activos.length) activos = DEFAULT_SERVICIOS.filter((s) => s.active).map((s) => ({ id: s.id, label: s.label, precio: s.precio }));
      setServicios(activos);
      setOpcionesFiscales(await cargarClientesFiscales());
      if (editarId) {
        const { data } = await sb.from("Proforma").select(COLS_PROFORMA).eq("id", editarId).maybeSingle();
        const p = data ? mapFilaProforma(data as Record<string, unknown>) : null;
        if (!p) setError(t("No se encuentra la proforma."));
        else {
          setExistente(p);
          setNumero(p.numero);
          const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(p.validaHasta ?? "");
          if (m) setValidaHasta(`${m[3]}-${m[2]}-${m[1]}`);
        }
      } else {
        try {
          const r = await fetch("/api/proformas/numero");
          if (r.ok) setNumero(String((await r.json()).numero ?? ""));
        } catch { /* el número se da al crearla */ }
      }
      setCargando(false);
    })();
  }, [editarId, t]);

  const inicial: FacturaEditorInicial = existente
    ? {
        numero, cliente: existente.cliente, documento: documentoSinEtiqueta(existente.clienteDatos?.documento), direccion: existente.clienteDatos?.direccion ?? "",
        clienteId: existente.clienteId, empresaId: existente.empresaId, concepto: existente.concepto, base: existente.base,
        lineas: existente.lineas.length ? existente.lineas : undefined, suplidos: existente.suplidos, notas: existente.notas ?? undefined, retencionPct: existente.retencionPct,
      }
    : { numero };

  async function guardar(p: FacturaPayload) {
    setGuardando(true); setError(null);
    try {
      if (!existente && sedeCreacion.requerida && !sedeCreacion.sede) throw new Error(t("Estás en «Todas» (solo lectura). Elige arriba la oficina que factura."));
      let sede: string | null = existente ? existente.oficinaId : sedeCreacion.requerida ? sedeCreacion.sede : null;
      if (!existente && !sede) sede = (await contextoDeTrabajoBrowser()).activa;
      const cuerpo = {
        oficinaId: sede, cliente: p.cliente, concepto: p.concepto, baseImponible: p.baseImponible, avanzada: p.avanzada, lineas: p.lineas, suplidos: p.suplidos, notas: p.notas,
        documento: p.documento, direccion: p.direccion, clienteId: p.clienteId, empresaId: p.empresaId, retencionPct: p.retencionPct ?? null, validaHasta,
      };
      const r = await fetch(existente ? `/api/proformas/${existente.id}` : "/api/proformas", {
        method: existente ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("No se pudo guardar la proforma."));
      router.push(`/app/facturas/proformas/${String(d.proforma?.id ?? existente?.id)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la proforma."));
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={existente ? `/app/facturas/proformas/${existente.id}` : "/app/facturas?vista=proformas"} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Proformas")}
      </Link>
      <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{existente ? t("Editar proforma") : t("Nueva proforma")}</h1>
      <p className="mt-1 text-slate-500">{t("Lo que el cliente va a pagar, antes de emitir la factura. No cuenta como factura: cuando pague, la conviertes en factura con un clic.")}</p>

      {!existente && (
        <div className="mt-6">
          <SelectorSedeCreacion onEstado={setSedeCreacion} />
        </div>
      )}

      <label className="mt-4 block text-sm font-medium text-slate-700">{t("Válida hasta")}
        <input type="date" value={validaHasta} min={enDias(1)} onChange={(e) => setValidaHasta(e.target.value)}
          className="mt-1.5 block rounded-lg border border-slate-300 px-3 py-2 text-[16px] outline-none focus:border-aproba-600 sm:text-sm" />
      </label>

      {cargando ? (
        <div className="mt-4 space-y-3">
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (
        <div className="mt-4">
          <FacturaEditor
            key={existente?.id ?? "nueva"}
            avanzada={avanzada}
            servicios={servicios}
            inicial={inicial}
            fiscal={{ opciones: opcionesFiscales }}
            conRetencion
            numeroEtiqueta={t("Nº de proforma")}
            numeroFijo
            onSubmit={guardar}
            submitLabel={existente ? t("Guardar la proforma") : t("Crear proforma")}
            busy={guardando}
            error={error}
          />
        </div>
      )}
    </div>
  );
}
