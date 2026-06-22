"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { ArrowIcon } from "@/components/icons";
import type { ExpedienteEstado } from "@/lib/types";

// El "siguiente paso" como acción de un clic: la flecha ES el botón. Según el estado,
// avanza la máquina de estados (/api/expedientes/[id]/avanzar), navega a la herramienta
// o copia el enlace del cliente. En los estados de espera, queda en gris (no accionable).
export function DriverBanner({
  id, estado, citaPresencial = false, citaQuien = "cliente", portalToken, formulariosHref,
}: {
  id: string;
  estado: ExpedienteEstado;
  citaPresencial?: boolean;
  citaQuien?: "cliente" | "gestor";
  portalToken?: string | null;
  formulariosHref: string;
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [citaOpen, setCitaOpen] = useState(false);
  const [cita, setCita] = useState({ fecha: "", hora: "", lugar: "", notas: "" });

  async function avanzar(accion: string, extra?: Record<string, unknown>) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo completar la acción.")); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally { setLoading(false); }
  }

  function copiarEnlace() {
    if (!portalToken) return;
    const url = `${window.location.origin}/j/${portalToken}`;
    navigator.clipboard?.writeText(url).then(
      () => { setInfo(t("Enlace copiado. Envíaselo al cliente.")); setError(null); window.setTimeout(() => setInfo(null), 5000); },
      () => setError(t("No se pudo copiar el enlace.")),
    );
  }

  type Prim =
    | { kind: "espera"; label: string }
    | { kind: "nav"; label: string; href: string }
    | { kind: "avanzar"; label: string; accion: string; confirm?: string }
    | { kind: "cita"; label: string }
    | { kind: "copiar"; label: string };

  let prim: Prim;
  let secundaria: React.ReactNode = null;
  const btnSec = "rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

  switch (estado) {
    case "BORRADOR":
      prim = portalToken ? { kind: "copiar", label: t("Enviar enlace al cliente") } : { kind: "espera", label: t("Comparte el enlace con el cliente") };
      break;
    case "DOCS_PENDIENTES": prim = { kind: "espera", label: t("Esperando documentos del cliente") }; break;
    case "DOCS_VALIDADOS": prim = { kind: "nav", label: t("Generar formularios"), href: formulariosHref }; break;
    case "FORM_GENERADO": prim = { kind: "avanzar", label: t("Marcar como presentado"), accion: "presentar", confirm: t("¿Marcar como presentado? Se avisará al cliente.") }; break;
    case "PRESENTADO":
      prim = { kind: "avanzar", label: t("Resolución favorable"), accion: "resolver_favorable" };
      secundaria = <button onClick={() => { if (window.confirm(t("¿Marcar como denegado?"))) avanzar("resolver_desfavorable"); }} disabled={loading} className={btnSec}>{t("Denegado")}</button>;
      break;
    case "RESUELTO":
      prim = citaPresencial ? { kind: "cita", label: t("Agendar cita de huellas") } : { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") };
      break;
    case "CITA_HUELLAS": prim = { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") }; break;
    case "FINALIZADO": prim = { kind: "espera", label: t("Expediente finalizado") }; break;
    case "RECHAZADO": prim = { kind: "espera", label: t("Expediente denegado") }; break;
    default: prim = { kind: "espera", label: t("Sin acciones pendientes") };
  }

  const actionable = prim.kind !== "espera";
  function onPrimary() {
    if (loading) return;
    if (prim.kind === "nav") router.push(prim.href);
    else if (prim.kind === "avanzar") { if (!prim.confirm || window.confirm(prim.confirm)) avanzar(prim.accion); }
    else if (prim.kind === "cita") setCitaOpen((o) => !o);
    else if (prim.kind === "copiar") copiarEnlace();
  }

  const fld = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-aproba-600";

  return (
    <div className={`mt-4 rounded-2xl border p-4 ${actionable ? "border-aproba-200 bg-aproba-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {actionable ? (
          <button onClick={onPrimary} disabled={loading} aria-label={prim.label} className="group flex items-center gap-3 text-left disabled:opacity-70">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aproba-600 text-white shadow-sm transition group-hover:bg-aproba-700 group-active:scale-95">
              {loading
                ? <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                : <ArrowIcon className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-aproba-700">{t("Siguiente paso")}</span>
              <span className="block font-semibold text-slate-900 transition group-hover:text-aproba-700">{loading ? t("Guardando…") : prim.label}</span>
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500"><span className="text-xl leading-none">○</span></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Siguiente paso")}</span>
              <span className="block font-semibold text-slate-900">{prim.label}</span>
            </span>
          </div>
        )}
        {secundaria && <div className="shrink-0">{secundaria}</div>}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {info && <p className="mt-2 text-xs font-medium text-aproba-700">{info}</p>}

      {prim.kind === "cita" && citaOpen && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-slate-700">{t("Datos de la cita")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">{t("Fecha")} *
              <input type="date" value={cita.fecha} onChange={(e) => setCita((c) => ({ ...c, fecha: e.target.value }))} className={fld} />
            </label>
            <label className="block text-xs text-slate-500">{t("Hora")}
              <input type="time" value={cita.hora} onChange={(e) => setCita((c) => ({ ...c, hora: e.target.value }))} className={fld} />
            </label>
            <label className="block text-xs text-slate-500 sm:col-span-2">{t("Lugar / dirección")}
              <input value={cita.lugar} onChange={(e) => setCita((c) => ({ ...c, lugar: e.target.value }))} placeholder={t("Comisaría, oficina…")} className={fld} />
            </label>
            <label className="block text-xs text-slate-500 sm:col-span-2">{t("Instrucciones (qué llevar…)")}
              <textarea value={cita.notas} onChange={(e) => setCita((c) => ({ ...c, notas: e.target.value }))} rows={2} className={`${fld} resize-none`} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{citaQuien === "cliente" ? t("El cliente recibirá todos estos datos por email.") : t("El cliente solo recibirá la fecha; acudes tú en su nombre.")}</p>
          <button onClick={() => cita.fecha && avanzar("cita", cita)} disabled={!cita.fecha || loading} className="mt-2 w-full rounded-lg bg-aproba-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
            {loading ? t("Guardando…") : t("Confirmar cita y avisar")}
          </button>
        </div>
      )}
    </div>
  );
}
