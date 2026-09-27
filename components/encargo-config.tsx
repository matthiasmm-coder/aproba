"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/components/lang-provider";
import { modeloPorDefecto, type MandatoConsejoConfig, type ModeloMandato } from "@/lib/mandato-modelos";

// Ajustes → «Hoja de encargo y mandato» (Matthias, 27/09/2026): DOS sub-tarjetas plegables,
// cada una con SU interruptor — la hoja de encargo y los mandatos ya no se encienden juntos.
// Encima, el profesional responsable, común a los dos: la hoja imprime su nombre y su nº de
// colegiado; el mandato, además, su DNI y su Colegio. Solo administradores — el fieldset
// padre ya viene deshabilitado para el resto.

export type EncargoConfigInicial = {
  hojaEncargoActiva: boolean;
  mandatoActivo: boolean;         // supabase/mandato-activo.sql; sin migrar = sigue a la hoja
  mandatarioNombre: string;
  mandatarioDni: string;
  mandatarioColegiado: string;
  mandatarioColegio: string;
  // Opciones 06/08 (supabase/portal-encargo-opciones.sql):
  encargoFormasPago: string;      // una por línea; "" = lista automática
  // Modelo oficial del Consejo (26/09/2026, Juan) — null = el de Aproba o sin migración.
  mandatoConsejo?: MandatoConsejoConfig | null;
};

export function EncargoConfig({ inicial, servicios = [] }: { inicial: EncargoConfigInicial; servicios?: { id: string; label: string }[] }) {
  const t = useT();
  const [hoja, setHoja] = useState(inicial.hojaEncargoActiva);
  const [mandato, setMandato] = useState(inicial.mandatoActivo);
  const [abiertaHoja, setAbiertaHoja] = useState(inicial.hojaEncargoActiva);
  const [abiertoMandato, setAbiertoMandato] = useState(inicial.mandatoActivo);
  const [nombre, setNombre] = useState(inicial.mandatarioNombre);
  const [dni, setDni] = useState(inicial.mandatarioDni);
  const [colegiado, setColegiado] = useState(inicial.mandatarioColegiado);
  const [colegio, setColegio] = useState(inicial.mandatarioColegio);
  const [formasPago, setFormasPago] = useState(inicial.encargoFormasPago);
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
      fd.set("hojaEncargoActiva", hoja ? "1" : "0");
      fd.set("mandatoActivo", mandato ? "1" : "0");
      fd.set("mandatarioNombre", nombre);
      fd.set("mandatarioDni", dni);
      fd.set("mandatarioColegiado", colegiado);
      fd.set("mandatarioColegio", colegio);
      fd.set("encargoFormasPago", formasPago);
      // Solo se guardan las EXCEPCIONES: lo que coincide con el modelo propuesto sigue a la
      // propuesta (si el servicio cambia de nombre, la propuesta se recalcula).
      const excepciones = Object.fromEntries(servicios
        .filter((sv) => modelos[sv.id] && modelos[sv.id] !== modeloPorDefecto(sv))
        .map((sv) => [sv.id, modelos[sv.id]]));
      fd.set("mandatoConsejo", JSON.stringify({ activo: consejo, porServicio: excepciones }));
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

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none transition focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";
  const lbl = "mb-1 block text-xs font-semibold text-slate-600";
  const opcion = (sel: boolean) => `flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition ${sel ? "border-aproba-300 bg-aproba-50/60" : "border-slate-200 hover:border-slate-300"}`;

  return (
    <div className="mt-6 space-y-3">
      {/* Común a los dos documentos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-800">{t("Profesional responsable")}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t("Figura en la hoja de encargo y firma los mandatos.")}</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>{t("Nombre y apellidos")}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={inp} />
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
      </div>

      <SubTarjeta
        titulo={t("Hoja de encargo")}
        desc={t("El cliente la descarga ya rellena desde su portal, la firma y la sube.")}
        apagada={t("Desactivada: el cliente no la recibe.")}
        activa={hoja}
        onActiva={(v) => { setHoja(v); if (v) setAbiertaHoja(true); }}
        abierta={abiertaHoja}
        onAbierta={setAbiertaHoja}
      >
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
      </SubTarjeta>

      <SubTarjeta
        titulo={t("Mandatos")}
        desc={t("El cliente los descarga ya rellenos desde su portal, los firma y los sube.")}
        apagada={t("Desactivados: el cliente no los recibe.")}
        activa={mandato}
        onActiva={(v) => { setMandato(v); if (v) setAbiertoMandato(true); }}
        abierta={abiertoMandato}
        onAbierta={setAbiertoMandato}
      >
        {/* Siempre HAY mandato (si la tarjeta está activa): aquí solo se elige el modelo.
            Los del Consejo son para gestores colegiados — un abogado se queda con el de Aproba. */}
        <p className={lbl}>{t("Modelo de mandato")}</p>
        <div className="space-y-2" role="radiogroup" aria-label={t("Modelo de mandato")}>
          <label className={opcion(!consejo)}>
            <input type="radio" name="modeloMandato" checked={!consejo} onChange={() => setConsejo(false)} className="mt-0.5 accent-aproba-600" />
            <span className="text-xs leading-relaxed text-slate-600">
              <b className="block text-sm font-semibold text-slate-800">{t("El de Aproba")}</b>
              {t("Vale para cualquier despacho.")}
            </span>
          </label>
          <label className={opcion(consejo)}>
            <input type="radio" name="modeloMandato" checked={consejo} onChange={() => setConsejo(true)} className="mt-0.5 accent-aproba-600" />
            <span className="text-xs leading-relaxed text-slate-600">
              <b className="block text-sm font-semibold text-slate-800">{t("Los del Consejo General de Gestores Administrativos")}</b>
              {t("Extranjería, nacionalidad o general, según el trámite. Para gestores colegiados.")}
            </span>
          </label>
        </div>
        {consejo && (!colegiado.trim() || !colegio.trim()) && (
          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">{t("El impreso pide tu nº de colegiado y tu Colegio: rellénalos arriba.")}</p>
        )}
        {consejo && servicios.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-aproba-700">{t("Qué mandato lleva cada servicio")} ({servicios.length})</summary>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t("Aproba lo propone según el nombre del servicio: cámbialo donde no acierte. Un expediente con servicios de modelos distintos recibe uno de cada, en el mismo PDF.")}</p>
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
                    <option value="general">{t("General")}</option>
                    <option value="siempre">{t("El de Aproba")}</option>
                  </select>
                </li>
              ))}
            </ul>
          </details>
        )}
      </SubTarjeta>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button onClick={guardar} disabled={estado === "saving"} className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {estado === "saving" ? "…" : t("Guardar")}
        </button>
        {estado === "saved" && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
      </div>
    </div>
  );
}

// Sub-tarjeta plegable con su interruptor: la cabecera pliega/despliega; el interruptor
// enciende/apaga (al encender, se despliega). Apagada, la configuración sigue editable.
function SubTarjeta({ titulo, desc, apagada, activa, onActiva, abierta, onAbierta, children }: {
  titulo: string; desc: string; apagada: string;
  activa: boolean; onActiva: (v: boolean) => void;
  abierta: boolean; onAbierta: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 p-4 sm:px-5">
        <button type="button" onClick={() => onAbierta(!abierta)} aria-expanded={abierta} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <svg className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierta ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">{titulo}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{desc}</span>
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={activa}
          aria-label={titulo}
          onClick={() => onActiva(!activa)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${activa ? "bg-aproba-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activa ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {abierta && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
          {!activa && <p className="mb-3 text-[11px] font-medium text-slate-400">{apagada}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
