"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiciosAsignacion } from "@/lib/multi-servicio";
import { useT } from "@/components/lang-provider";

// Asignación de servicios a miembros del expediente FAMILIAR (pedido de Juan: el padre
// un trámite, la madre otro). Mismo patrón discreto que «Aplicar descuento»: enlace →
// editor → guardar/quitar. Un servicio sin selección se aplica a TODA la familia (×N).
export function AsignarMiembros({ expedienteId, servicios, miembros, inicial }: {
  expedienteId: string;
  servicios: { id: string; label: string }[];
  miembros: { id: string; nombre: string }[];
  inicial: ServiciosAsignacion | null;
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    const s: Record<string, string[]> = {};
    for (const svc of servicios) s[svc.id] = inicial?.[svc.id] ?? [];
    setSel(s); setError(null); setAbierto(true);
  }
  function toggle(clave: string, clienteId: string) {
    setSel((s) => {
      const lista = s[clave] ?? [];
      return { ...s, [clave]: lista.includes(clienteId) ? lista.filter((x) => x !== clienteId) : [...lista, clienteId] };
    });
  }

  async function enviar(asignacion: Record<string, string[]> | null) {
    setBusy(true); setError(null);
    try {
      // Solo se envían los servicios CON selección: el resto queda «toda la familia».
      const limpia = asignacion
        ? Object.fromEntries(Object.entries(asignacion).filter(([, ids]) => ids.length > 0))
        : null;
      const res = await fetch(`/api/expedientes/${expedienteId}/asignacion`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacion: limpia && Object.keys(limpia).length ? limpia : null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar la asignación."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar la asignación."));
    } finally { setBusy(false); }
  }

  if (!abierto) {
    return (
      <button onClick={abrir} className="-my-2 py-2 text-xs font-medium text-aproba-700 hover:underline sm:my-0 sm:py-0">
        {inicial ? t("Editar asignación por miembro") : t("Asignar servicios por miembro")}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full max-w-md rounded-lg border border-dashed border-slate-300 bg-cream-50/40 p-3">
      <p className="mb-2 text-xs text-slate-500">{t("Cada servicio se cobra solo a los miembros que lo llevan. Sin selección: toda la familia.")}</p>
      <div className="space-y-2.5">
        {servicios.map((svc) => (
          <div key={svc.id}>
            <p className="mb-1 text-xs font-semibold text-slate-700">{svc.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {miembros.map((m) => {
                const activo = (sel[svc.id] ?? []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(svc.id, m.id)}
                    disabled={busy}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${activo ? "border-aproba-600 bg-aproba-50 text-aproba-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
                  >
                    {m.nombre}
                  </button>
                );
              })}
              {(sel[svc.id] ?? []).length === 0 && <span className="self-center text-[11px] italic text-slate-400">{t("toda la familia")}</span>}
            </div>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {inicial && (
          <button onClick={() => enviar(null)} disabled={busy} className="mr-auto px-1 py-2 text-xs text-slate-400 transition hover:text-slate-600 sm:px-0 sm:py-0">{t("Quitar asignación")}</button>
        )}
        <button onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="px-1 py-2 text-xs text-slate-400 transition hover:text-slate-600 sm:px-0 sm:py-0">{t("Cancelar")}</button>
        <button onClick={() => enviar(sel)} disabled={busy} className="min-h-[36px] rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300 sm:min-h-0">
          {busy ? "…" : t("Guardar")}
        </button>
      </div>
    </div>
  );
}
