"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { copiarTexto } from "@/lib/copiar";
import { ArrowIcon } from "@/components/icons";
import type { ExpedienteEstado } from "@/lib/types";
import type { Progreso } from "@/lib/progreso";

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
  id, estado, progreso, citaFecha = null, citaPresencial = false, portalToken, permiteSubidaInterna = false, modoManual = false, formulariosHref,
}: {
  id: string;
  estado: ExpedienteEstado;
  // Lectura calculada del ciclo (lib/progreso.ts). Manda sobre `estado`: desde que los
  // cuatro estados de preparación se fundieron en uno, solo los HECHOS dicen qué toca.
  progreso?: Progreso;
  citaFecha?: string | null;
  citaPresencial?: boolean;
  portalToken?: string | null;
  // Expediente individual → el gestor puede trabajarlo internamente (subir docs él mismo).
  permiteSubidaInterna?: boolean;
  // Modo manual: el despacho trabaja sin enlace → no se ofrece copiarlo.
  modoManual?: boolean;
  formulariosHref: string;
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enlaceEnClaro, setEnlaceEnClaro] = useState<string | null>(null);

  async function avanzar(accion: string, extra?: Record<string, unknown>, navHref?: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo completar la acción.")); }
      if (navHref) router.push(navHref); else router.refresh();
      // Que el clic PAGUE: tras marcar la resolución favorable se abre el cobro con la
      // liquidación final lista para revisar y emitir — el momento en que el trabajo
      // está hecho es el momento de facturarlo, no una sección que buscar más tarde.
      if (accion === "resolver_favorable") {
        setTimeout(() => {
          abrirYScroll("cobro", "cobro", "center");
          window.dispatchEvent(new CustomEvent("abrir-pago-final"));
        }, 600);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally { setLoading(false); }
  }

  async function copiarEnlace() {
    if (!portalToken) return;
    const url = `${window.location.origin}/j/${portalToken}`;
    if (await copiarTexto(url)) {
      setInfo(t("Enlace copiado. Envíaselo al cliente.")); setError(null);
      window.setTimeout(() => setInfo(null), 5000);
    } else {
      // Nunca dejar al gestor sin el enlace: si el navegador bloquea el portapapeles,
      // se muestra en claro para seleccionarlo a mano.
      setInfo(null); setError(null); setEnlaceEnClaro(url);
    }
  }

  type Prim =
    | { kind: "espera"; label: string }
    | { kind: "nav"; label: string; href: string }
    | { kind: "avanzar"; label: string; accion: string; confirm?: string; navAfter?: string }
    | { kind: "copiar"; label: string }
    | { kind: "ancla"; label: string; target: string };

  let prim: Prim = { kind: "espera", label: "" };
  let secundaria: React.ReactNode = null;
  const btnSec = "rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

  // ── PREPARACIÓN: una sola rama para lo que antes eran cuatro estados ──
  // La acción sale del progreso derivado (documentos que faltan, formularios curados…),
  // no de una etapa que el gestor tuviera que validar.
  const clave = progreso?.accion.clave;
  const enPreparacion = Boolean(progreso && progreso.estado === "EN_PREPARACION");
  const tieneCita = Boolean(progreso?.hitos.resuelto && citaFecha);
  if (enPreparacion && progreso) {
    if (clave === "subir_docs") {
      // Modo manual: el gesto es aportar los papeles uno mismo, no pedir nada al cliente.
      prim = { kind: "ancla", label: t("Subir los documentos"), target: "subir-interno" };
    } else if (clave === "elegir_servicio") {
      prim = portalToken ? { kind: "copiar", label: t("Enviar enlace al cliente") } : { kind: "espera", label: t("Comparte el enlace con el cliente") };
      if (permiteSubidaInterna) {
        secundaria = (
          <button onClick={() => abrirYScroll("documentos", "subir-interno", "center")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white">
            {t("Trabajar internamente")}
          </button>
        );
      }
    } else if (clave === "generar_formularios") {
      // Faltan papeles pero NADA impide preparar: el despacho rellena el EX en cuanto
      // tiene la identidad. La tarjeta del tablero dice ahora lo MISMO (una sola lectura).
      prim = { kind: "nav", label: t("Generar formularios"), href: formulariosHref };
      if (progreso.docs.faltan.length > 0) {
        secundaria = <span className="text-xs text-slate-400">{t("Faltan {n} documento(s) del cliente").replace("{n}", String(progreso.docs.faltan.length))}</span>;
      }
    } else {
      // Formularios listos → presentar. (La revisión previa se retiró del producto
      // el 22/08/2026 por decisión de Matthias.)
      prim = { kind: "avanzar", label: t("Marcar como presentado"), accion: "presentar", confirm: t("¿Marcar como presentado? Se avisará al cliente.") };
    }
  } else switch (estado) {
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
      prim = { kind: "avanzar", label: t("Marcar como presentado"), accion: "presentar", confirm: t("¿Marcar como presentado? Se avisará al cliente.") };
      break;
    case "PRESENTADO":
      prim = { kind: "avanzar", label: t("Resolución favorable"), accion: "resolver_favorable" };
      secundaria = <button onClick={async () => { if (await confirmar(t("¿Marcar como denegado?"))) avanzar("resolver_desfavorable"); }} disabled={loading} className={btnSec}>{t("Denegado")}</button>;
      break;
    case "RESUELTO":
      // La cita es un hecho, no una etapa: la acción tras la resolución es SIEMPRE
      // cerrar (tarjeta entregada). Agendar/editar la cita queda como gesto secundario
      // — antes era la acción principal y una parada más en una cola que, medido sobre
      // 79 expedientes reales, nadie recorría.
      prim = { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") };
      if (citaPresencial) {
        secundaria = <button onClick={() => abrirYScroll("citas", "citas")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white">{t(tieneCita ? "Editar la cita" : "Agendar cita")}</button>;
      }
      break;
    case "CITA_HUELLAS": prim = { kind: "avanzar", label: t("Finalizar trámite"), accion: "finalizar", confirm: t("¿Finalizar este trámite? Se avisará al cliente.") }; break;
    case "FINALIZADO":
      // El ciclo NO termina aquí: la tarjeta caduca y Vigía ya está vigilando.
      prim = { kind: "espera", label: t("Finalizado — seguimiento de renovación activado") };
      secundaria = <a href="/app/vencimientos" className="rounded-lg border border-aproba-300 px-3 py-1.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50">{t("Ver vencimientos")} →</a>;
      break;
    case "RECHAZADO":
      prim = { kind: "espera", label: t("Expediente denegado") };
      break;
    default: prim = { kind: "espera", label: t("Sin acciones pendientes") };
  }

  const actionable = prim.kind !== "espera";
  // El enlace del cliente vivía SOLO en el paso BORRADOR: en cuanto se subía un
  // documento (el cliente o el propio gestor), el expediente pasaba a DOCS_PENDIENTES
  // y el enlace se volvía irrecuperable desde la ficha. Ahora está siempre a mano,
  // salvo cuando ya es la acción principal (no duplicar el mismo botón).
  // El botón utilitario «Copiar enlace del cliente» SALIÓ de este banner (22/08, los dos
  // modos): «Siguiente paso» nombra UN gesto, no lleva herramientas permanentes. El
  // enlace no se pierde — vive ahora en la sección «Información» de la ficha, junto al
  // resto de los datos del cliente. Ojo: quitarlo sin darle otra casa habría repetido
  // el fallo de julio (746e38c), cuando el enlace era irrecuperable tras el primer
  // documento. Cuando el siguiente paso ES mandar el enlace, sigue siendo la acción
  // principal (kind "copiar"), que es otra cosa.
  async function onPrimary() {
    if (loading) return;
    if (prim.kind === "nav") router.push(prim.href);
    else if (prim.kind === "avanzar") { if (!prim.confirm || (await confirmar(prim.confirm))) avanzar(prim.accion, undefined, prim.navAfter); }
    else if (prim.kind === "ancla") abrirYScroll("documentos", prim.target, "center");
    else if (prim.kind === "copiar") copiarEnlace();
  }

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
        {secundaria && <div className="flex shrink-0 flex-wrap items-center gap-2">{secundaria}</div>}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {info && <p className="mt-2 text-xs font-medium text-aproba-700">{info}</p>}
      {enlaceEnClaro && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">{t("Tu navegador ha bloqueado el portapapeles. Selecciona el enlace y cópialo a mano:")}</p>
          <input
            readOnly
            value={enlaceEnClaro}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("Enlace del cliente")}
            className="mt-1 w-full bg-transparent font-mono text-[16px] sm:text-xs text-slate-700 outline-none"
          />
        </div>
      )}

    </div>
  );
}
