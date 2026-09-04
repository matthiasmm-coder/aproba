"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import { CerrarExpedienteDialog } from "@/components/cerrar-expediente-dialog";
import { normalizarEstado, type Progreso } from "@/lib/progreso";
import { etiquetaSalida, salidaDeEstado, type Salida } from "@/lib/types";
import { setArchivadoServidor } from "@/lib/archivo";

// Carta de completitud Y del ciclo (flujo v4, 03/09/2026, decisiones de Matthias): una
// sola línea — anillo con el % dentro, las tres partes y EL botón del momento.
//   Preparación → «Marcar como preparado» (validación manual: empuja de columna sin tocar
//                 el %).
//   Preparado   → «Facturar y archivar»: popup con la SALIDA del expediente, la factura
//                 final si queda resto y el aviso al cliente. Único gesto de cierre.
//   Archivado   → chip con la salida + «Restaurar».
// La respuesta de la Administración ya no es una etapa: se registra como salida (o se
// reclasifica desde Archivados cuando llega).
export function ValidarExpediente({ id, estado, fase, completitud, finalizacion, referencia, archivado = false, salida = null }: {
  id: string;
  estado: string;
  fase: string; // "preparacion" | "preparado" (lib/progreso.ts)
  completitud: Progreso["completitud"];
  // Para el popup de cierre: qué queda por facturar y a quién avisar.
  finalizacion: { resto: number; puedeFacturar: boolean; clienteEmail: string };
  referencia?: string;
  archivado?: boolean;
  salida?: string | null;     // Expediente.salida (o null antes de la migración)
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [faseCierre, setFaseCierre] = useState("");
  const [errorCierre, setErrorCierre] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ salida: Salida; enviado?: string; factura?: { numero: string; total: number } | null } | null>(null);

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
  const primario = "rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60";
  const borde = "rounded-lg border border-aproba-300 px-3.5 py-2 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-60";
  const cerrado = archivado || Boolean(hecho);
  const salidaMostrada = hecho?.salida ?? salida ?? salidaDeEstado(estado);

  // «Pedir al cliente»: el mismo mensaje de WhatsApp que el alta, con su enlace /j.

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
    acciones = (
      <>
        <button onClick={() => { setErrorCierre(null); setDialogo(true); }} disabled={loading} className={primario}>
          {t("Facturar y archivar")}
        </button>
        {completitud.manual && est === "EN_PREPARACION" && (
          <button onClick={() => validar(false)} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60" title={t("Devolver a Preparación")}>
            {t("Retirar")}
          </button>
        )}
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
      {dialogo && (
        <CerrarExpedienteDialog
          referencia={referencia ?? ""}
          factura={finalizacion}
          busy={loading}
          fase={faseCierre}
          error={errorCierre}
          onClose={() => { if (!loading) setDialogo(false); }}
          onConfirm={cerrar}
        />
      )}
    </div>
  );
}
