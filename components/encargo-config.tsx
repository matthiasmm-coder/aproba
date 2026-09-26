"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";
import { modeloPorDefecto, type MandatoConsejoConfig, type ModeloMandato } from "@/lib/mandato-modelos";

// Ajustes → «Hoja de encargo y mandato»: interruptor + datos del mandatario
// (el gestor persona física que firma el mandato). Solo administradores —
// el fieldset padre ya viene deshabilitado para el resto.

export type EncargoConfigInicial = {
  hojaEncargoActiva: boolean;
  mandatarioNombre: string;
  mandatarioDni: string;
  mandatarioColegiado: string;
  mandatarioColegio: string;
  // Opciones 06/08 (supabase/portal-encargo-opciones.sql):
  encargoFormasPago: string;      // una por línea; "" = lista automática
  mandatoPropio: boolean;         // hay un modelo de mandato PDF subido
  // Modelo oficial del Consejo (26/09/2026, Juan) — null = desactivado o sin migración.
  mandatoConsejo?: MandatoConsejoConfig | null;
};

export function EncargoConfig({ inicial, servicios = [] }: { inicial: EncargoConfigInicial; servicios?: { id: string; label: string }[] }) {
  const t = useT();
  const [activa, setActiva] = useState(inicial.hojaEncargoActiva);
  const [nombre, setNombre] = useState(inicial.mandatarioNombre);
  const [dni, setDni] = useState(inicial.mandatarioDni);
  const [colegiado, setColegiado] = useState(inicial.mandatarioColegiado);
  const [colegio, setColegio] = useState(inicial.mandatarioColegio);
  const [formasPago, setFormasPago] = useState(inicial.encargoFormasPago);
  const [mandatoPropio, setMandatoPropio] = useState(inicial.mandatoPropio);
  const [mandatoFile, setMandatoFile] = useState<File | null>(null);
  const [quitarMandato, setQuitarMandato] = useState(false);
  const [consejo, setConsejo] = useState(Boolean(inicial.mandatoConsejo?.activo));
  const [modelos, setModelos] = useState<Record<string, ModeloMandato>>(inicial.mandatoConsejo?.porServicio ?? {});
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
      fd.set("encargoFormasPago", formasPago);
      if (mandatoFile) fd.set("mandatoPropio", mandatoFile);
      if (quitarMandato) fd.set("quitarMandatoPropio", "1");
      // Solo se guardan las EXCEPCIONES: lo que coincide con el modelo propuesto sigue a la
      // propuesta (si el servicio cambia de nombre, la propuesta se recalcula).
      const excepciones = Object.fromEntries(servicios
        .filter((sv) => modelos[sv.id] && modelos[sv.id] !== modeloPorDefecto(sv))
        .map((sv) => [sv.id, modelos[sv.id]]));
      fd.set("mandatoConsejo", JSON.stringify({ activo: consejo, porServicio: excepciones }));
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar."));
      if (mandatoFile) { setMandatoPropio(true); setMandatoFile(null); }
      if (quitarMandato) { setMandatoPropio(false); setQuitarMandato(false); }
      setEstado("saved");
      window.setTimeout(() => setEstado("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
      setEstado("error");
    }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none transition focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="sm:col-span-2">
            <label className={lbl}>{t("Formas de pago en la hoja de encargo (una por línea)")}</label>
            <textarea
              value={formasPago}
              onChange={(e) => setFormasPago(e.target.value)}
              rows={4}
              maxLength={1200}
              className={inp}
              placeholder={t("Transferencia bancaria — IBAN ES00 0000 0000 0000 0000 0000\nBizum: 600 000 000\nPago con tarjeta mediante enlace seguro")}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t("Se imprimen tal cual en el apartado de pago de la hoja. Vacío = lista automática (IBAN activo + tarjeta si está configurada).")}</p>
          </div>

          {/* Modelo OFICIAL del Consejo General (26/09/2026, Juan): Aproba rellena el impreso
              del Consejo en extranjería y nacionalidad; el resto sigue con el de siempre. */}
          <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={consejo} onChange={(e) => setConsejo(e.target.checked)} className="mt-0.5 accent-aproba-600" />
              <span className="text-xs leading-relaxed text-slate-600">
                <b className="block text-sm font-semibold text-slate-800">{t("Mandato oficial del Consejo General de Gestores Administrativos")}</b>
                {t("En extranjería y nacionalidad, Aproba rellena el impreso oficial del Consejo, con su formato y su logo, con los datos del cliente y los tuyos. Los demás trámites siguen con el mandato de siempre.")}
              </span>
            </label>
            {consejo && (!colegiado.trim() || !colegio.trim()) && (
              <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">{t("El impreso pide tu nº de colegiado y tu Colegio: rellénalos arriba.")}</p>
            )}
            {consejo && servicios.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-aproba-700">{t("Qué mandato lleva cada servicio")} ({servicios.length})</summary>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t("Aproba lo propone según el nombre del servicio: cámbialo donde no acierte.")}</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {servicios.map((sv) => (
                    <li key={sv.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-xs text-slate-700" title={sv.label}>{sv.label}</span>
                      <select
                        value={modelos[sv.id] ?? modeloPorDefecto(sv)}
                        onChange={(e) => setModelos((m) => ({ ...m, [sv.id]: e.target.value as ModeloMandato }))}
                        aria-label={`${t("Mandato de")} ${sv.label}`}
                        className="min-w-0 max-w-[48%] shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[16px] text-slate-700 outline-none focus:border-aproba-600 sm:text-xs"
                      >
                        <option value="extranjeria">{t("Extranjería")}</option>
                        <option value="nacionalidad">{t("Nacionalidad")}</option>
                        <option value="general">{t("El de siempre")}</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
            <label className={lbl}>{t("Modelo de mandato propio (PDF)")}</label>
            {mandatoPropio && !quitarMandato ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="text-xs font-medium text-aproba-700">✓ {t("Modelo propio activo — las descargas de mandato sirven tu PDF")}</span>
                <button type="button" onClick={() => setQuitarMandato(true)} className="text-xs font-semibold text-red-600 hover:underline">{t("Quitar y volver al generado")}</button>
              </div>
            ) : quitarMandato ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="text-xs text-slate-500">{t("Se volverá al mandato generado al guardar.")}</span>
                <button type="button" onClick={() => setQuitarMandato(false)} className="text-xs font-semibold text-slate-600 hover:underline">{t("Cancelar")}</button>
              </div>
            ) : (
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setMandatoFile(e.target.files?.[0] ?? null)}
                className="mx-auto block w-auto text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-aproba-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-aproba-700"
              />
            )}
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t("Se entrega TAL CUAL al cliente (sin relleno automático de datos). Vacío = mandato generado por Aproba con los datos del expediente.")}</p>
          </div>

        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button onClick={guardar} disabled={estado === "saving"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {estado === "saving" ? "…" : t("Guardar")}
        </button>
        {estado === "saved" && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
      </div>
    </div>
  );
}
