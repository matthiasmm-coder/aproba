"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { AnilloCompletitud } from "@/components/anillo-completitud";
import { FinalizarArchivar } from "@/components/finalizar-archivar";
import { normalizarEstado, type Progreso } from "@/lib/progreso";

// Carta de completitud Y del ciclo (rediseño 22/08 en dos tiempos, pedidos de Matthias):
// una sola línea — anillo con el % dentro, las tres partes con su coca verde, y EL botón
// del momento. El botón sigue al expediente por el tablero:
//   Preparación          → «Marcar como listo para presentar» (validación manual — NO
//                          toca el %, solo empuja de columna; reversible con «Retirar»)
//   Listo para presentar → «Marcar como presentado»
//   Presentado           → «Marcar como aceptado» / «Marcar como denegado» (rojo)
//   Resultado            → «Finalizar y archivar» (popup: ¿facturar lo pendiente? + email de cierre)
// Antes convivían dos juegos de botones (esta carta + AccionesCiclo en la cabecera) y
// la carta seguía ofreciendo «listo para presentar» a un expediente que YA estaba en esa
// columna — lo señaló Matthias. AccionesCiclo ya no existe: el ciclo entero vive aquí.
export function ValidarExpediente({ id, estado, fase, completitud, finalizacion }: {
  id: string;
  estado: string;
  fase: string; // clave de faseDe() — ⚠️ la clave `recepcion` se ETIQUETA «Preparación»
  completitud: Progreso["completitud"];
  // Para el popup de cierre (columna Resultado): qué queda por facturar y a quién avisar.
  finalizacion: { resto: number; puedeFacturar: boolean; clienteEmail: string };
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function avanzar(accion: string, confirmMsg?: string) {
    if (loading) return;
    if (confirmMsg && !(await confirmar(confirmMsg))) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? t("No se pudo completar la acción.")); }
      // «La resolución paga»: aceptar encadena con el popup de la liquidación final.
      // El listener (cobros-panel) solo lo abre si de verdad queda algo por cobrar.
      if (accion === "resolver_favorable") window.dispatchEvent(new Event("abrir-pago-final"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally { setLoading(false); }
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

  let acciones: React.ReactNode;
  if (est === "PRESENTADO") {
    acciones = (
      <>
        <button onClick={() => avanzar("resolver_favorable")} disabled={loading} className={primario}>
          {loading ? "…" : t("Marcar como aceptado")}
        </button>
        <button onClick={() => avanzar("resolver_desfavorable", t("¿Marcar como denegado?"))} disabled={loading} className="rounded-lg border border-red-300 px-3.5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
          {loading ? "…" : t("Marcar como denegado")}
        </button>
      </>
    );
  } else if (est !== "EN_PREPARACION") {
    // RESUELTO / RECHAZADO / FINALIZADO: cerrar en un gesto — facturar lo pendiente
    // (si lo hay), email de finalización y archivo.
    acciones = <FinalizarArchivar expedienteId={id} estado={estado} resto={finalizacion.resto} puedeFacturar={finalizacion.puedeFacturar} clienteEmail={finalizacion.clienteEmail} />;
  } else if (fase === "recepcion") {
    // Columna «1. Preparación» (clave recepcion): validación manual.
    acciones = (
      <button onClick={() => validar(true)} disabled={loading} className={borde}>
        {loading ? "…" : t("Marcar como listo para presentar")}
      </button>
    );
  } else {
    // Columna «2. Listo para presentar»: el siguiente paso es presentarlo de verdad.
    acciones = (
      <>
        <button onClick={() => avanzar("presentar", t("¿Marcar como presentado? Se avisará al cliente."))} disabled={loading} className={primario}>
          {loading ? "…" : t("Marcar como presentado")}
        </button>
        {completitud.manual && (
          <button onClick={() => validar(false)} disabled={loading} className="text-xs font-medium text-slate-400 underline transition hover:text-slate-600 disabled:opacity-60" title={t("Devolver a Preparación")}>
            {t("Retirar")}
          </button>
        )}
      </>
    );
  }

  // En Presentado/Resultado el % y las tres partes sobran (pedido de Matthias): lo
  // depositado está depositado — la carta se queda solo con las decisiones del ciclo.
  const enPreparacion = est === "EN_PREPARACION";

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
        </>
      )}
      {acciones}
      {error && <p role="alert" className="w-full text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
