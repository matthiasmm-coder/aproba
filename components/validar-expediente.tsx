"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import { CerrarExpedienteDialog } from "@/components/cerrar-expediente-dialog";
import { normalizarEstado, type Progreso } from "@/lib/progreso";
import { etiquetaSalida, salidaDeEstado, type Salida } from "@/lib/types";
import { setArchivadoServidor } from "@/lib/archivo";
import { EstadoExtranjeria, type DatosExtranjeria } from "@/components/estado-extranjeria";
import { RequerimientosExpediente } from "@/components/requerimientos-expediente";

// Carta de completitud Y del ciclo (flujo v4, 03/09/2026, decisiones de Matthias): una
// sola línea — anillo con el % dentro, las tres partes y EL botón del momento.
//   Preparación → «Marcar como preparado» (validación manual: empuja de columna sin tocar
//                 el %).
//   Preparado   → «Archivar»: popup con la SALIDA del expediente, la factura
//                 final si queda resto y el aviso al cliente. Único gesto de cierre.
//   Archivado   → chip con la salida + «Restaurar».
// La respuesta de la Administración ya no es una etapa: se registra como salida (o se
// reclasifica desde Archivados cuando llega).
// 24/09/2026 (Matthias): en «Preparado» la carta ES la sección «Estado en Extranjería»
// (components/estado-extranjeria.tsx) — consulta oficial, respuesta y requerimientos juntos.
export function ValidarExpediente({ id, estado, fase, completitud, finalizacion, referencia, archivado = false, salida = null, extranjeria }: {
  id: string;
  estado: string;
  fase: string; // "preparacion" | "preparado" (lib/progreso.ts)
  completitud: Progreso["completitud"];
  // Para el popup de cierre: qué queda por facturar y a quién avisar.
  finalizacion: { resto: number; puedeFacturar: boolean; clienteEmail: string };
  referencia?: string;
  archivado?: boolean;
  salida?: string | null;     // Expediente.salida (o null antes de la migración)
  extranjeria?: DatosExtranjeria; // sección unificada (sin ella: los botones de siempre)
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [faseCierre, setFaseCierre] = useState("");
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ salida: Salida; enviado?: string; factura?: { numero: string; total: number } | null } | null>(null);
  // RESOLUCIÓN antes de archivar (petición de Jennifer, 18/09/2026): primero se registra
  // si la Administración resolvió a favor o en contra, y solo después se archiva — el
  // popup ya únicamente pregunta por el dinero pendiente.
  const [resolucion, setResolucion] = useState<Salida | null>(null);
  const [registrando, setRegistrando] = useState<Salida | null>(null);
  const [libre, setLibre] = useState(false); // archivar sin resolución (en trámite, desistido)
  // «Cambiar» una resolución ya registrada: vuelve a enseñar los botones aunque el servidor
  // la tenga (antes solo borraba el estado local, y tras recargar no hacía nada).
  const [cambiando, setCambiando] = useState(false);

  async function validar(validado: boolean) {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/validar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validado }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo validar el expediente.")); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo validar el expediente."));
    } finally { setLoading(false); }
  }

  // Registrar la resolución SIN archivar: el expediente sigue vivo, pero ya consta cómo
  // ha resuelto la Administración (Vigía siembra la renovación desde aquí, no al archivar).
  async function registrarResolucion(s: Salida) {
    if (loading || registrando) return;
    setRegistrando(s); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/salida`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salida: s }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("No se pudo registrar la resolución."));
      setResolucion(s);
      setCambiando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo registrar la resolución."));
    } finally { setRegistrando(null); }
  }

  async function restaurar() {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      if (!(await setArchivadoServidor(id, false))) throw new Error(t("No se pudo restaurar el expediente."));
      setHecho(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo restaurar el expediente."));
    } finally { setLoading(false); }
  }

  // Cierre en un gesto: (1) factura final si procede, (2) salida + archivo, (3) email de
  // cierre combinado cuando es «concedido» (finalización + factura), como el antiguo
  // «Finalizar y archivar». Para las demás salidas, la factura sale con su propia
  // solicitud de pago y el aviso lo dispara el servidor según la salida.
  async function cerrar({ salida: s, facturar, avisar }: { salida: Salida; facturar: boolean; avisar: boolean }) {
    if (loading) return;
    setLoading(true); setErrorCierre(null);
    try {
      let facturaId: string | undefined;
      const combinado = s === "concedido" && avisar && Boolean(finalizacion.clienteEmail);
      if (facturar) {
        setFaseCierre(t("Emitiendo la factura…"));
        const rP = await fetch("/api/pagos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expedienteId: id, momento: "FINAL", sinEmail: combinado || !avisar }),
        });
        const dP = await rP.json().catch(() => ({}));
        if (!rP.ok) throw new Error(dP.error ?? t("No se pudo emitir la factura."));
        facturaId = dP.facturaId;
      }
      setFaseCierre(t("Archivando…"));
      const rC = await fetch(`/api/expedientes/${id}/cerrar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salida: s, avisar }),
      });
      const dC = await rC.json().catch(() => ({}));
      if (!rC.ok) throw new Error(dC.error ?? t("No se pudo cerrar el expediente."));
      let enviado: string | undefined;
      let factura: { numero: string; total: number } | null = null;
      if (combinado) {
        setFaseCierre(t("Enviando el email al cliente…"));
        const rE = await fetch(`/api/expedientes/${id}/finalizar-email`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(facturaId ? { facturaId } : {}),
        });
        const dE = await rE.json().catch(() => ({}));
        if (!rE.ok) throw new Error(dE.error ?? t("No se pudo enviar el email de finalización."));
        enviado = dE.enviado; factura = dE.factura ?? null;
      }
      setHecho({ salida: s, enviado, factura });
      setDialogo(false);
      router.refresh();
    } catch (e) {
      setErrorCierre(e instanceof Error ? e.message : t("No se pudo completar el cierre."));
    } finally { setLoading(false); setFaseCierre(""); }
  }

  // Coca verde cuando la parte está lista; círculo hueco gris mientras no.
  const pieza = (label: string, listo: boolean) => (
    <span className={`inline-flex items-center gap-1.5 text-xs ${listo ? "font-medium text-aproba-700" : "text-slate-400"}`}>
      {listo ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-aproba-600 text-white">
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      ) : (
        <span className="h-4 w-4 rounded-full border-2 border-slate-200" />
      )}
      {t(label)}
    </span>
  );

  const est = normalizarEstado(estado);
  const resueltaActual: Salida | null = cambiando ? null : (resolucion
    ?? ((salida === "concedido" || salida === "denegado") ? (salida as Salida) : null)
    ?? (salidaDeEstado(estado) === "concedido" || salidaDeEstado(estado) === "denegado" ? salidaDeEstado(estado) : null));
  const primario = "rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60";
  const borde = "rounded-lg border border-aproba-300 px-3.5 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-60";
  const cerrado = archivado || Boolean(hecho);
  const salidaMostrada = hecho?.salida ?? salida ?? salidaDeEstado(estado);

  // «Pedir al cliente»: el mismo mensaje de WhatsApp que el alta, con su enlace /j.

  const retirar = completitud.manual && est === "EN_PREPARACION" && (
    <button onClick={() => validar(false)} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60" title={t("Devolver a Preparación")}>
      {t("Retirar")}
    </button>
  );
  const popupCierre = dialogo && (
    <CerrarExpedienteDialog
      referencia={referencia ?? ""}
      salidaFijada={libre ? null : resueltaActual}
      factura={finalizacion}
      busy={loading}
      fase={faseCierre}
      error={errorCierre}
      onClose={() => { if (!loading) setDialogo(false); }}
      onConfirm={cerrar}
    />
  );

  // «Preparado» con la sección unificada: estado en Extranjería + resolución + requerimientos.
  if (!cerrado && fase === "preparado" && extranjeria) {
    return (
      <>
        <EstadoExtranjeria
          id={id} datos={extranjeria} resuelta={resueltaActual} ocupado={loading} registrando={registrando}
          onResolver={(s) => void registrarResolucion(s)}
          onArchivar={() => { setErrorCierre(null); setLibre(false); setDialogo(true); }}
          onCambiar={() => { setResolucion(null); setCambiando(true); }}
          onArchivarSinResolucion={() => { setErrorCierre(null); setLibre(true); setDialogo(true); }}
          onRetirar={completitud.manual && est === "EN_PREPARACION" ? () => void validar(false) : null}
          error={error}
        />
        {popupCierre}
      </>
    );
  }

  let acciones: React.ReactNode;
  if (cerrado) {
    acciones = (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {t("Archivado")}{salidaMostrada ? ` · ${t(etiquetaSalida(salidaMostrada) ?? "")}` : ""}
        </span>
        {hecho?.enviado && hecho.enviado !== "SIN_CONTACTO" && (
          <span className="text-xs text-slate-500">{t("Email de finalización enviado")}{hecho.factura ? ` · ${t("factura")} ${hecho.factura.numero}` : ""}</span>
        )}
        <button onClick={restaurar} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">{t("Restaurar")}</button>
      </div>
    );
  } else if (fase !== "preparado") {
    acciones = (
      <button onClick={() => validar(true)} disabled={loading} className={borde}>
        {loading ? "…" : t("Marcar como preparado")}
      </button>
    );
  } else {
    // La resolución ya registrada (local, o la columna del expediente/estado).
    const resuelta = resueltaActual;
    acciones = (
      <>
        {resuelta ? (
          <>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resuelta === "concedido" ? "bg-aproba-100 text-aproba-700" : "bg-red-50 text-red-600"}`}>
              {resuelta === "concedido" ? t("Resolución favorable") : t("Resolución desfavorable")}
            </span>
            <button onClick={() => { setErrorCierre(null); setLibre(false); setDialogo(true); }} disabled={loading} className={primario}>
              {t("Archivar")}
            </button>
            <button onClick={() => { setResolucion(null); setCambiando(true); }} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
              {t("Cambiar")}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => void registrarResolucion("concedido")} disabled={loading || Boolean(registrando)} className={primario}>
              {registrando === "concedido" ? "…" : t("Resolución favorable")}
            </button>
            <button onClick={() => void registrarResolucion("denegado")} disabled={loading || Boolean(registrando)} className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
              {registrando === "denegado" ? "…" : t("Resolución desfavorable")}
            </button>
            {/* Sin resolución todavía (presentado y pendiente, o el cliente desistió): el
                popup de siempre, con las cuatro salidas. */}
            <button onClick={() => { setErrorCierre(null); setLibre(true); setDialogo(true); }} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60">
              {t("Archivar sin resolución")}
            </button>
          </>
        )}
        {retirar}
      </>
    );
  }

  // En Preparado el % y las tres partes sobran (pedido de Matthias): lo preparado está
  // preparado — la carta se queda con el gesto de cierre.
  const enPreparacion = !cerrado && fase !== "preparado";

  return (
    // TODO en una línea (anillo · partes · botón del momento) — con flex-wrap para que
    // el móvil pliegue sin desbordar.
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {enPreparacion && (
        <>
          <AnilloCompletitud pct={completitud.pct} size={44} />
          {pieza("Información", completitud.info >= 1)}
          {pieza("Documentos", completitud.docs >= 1)}
          {pieza("Formularios", completitud.formularios >= 1)}
          {completitud.pct === 100 && completitud.real < 100 && (
            <p className="w-full text-center text-xs text-amber-700">
              {t("Parte de los documentos o datos necesarios para el expediente no está en la plataforma.")}
            </p>
          )}
        </>
      )}
      {acciones}
      {error && <p role="alert" className="w-full text-center text-xs text-red-600">{error}</p>}
      {/* Requerimientos fuera de «Preparado» (raro: antes de preparar, o ya archivado). */}
      {extranjeria && extranjeria.requerimientos.length > 0 && (
        <div className="w-full border-t border-slate-100 pt-3">
          <RequerimientosExpediente expedienteId={id} inicial={extranjeria.requerimientos} compacto={cerrado} />
        </div>
      )}
      {popupCierre}
    </div>
  );
}
