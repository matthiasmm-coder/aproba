"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { DEFAULT_SERVICIOS } from "@/lib/servicios";
import { facturacionAvanzada } from "@/lib/planes";
import { FacturaEditor, type ServicioTarifa, type FacturaEditorInicial, type FacturaPayload } from "@/components/factura-editor";
import { useT } from "@/components/lang-provider";

// Popup de cobro del expediente. Dos modos:
//  • "crear": solicitar el pago final → POST /api/pagos con la factura editada → se emite y
//    se ENVÍA automáticamente al cliente.
//  • "editar": retocar una factura ya generada (anticipo o final) → PUT /api/facturas/[id],
//    con opción de reenviarla corregida al cliente.
// Carga plan + servicios (y nº de serie / la factura a editar) y monta el editor ya listo.

export function CobroFacturaModal({
  modo, expedienteId, clienteNombre, conceptoFinal, baseFinal, facturaId, onClose,
}: {
  modo: "crear" | "editar";
  expedienteId?: string; // requerido para crear; en editar el servidor lo resuelve de la factura
  clienteNombre?: string;
  conceptoFinal?: string;
  baseFinal?: number;
  facturaId?: string;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [plan, setPlan] = useState<string>("STARTER");
  const [servicios, setServicios] = useState<ServicioTarifa[]>([]);
  const [inicial, setInicial] = useState<FacturaEditorInicial | null>(null);
  const [numeroFactura, setNumeroFactura] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificar, setNotificar] = useState(false); // edición: reenviar corregida
  const [tieneExpediente, setTieneExpediente] = useState(false); // solo se puede reenviar si la factura está ligada a un expediente (cliente con portal/email)
  const [forceAvanzada, setForceAvanzada] = useState(false); // editar una factura con líneas/suplidos usa el editor rico aunque el plan sea Starter (no perder datos)
  const avanzada = facturacionAvanzada(plan) || forceAvanzada;

  useEffect(() => {
    (async () => {
      const sb = createSupabaseBrowser();
      try { const { data: sub } = await sb.from("Subscription").select("plan").limit(1).maybeSingle(); if (sub?.plan) setPlan(sub.plan as string); } catch { /* STARTER */ }

      let activos: ServicioTarifa[] = [];
      try { const { data } = await sb.from("ServicioConfig").select("clave, label, anticipo, resto").eq("active", true).order("orden"); if (data?.length) activos = data.map((r) => ({ id: r.clave, label: r.label, precio: Number(r.anticipo) + Number(r.resto) })); } catch { /* fallback */ }
      if (!activos.length) activos = DEFAULT_SERVICIOS.filter((s) => s.active).map((s) => ({ id: s.id, label: s.label, precio: s.precio }));
      setServicios(activos);

      if (modo === "editar" && facturaId) {
        try {
          const r = await fetch(`/api/facturas/${facturaId}`);
          const fc = await r.json();
          if (!r.ok) throw new Error(fc.error);
          setNumeroFactura(fc.numero ?? "");
          setTieneExpediente(Boolean(fc.expedienteId));
          const tieneAvanzado = (Array.isArray(fc.lineas) && fc.lineas.length > 0) || (Array.isArray(fc.suplidos) && fc.suplidos.length > 0);
          setForceAvanzada(tieneAvanzado);
          const lineas = Array.isArray(fc.lineas) && fc.lineas.length ? fc.lineas : [{ concepto: fc.concepto || "", base: Number(fc.baseImponible) || 0 }];
          setInicial({ cliente: fc.clienteNombre ?? "", numero: fc.numero ?? "", lineas, suplidos: Array.isArray(fc.suplidos) ? fc.suplidos : [], notas: fc.notas ?? "", concepto: fc.concepto ?? "", base: Number(fc.baseImponible) || 0 });
        } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo cargar la factura.")); }
      } else {
        let numero = "";
        try { const year = new Date().getFullYear(); const { data: last } = await sb.from("Factura").select("numero").like("numero", `${year}-%`).order("numero", { ascending: false }).limit(1).maybeSingle(); numero = `${year}-${String((last ? Number(last.numero.split("-")[1]) : 0) + 1).padStart(4, "0")}`; } catch { /* el server numera */ }
        setNumeroFactura(numero);
        const base = baseFinal ?? 0;
        setInicial({ cliente: clienteNombre ?? "", numero, lineas: [{ concepto: conceptoFinal || "", base }], concepto: conceptoFinal || "", base });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(p: FacturaPayload) {
    setBusy(true); setError(null);
    try {
      const factura = { numero: p.numero, clienteNombre: p.cliente, concepto: p.concepto, baseImponible: p.baseImponible, lineas: p.lineas, suplidos: p.suplidos, notas: p.notas };
      const res = modo === "editar" && facturaId
        ? await fetch(`/api/facturas/${facturaId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...factura, notificar }) })
        : await fetch("/api/pagos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expedienteId, momento: "FINAL", factura }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar la factura."));
      // Carrera: ya existía una factura final → no se aplicaron los cambios editados.
      if (modo !== "editar" && d.yaExistia) { setError(t("Ya existe una factura de pago final para este expediente. Ciérrala y usa «Editar factura».")); return; }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la factura."));
    } finally { setBusy(false); }
  }

  const titulo = modo === "editar" ? `${t("Editar factura")} ${numeroFactura}` : t("Solicitar pago final");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label={t("Cerrar")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {modo === "editar"
            ? t("Modifica la factura. Puedes reenviarla corregida al cliente.")
            : t("Revisa y ajusta la factura. Al validar, se emite y se envía automáticamente al cliente con los datos de pago.")}
        </p>

        {!inicial ? (
          error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : (
            <div className="space-y-3">
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            </div>
          )
        ) : (
          <FacturaEditor
            avanzada={avanzada}
            servicios={servicios}
            inicial={inicial}
            onSubmit={onSubmit}
            busy={busy}
            error={error}
            submitLabel={modo === "editar" ? t("Guardar cambios") : t("Validar y enviar al cliente")}
            extra={modo === "editar" && tieneExpediente ? (
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-aproba-600 focus:ring-aproba-500" />
                {t("Reenviar la factura corregida al cliente por email")}
              </label>
            ) : undefined}
          />
        )}
      </div>
    </div>
  );
}
