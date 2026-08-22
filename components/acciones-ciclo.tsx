"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { normalizarEstado, type Progreso } from "@/lib/progreso";

// LOS TRES CLICS DEL CICLO, y solo esos (22/08/2026).
//
// Vivían en el banner «Siguiente paso», que Matthias pidió retirar de la ficha. El
// banner se va, pero estas acciones NO pueden irse con él: presentar, resolver y
// finalizar son lo único que el producto no puede deducir de los hechos, y sin ellas
// un expediente no avanzaría jamás (la extensión de Mercurio solo cubre «presentado»).
//
// Lo que SÍ desaparece con el banner: las navegaciones (generar formularios, subir
// documentos) — cada una vive ya en su propia sección de la ficha, así que repetirlas
// arriba era ruido. Aquí solo quedan las decisiones del gestor sobre el mundo real.

export function AccionesCiclo({ id, estado, progreso }: {
  id: string;
  estado: string;
  progreso?: Progreso;
}) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo completar la acción."));
    } finally { setLoading(false); }
  }

  const est = normalizarEstado(estado);
  const primario = "rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60";
  const secundario = "rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-60";

  let botones: React.ReactNode = null;
  if (est === "EN_PREPARACION" && progreso?.accion.clave === "presentar") {
    botones = (
      <button disabled={loading} onClick={() => avanzar("presentar", t("¿Marcar como presentado? Se avisará al cliente."))} className={primario}>
        {t("Marcar como presentado")}
      </button>
    );
  } else if (est === "PRESENTADO") {
    botones = (
      <>
        <button disabled={loading} onClick={() => avanzar("resolver_favorable")} className={primario}>{t("Resolución favorable")}</button>
        <button disabled={loading} onClick={() => avanzar("resolver_desfavorable", t("¿Marcar como denegado?"))} className={secundario}>{t("Denegado")}</button>
      </>
    );
  } else if (est === "RESUELTO") {
    botones = (
      <button disabled={loading} onClick={() => avanzar("finalizar", t("¿Finalizar este trámite? Se avisará al cliente."))} className={primario}>
        {t("Finalizar trámite")}
      </button>
    );
  }

  if (!botones) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-2">{botones}</div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
