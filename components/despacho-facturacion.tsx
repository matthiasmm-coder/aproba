"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { Despacho } from "@/lib/data/config";

// Ajustes › datos de facturación del despacho (encabezado de la factura).
// Lo que se rellena aquí aparece en la cabecera de cada factura (PDF/impresión).
// El LOGO ya no se sube aquí: vive en Despacho y cuenta (components/logo-despacho.tsx),
// porque es la marca de todo lo que ve el cliente, no solo de la factura.
export function DespachoFacturacion({ inicial }: { inicial: Despacho }) {
  const t = useT();
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre === "Mi despacho" ? "" : inicial.nombre);
  const [nif, setNif] = useState(inicial.nif ?? "");
  const [domicilio, setDomicilio] = useState(inicial.domicilio ?? "");
  // Domicilio donde se presta el servicio, si no es el fiscal: solo va a la hoja de encargo,
  // el presupuesto y el mandato. La factura lleva SIEMPRE el fiscal (documento tributario).
  const [domicilioActividad, setDomicilioActividad] = useState(inicial.domicilioActividad ?? "");
  const [email, setEmail] = useState(inicial.emailFacturacion ?? "");
  const [estado, setEstado] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEstado("saving"); setError(null);
    try {
      const fd = new FormData();
      fd.set("nombre", nombre); fd.set("nif", nif); fd.set("domicilio", domicilio); fd.set("domicilioActividad", domicilioActividad); fd.set("emailFacturacion", email);
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      void d;
      setEstado("saved"); window.setTimeout(() => setEstado((s) => (s === "saved" ? "idle" : s)), 1500);
      router.refresh();
    } catch (e) {
      setEstado("error"); setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    }
  }

  const inp = "mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{t("Datos de facturación")}</h3>
        <span className={`text-xs font-medium transition-opacity ${estado === "idle" ? "opacity-0" : "opacity-100"} ${estado === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {estado === "saving" ? t("Guardando…") : estado === "saved" ? t("Guardado ✓") : estado === "error" ? t("Error") : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{t("Aparecen en la cabecera de tus facturas (PDF). El logo se cambia en Despacho y cuenta.")}</p>

      <div className="mt-4 flex items-start gap-4">
        {/* Datos */}
        <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Razón social / nombre")}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Nombre del despacho")} className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("NIF / CIF")}</label>
            <input value={nif} onChange={(e) => setNif(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Email de facturación")}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Domicilio fiscal")}</label>
            <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder={t("Calle, nº, CP, ciudad")} className={inp} />
            <p className="mt-1 text-[11px] text-slate-400">{t("El que aparece en tus facturas.")}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Domicilio de actividad")}</label>
            <input value={domicilioActividad} onChange={(e) => setDomicilioActividad(e.target.value)} placeholder={t("Solo si atiendes en otra dirección")} className={inp} />
            <p className="mt-1 text-[11px] text-slate-400">{t("Aparece en la hoja de encargo, el presupuesto y el mandato. Si lo dejas vacío, se usa el domicilio fiscal.")}</p>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button onClick={guardar} disabled={estado === "saving"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
          {estado === "saving" ? t("Guardando…") : t("Guardar datos de facturación")}
        </button>
      </div>
    </div>
  );
}
