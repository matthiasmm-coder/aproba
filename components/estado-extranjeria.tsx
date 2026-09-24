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

// Una respuesta posible de Extranjería: pastilla sobria con su punto de color (el color dice
// qué es; la pastilla no grita — antes eran cuatro botones grandes de colores).
function Respuesta({ punto, onClick, disabled, children }: { punto: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60">
      <span className={`h-2 w-2 shrink-0 rounded-full ${punto}`} />
      {children}
    </button>
  );
}

// ESTADO EN EXTRANJERÍA (Matthias, 24/09/2026): la carta del ciclo, en «Preparado», reúne en
// una sola sección lo que antes vivía en tres sitios — «Consultar» (cabecera), la resolución
// (carta) y los requerimientos (sección aparte). Arriba, lo último que se sabe y «Consultar»;
// en medio, «¿Qué dice Extranjería?» en un clic; abajo, lo secundario.
export function EstadoExtranjeria({ id, datos, resuelta, ocupado, registrando, onResolver, onArchivar, onCambiar, onArchivarSinResolucion, onRetirar, error: errorExterno }: {
  id: string;
  datos: DatosExtranjeria;
  resuelta: Salida | null;
  ocupado: boolean;
  registrando: Salida | null;
  onResolver: (s: "concedido" | "denegado") => void;
  onArchivar: () => void;
  onCambiar: () => void;
  onArchivarSinResolucion: () => void;
  onRetirar?: (() => void) | null; // «Devolver a Preparación» (solo validado a mano)
  error?: string | null;
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
  const [punto, titulo, detalle] =
    sit.tipo === "resuelta"
      ? (sit.salida === "concedido" ? ["bg-aproba-600", t("Resolución favorable"), null] : ["bg-red-500", t("Resolución desfavorable"), null])
    : sit.tipo === "requerimiento" ? ["bg-amber-500", t("Requerimiento pendiente"), `${t("plazo")} ${fecha(sit.fechaLimite)}`]
    : sit.tipo === "en_tramite" ? ["bg-sky-500", t("En trámite"), `${t("consultado el")} ${fecha(sit.consultadoEl)}`]
    : ["bg-slate-300", t("Sin respuesta registrada"), null];

  const mensaje = error ?? errorExterno ?? null;
  const secundarias = [
    !resuelta ? <button key="sin" onClick={onArchivarSinResolucion} disabled={ocupado} className="transition hover:text-slate-600 disabled:opacity-60">{t("Archivar sin resolución")}</button> : null,
    onRetirar ? <button key="ret" onClick={onRetirar} disabled={ocupado} className="transition hover:text-slate-600 disabled:opacity-60">{t("Devolver a Preparación")}</button> : null,
  ].filter(Boolean);

  return (
    <div>
      {/* Lo último que se sabe + «Consultar» */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Estado en Extranjería")}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${punto}`} />
            <span className={`font-semibold ${sit.tipo === "sin_respuesta" ? "text-slate-500" : "text-slate-900"}`}>{titulo}</span>
            {detalle && <span className="text-sm text-slate-500">· {detalle}</span>}
          </p>
        </div>
        {datos.numeroOficial !== null && (
          <ConsultarExtranjeria nie={datos.nie} numeroOficial={datos.numeroOficial} fechaPresentacion={datos.fechaPresentacion} fechaNacimiento={datos.fechaNacimiento} alinear="derecha" />
        )}
      </div>

      {/* La respuesta, en un clic (o, ya resuelto, el siguiente paso: archivar) */}
      {resuelta ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={onArchivar} disabled={ocupado} className="rounded-lg bg-aproba-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">{t("Archivar")}</button>
          <button onClick={onCambiar} disabled={ocupado} className="text-xs font-medium text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline disabled:opacity-60">{t("Cambiar")}</button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="w-full text-xs font-medium text-slate-500 sm:mr-1 sm:w-auto">{t("¿Qué dice Extranjería?")}</span>
          <Respuesta punto="bg-sky-500" onClick={() => void enTramite()} disabled={ocupado || guardando}>{guardando ? "…" : t("En trámite")}</Respuesta>
          <Respuesta punto="bg-amber-500" onClick={() => setAbrirReq((n) => n + 1)} disabled={ocupado}>{t("Requerimiento")}</Respuesta>
          <Respuesta punto="bg-aproba-600" onClick={() => onResolver("concedido")} disabled={ocupado || Boolean(registrando)}>{registrando === "concedido" ? "…" : t("Favorable")}</Respuesta>
          <Respuesta punto="bg-red-500" onClick={() => onResolver("denegado")} disabled={ocupado || Boolean(registrando)}>{registrando === "denegado" ? "…" : t("Desfavorable")}</Respuesta>
        </div>
      )}

      {/* Los requerimientos, aquí mismo: la lista con sus plazos y, al pulsar
          «Requerimiento», el formulario para anotar uno nuevo. */}
      <div className={datos.requerimientos.length || abrirReq ? "mt-4" : ""}>
        <RequerimientosExpediente expedienteId={id} inicial={datos.requerimientos} compacto abrirSenal={abrirReq} />
      </div>
      {mensaje && <p role="alert" className="mt-3 text-xs text-red-600">{mensaje}</p>}

      {/* Lo secundario, discreto y en su sitio. */}
      {secundarias.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs font-medium text-slate-400">
          {secundarias.map((b, i) => <span key={i} className="inline-flex items-center gap-3">{i > 0 && <span aria-hidden="true">·</span>}{b}</span>)}
        </div>
      )}
    </div>
  );
}
