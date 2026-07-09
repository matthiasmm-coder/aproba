"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

type Svc = { id: string; label: string };

// El gestor corrige el servicio/trámite del expediente (si lo eligió mal). Discreto:
// un enlace «Cambiar servicio» que despliega un desplegable + guardar. POST a
// /api/expedientes/[id]/servicio (no cambia el estado).
export function CambiarServicio({ expedienteId, servicios, actualClave }: {
  expedienteId: string; servicios: Svc[]; actualClave: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState(actualClave ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const svc = servicios.find((s) => s.id === clave);
    if (!svc) { setError(t("Elige un servicio.")); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/servicio`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave, label: svc.label }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo cambiar el servicio."));
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo cambiar el servicio."));
    } finally { setBusy(false); }
  }

  if (!abierto) {
    return (
      <button onClick={() => { setClave(actualClave ?? ""); setError(null); setAbierto(true); }} className="mt-1 text-xs font-medium text-aproba-700 hover:underline">
        {t("Cambiar servicio")}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label={t("Servicio del expediente")} value={clave} onChange={(e) => setClave(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100">
        <option value="" disabled>{t("Elige un servicio…")}</option>
        {servicios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <button onClick={guardar} disabled={busy} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{busy ? "…" : t("Guardar")}</button>
      <button onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
      {error && <span role="alert" className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}
