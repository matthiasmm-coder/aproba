"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { ArrowIcon } from "@/components/icons";
import type { ExpedienteEstado } from "@/lib/types";

// El "siguiente paso" como acción de un clic: la flecha ES el botón. Según el estado,
// avanza la máquina de estados (/api/expedientes/[id]/avanzar), navega a la herramienta
// o copia el enlace del cliente. En los estados de espera, queda en gris (no accionable).
// Abre la sección plegable (evento capturado por SeccionPlegable) y luego hace scroll
// al ancla interna — sin esto, el scroll apuntaría a un contenido oculto.
function abrirYScroll(seccion: string, target: string, block: ScrollLogicalPosition = "start") {
  window.dispatchEvent(new CustomEvent("abrir-seccion", { detail: seccion }));
  setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block }), 80);
}

export function DriverBanner({
  id, estado, citaPresencial = false, citaQuien = "cliente", portalToken, permiteSubidaInterna = false, formulariosHref, revision,
}: {
  id: string;
  estado: ExpedienteEstado;
  citaPresencial?: boolean;
  citaQuien?: "cliente" | "gestor";
  portalToken?: string | null;
  // Expediente individual → el gestor puede trabajarlo internamente (subir docs él mismo).
  permiteSubidaInterna?: boolean;
  formulariosHref: string;
  // Última revisión «como Extranjería» (Centinela) — el driver la integra en el flujo:
  // sin revisión → sugerir revisarla antes de presentar; ROJO → confirm reforzado.
  revision?: { verdicto: "ROJO" | "AMBAR" | "VERDE"; rojos: number } | null;
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [citaOpen, setCitaOpen] = useState(false);
  const [cita, setCita] = useState({ fecha: "", hora: "", lugar: "", notas: "" });

  async function avanzar(accion: string, extra?: Record<string, unknown>, navHref?: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo completar la acción.")); }
      if (navHref) router.push(navHref); else router.refresh();
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
    | { kind: "avanzar"; label: string; accion: string; confirm?: string; navAfter?: string }
    | { kind: "cita"; label: string }
    | { kind: "copiar"; label: string }
    | { kind: "ancla"; label: string; target: string };

  let prim: Prim;
  let secundaria: React.ReactNode = null;
  const btnSec = "rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

  switch (estado) {
    case "BORRADOR":
      prim = portalToken ? { kind: "copiar", label: t("Enviar enlace al cliente") } : { kind: "espera", label: t("Comparte el enlace con el cliente") };
      // Alternativa al enlace: trabajar el expediente internamente (el gestor sube los docs).
      if (permiteSubidaInterna) {
        secundaria = (
          <button onClick={() => abrirYScroll("documentos", "subir-interno", "center")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white">
            {t("Trabajar internamente")}
          </button>
        );
      }
      break;
    case "DOCS_PENDIENTES": prim = { kind: "avanzar", label: t("Generar formularios"), accion: "forzar_validados", confirm: t("Aún faltan documentos del cliente. ¿Quieres pasar al siguiente paso igualmente? Podrás generar los formularios ahora, y el cliente seguirá pudiendo enviar los que falten desde su enlace."), navAfter: formulariosHref }; break;
    case "DOCS_VALIDADOS": prim = { kind: "nav", label: t("Generar formularios"), href: formulariosHref }; break;
    case "FORM_GENERADO":
      // El flujo pasa POR la revisión «como Extranjería»: sin revisión, el siguiente
      // paso es revisarla (no presentar a ciegas); con ROJO, confirm reforzado.
      if (!revision) {
        prim = { kind: "ancla", label: t("Revisar como Extranjería"), target: "centinela" };
        secundaria = <button onClick={async () => { if (await confirmar(t("¿Marcar como presentado sin revisar? Se avisará al cliente."))) avanzar("presentar"); }} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white disabled:opacity-60">{t("Presentar sin revisar")}</button>;
      } else {
        prim = {
          kind: "avanzar", label: t("Marcar como presentado"), accion: "presentar",
          confirm: revision.verdicto === "ROJO"
            ? t("La revisión «como Extranjería» ha detectado {n} riesgo(s) ALTO(s) de requerimiento. ¿Presentar igualmente?").replace("{n}", String(revision.rojos))
            : t("¿Marcar como presentado? Se avisará al cliente."),
        };
        secundaria = (
          <button onClick={() => abrirYScroll("centinela", "centinela")} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${revision.verdicto === "ROJO" ? "border-red-300 text-red-700 hover:bg-red-50" : revision.verdicto === "AMBAR" ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-aproba-300 text-aproba-700 hover:bg-aproba-50"}`}>
            {revision.verdicto === "ROJO" ? `🔴 ${t("Ver los hallazgos")}` : revision.verdicto === "AMBAR" ? `🟡 ${t("Ver los hallazgos")}` : `✓ ${t("Revisión sin hallazgos")}`}
          </button>
        );
      }
      break;
    case "PRESENTADO":
      prim = { kind: "avanzar", label: t("Resolución favorable"), accion: "resolver_favorable" };
      secundaria = <button onClick={async () => { if (await confirmar(t("¿Marcar como denegado?"))) avanzar("resolver_desfavorable"); }} disabled={loading} className={btnSec}>{t("Denegado")}</button>;
      break;
    case "RESUELTO":
      prim = citaPresencial ? { kind: "cita", label: t("Agendar cita") } : { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") };
      break;
    case "CITA_HUELLAS": prim = { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") }; break;
    case "FINALIZADO":
      // El ciclo NO termina aquí: la tarjeta caduca y Vigía ya está vigilando.
      prim = { kind: "espera", label: t("Finalizado — seguimiento de renovación activado") };
      secundaria = <a href="/app/vencimientos" className="rounded-lg border border-aproba-300 px-3 py-1.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50">{t("Ver vencimientos")} →</a>;
      break;
    case "RECHAZADO":
      // Denegado ≠ callejón sin salida: el Funcionario Fantasma redacta el recurso o la
      // contestación al requerimiento (el panel tiene el campo para pegarlo).
      prim = { kind: "espera", label: t("Expediente denegado") };
      secundaria = (
        <button onClick={() => abrirYScroll("centinela", "centinela")} className="rounded-lg border border-aproba-300 px-3 py-1.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50">
          {t("Redactar recurso / contestación")} →
        </button>
      );
      break;
    default: prim = { kind: "espera", label: t("Sin acciones pendientes") };
  }

  const actionable = prim.kind !== "espera";
  async function onPrimary() {
    if (loading) return;
    if (prim.kind === "nav") router.push(prim.href);
    else if (prim.kind === "avanzar") { if (!prim.confirm || (await confirmar(prim.confirm))) avanzar(prim.accion, undefined, prim.navAfter); }
    else if (prim.kind === "cita") setCitaOpen((o) => !o);
    else if (prim.kind === "copiar") copiarEnlace();
    else if (prim.kind === "ancla") abrirYScroll(prim.target === "centinela" ? "centinela" : "documentos", prim.target);
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
