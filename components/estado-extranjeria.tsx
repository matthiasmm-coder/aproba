"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { ConsultarExtranjeria } from "@/components/consultar-extranjeria";
import { RequerimientosExpediente } from "@/components/requerimientos-expediente";
import { situacionExtranjeria } from "@/lib/extranjeria";
import type { RequerimientoRow } from "@/lib/data/requerimientos";
import type { Salida } from "@/lib/types";

export type DatosExtranjeria = {
  numeroOficial: string | null; // null = sin la migración del nº (no se ofrece «Consultar»)
  nie: string;
  fechaPresentacion: string;    // dd/mm/aaaa ("" = aún no presentado)
  fechaNacimiento: string;      // ISO
  estado: string | null;        // último estado anotado (EN_TRAMITE) o null
  estadoAt: string | null;
  requerimientos: RequerimientoRow[];
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });

// ESTADO EN EXTRANJERÍA (Matthias, 24/09/2026): la carta del ciclo, en «Preparado», reúne en
// una sola sección lo que antes vivía en tres sitios — «Consultar» (cabecera), la resolución
// (carta) y los requerimientos (sección aparte). El gestor consulta la web oficial, vuelve y
// anota en un clic lo que dice: en trámite (con la fecha), requerimiento (su plazo, con
// aviso), favorable o desfavorable (la salida de siempre, sin archivar todavía).
export function EstadoExtranjeria({ id, datos, resuelta, ocupado, registrando, onResolver, onArchivar, onCambiar, onArchivarSinResolucion, extra }: {
  id: string;
  datos: DatosExtranjeria;
  resuelta: Salida | null;
  ocupado: boolean;
  registrando: Salida | null;
  onResolver: (s: "concedido" | "denegado") => void;
  onArchivar: () => void;
  onCambiar: () => void;
  onArchivarSinResolucion: () => void;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [estado, setEstado] = useState({ estado: datos.estado, at: datos.estadoAt });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abrirReq, setAbrirReq] = useState(0);

  async function enTramite() {
    if (guardando) return;
    setGuardando(true); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${id}/estado-extranjeria`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "EN_TRAMITE" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar el estado."));
      setEstado({ estado: j.estado ?? "EN_TRAMITE", at: j.estadoAt ?? new Date().toISOString() });
      router.refresh(); // el historial de la ficha enseña la consulta
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el estado."));
    } finally { setGuardando(false); }
  }

  const sit = situacionExtranjeria({
    resuelta: resuelta === "concedido" || resuelta === "denegado" ? resuelta : null,
    requerimientos: datos.requerimientos, estado: estado.estado, estadoAt: estado.at,
  });
  const linea =
    sit.tipo === "resuelta" ? null
    : sit.tipo === "requerimiento" ? <span className="text-amber-700">{t("Requerimiento pendiente")} · {t("plazo")} {fecha(sit.fechaLimite)}</span>
    : sit.tipo === "en_tramite" ? <span className="text-slate-800">{t("En trámite")} <span className="font-normal text-slate-500">· {t("consultado el")} {fecha(sit.consultadoEl)}</span></span>
    : <span className="font-normal text-slate-400">{t("Sin respuesta registrada")}</span>;

  const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Estado en Extranjería")}</p>
          {linea && <p className="mt-0.5 text-sm font-semibold">{linea}</p>}
        </div>
        {datos.numeroOficial !== null && datos.fechaPresentacion && (
          <ConsultarExtranjeria nie={datos.nie} numeroOficial={datos.numeroOficial} fechaPresentacion={datos.fechaPresentacion} fechaNacimiento={datos.fechaNacimiento} alinear="derecha" />
        )}
      </div>

      {resuelta ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resuelta === "concedido" ? "bg-aproba-100 text-aproba-700" : "bg-red-50 text-red-600"}`}>
            {resuelta === "concedido" ? t("Resolución favorable") : t("Resolución desfavorable")}
          </span>
          <button onClick={onArchivar} disabled={ocupado} className={`${btn} bg-aproba-600 text-white hover:bg-aproba-700`}>{t("Archivar")}</button>
          <button onClick={onCambiar} disabled={ocupado} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">{t("Cambiar")}</button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs font-medium text-slate-500">{t("¿Qué dice Extranjería?")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button onClick={() => void enTramite()} disabled={ocupado || guardando} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:border-slate-400`}>
              {guardando ? "…" : t("En trámite")}
            </button>
            <button onClick={() => setAbrirReq((n) => n + 1)} disabled={ocupado} className={`${btn} border border-amber-300 bg-white text-amber-800 hover:bg-amber-50`}>
              {t("Requerimiento")}
            </button>
            <button onClick={() => onResolver("concedido")} disabled={ocupado || Boolean(registrando)} className={`${btn} bg-aproba-600 text-white hover:bg-aproba-700`}>
              {registrando === "concedido" ? "…" : t("Resolución favorable")}
            </button>
            <button onClick={() => onResolver("denegado")} disabled={ocupado || Boolean(registrando)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
              {registrando === "denegado" ? "…" : t("Resolución desfavorable")}
            </button>
            {/* Sin resolución (el cliente desistió, o se cierra en el despacho aunque siga
                en trámite): el popup de siempre, con las cuatro salidas. */}
            <button onClick={onArchivarSinResolucion} disabled={ocupado} className="ml-auto text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
              {t("Archivar sin resolución")}
            </button>
          </div>
        </>
      )}

      {/* Los requerimientos, aquí mismo: la lista con sus plazos y, al pulsar
          «Requerimiento», el formulario para anotar uno nuevo. */}
      <div className={datos.requerimientos.length || abrirReq ? "mt-4" : ""}>
        <RequerimientosExpediente expedienteId={id} inicial={datos.requerimientos} compacto abrirSenal={abrirReq} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {extra}
    </div>
  );
}
