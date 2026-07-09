"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Ajustes → «Hoja de encargo y mandato»: interruptor + datos del mandatario
// (el gestor persona física que firma el mandato). Solo administradores —
// el fieldset padre ya viene deshabilitado para el resto.

export type EncargoConfigInicial = {
  hojaEncargoActiva: boolean;
  mandatarioNombre: string;
  mandatarioDni: string;
  mandatarioColegiado: string;
  mandatarioColegio: string;
};

export function EncargoConfig({ inicial }: { inicial: EncargoConfigInicial }) {
  const t = useT();
  const [activa, setActiva] = useState(inicial.hojaEncargoActiva);
  const [nombre, setNombre] = useState(inicial.mandatarioNombre);
  const [dni, setDni] = useState(inicial.mandatarioDni);
  const [colegiado, setColegiado] = useState(inicial.mandatarioColegiado);
  const [colegio, setColegio] = useState(inicial.mandatarioColegio);
  const [estado, setEstado] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEstado("saving");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("soloEncargo", "1");
      fd.set("hojaEncargoActiva", activa ? "1" : "0");
      fd.set("mandatarioNombre", nombre);
      fd.set("mandatarioDni", dni);
      fd.set("mandatarioColegiado", colegiado);
      fd.set("mandatarioColegio", colegio);
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      setEstado("saved");
      window.setTimeout(() => setEstado("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
      setEstado("error");
    }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
  const lbl = "mb-1 block text-xs font-semibold text-slate-600";

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t("Hoja de encargo y mandato")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {t("El cliente descarga desde su portal la hoja de encargo y el mandato de representación ya cumplimentados, los firma y los vuelve a subir con su documentación.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activa}
          onClick={() => setActiva((a) => !a)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${activa ? "bg-aproba-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activa ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {activa && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>{t("Profesional que firma el mandato")}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={inp} placeholder={t("Nombre y apellidos")} />
          </div>
          <div>
            <label className={lbl}>DNI</label>
            <input value={dni} onChange={(e) => setDni(e.target.value)} maxLength={20} className={inp} placeholder="00000000A" />
          </div>
          <div>
            <label className={lbl}>{t("Nº de colegiado (opcional)")}</label>
            <input value={colegiado} onChange={(e) => setColegiado(e.target.value)} maxLength={30} className={inp} />
          </div>
          <div>
            <label className={lbl}>{t("Colegio profesional (opcional)")}</label>
            <input value={colegio} onChange={(e) => setColegio(e.target.value)} maxLength={120} className={inp} placeholder={t("Colegio Oficial de Gestores Administrativos de…")} />
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={guardar} disabled={estado === "saving"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {estado === "saving" ? "…" : t("Guardar")}
        </button>
        {estado === "saved" && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
      </div>
    </div>
  );
}
