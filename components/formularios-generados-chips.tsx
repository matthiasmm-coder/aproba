"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

// Chips de los formularios GENERADOS en la ficha del expediente: descarga directa del
// PDF oficial relleno (editable) + × para quitarlo de la lista. Incluye la tasa 790-012
// guardada (también en familia: si tasaPath existe es un resto del flujo individual —
// mejor visible y borrable que huérfano). Familiar: el chip de formulario lleva a la
// página Formularios (un juego por solicitante).
export function FormulariosGeneradosChips({ expedienteId, formularios, esFamilia, tieneTasa, porMiembro = null, miembros = [], tasaMiembros = [] }: {
  expedienteId: string;
  formularios: { code: string; tipo: string }[];
  esFamilia: boolean;
  porMiembro?: Record<string, string[]> | null; // curación por miembro (familia heterogénea)
  miembros?: { id: string; nombre: string }[];
  tieneTasa: boolean;
  tasaMiembros?: string[]; // miembros con tasa 790 NOMINATIVA guardada (storage)
}) {
  const t = useT();
  const router = useRouter();
  // Un solo borrado a la vez: mientras hay uno en vuelo TODAS las × se desactivan
  // (dos DELETE concurrentes sobre la misma lista se pisarían — read-modify-write).
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(clave: string, req: () => Promise<Response>) {
    setBorrando(clave); setError(null);
    try {
      const res = await req();
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo quitar."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo quitar."));
    } finally { setBorrando(null); }
  }

  async function quitarFormulario(code: string, clienteId?: string) {
    if (!(await confirmar({ mensaje: t("¿Quitar {code} de los formularios generados?").replace("{code}", code), peligro: true, confirmarLabel: t("Quitar") }))) return;
    void ejecutar(code, () => fetch(`/api/expedientes/${expedienteId}/formularios`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ...(clienteId ? { clienteId } : {}) }) }));
  }

  // Ruta propia (no comparte el espacio de nombres de los códigos EX): borra el PDF del
  // bucket y limpia tasaPath.
  async function quitarTasa(clienteId?: string) {
    if (!(await confirmar({ mensaje: t("¿Quitar {code} de los formularios generados?").replace("{code}", t("la tasa 790-012")), peligro: true, confirmarLabel: t("Quitar") }))) return;
    void ejecutar(`tasa${clienteId ?? ""}`, () => fetch(`/api/expedientes/${expedienteId}/tasa${clienteId ? `?clienteId=${clienteId}` : ""}`, { method: "DELETE" }));
  }

  const chipCls = "flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-aproba-300 hover:shadow-sm";
  const bodyCls = "flex items-center gap-2 px-4 py-2.5";
  const xCls = "self-stretch border-l border-slate-100 px-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50";
  const IconDl = <svg className="h-4 w-4 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
  const IconX = <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
  const enVuelo = borrando !== null;

  // Familia heterogénea con curación por miembro (o tasas nominativas): TODOS los
  // solicitantes listados — chips de SUS formularios + SU tasa 790, y «Sin generar»
  // para quien aún no tiene nada (pedido de Matthias).
  if (esFamilia && miembros.length && (porMiembro || tasaMiembros.length)) {
    const pm = porMiembro ?? {};
    return (
      <div className="space-y-3">
        {miembros.map((mb) => {
          const codes = pm[mb.id] ?? [];
          const conTasa = tasaMiembros.includes(mb.id);
          return (
            <div key={mb.id}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {mb.nombre}
                {!codes.length && !conTasa && <span className="ml-2 font-normal normal-case tracking-normal text-slate-300">· {t("Sin generar")}</span>}
              </p>
              {(codes.length > 0 || conTasa) && (
                <div className="flex flex-wrap gap-3">
                  {codes.map((code) => (
                    <span key={code} className={chipCls}>
                      <a href={`/api/expedientes/${expedienteId}/formularios?tipo=${encodeURIComponent(code)}&modo=oficial&clienteId=${mb.id}`} className={bodyCls}>
                        {IconDl}
                        <span className="text-sm font-medium text-slate-700">{code}</span>
                      </a>
                      <button onClick={() => quitarFormulario(code, mb.id)} disabled={enVuelo} aria-label={`${t("Quitar")} ${code}`} className={xCls}>{IconX}</button>
                    </span>
                  ))}
                  {conTasa && (
                    <span className={chipCls}>
                      <a href={`/api/expedientes/${expedienteId}/tasa?clienteId=${mb.id}`} title={t("Descargar la tasa oficial guardada")} className={bodyCls}>
                        {IconDl}
                        <span className="text-sm font-medium text-slate-700">{t("Tasa 790-012")}</span>
                        <span className="text-xs text-aproba-700">PDF</span>
                      </a>
                      <button onClick={() => quitarTasa(mb.id)} disabled={enVuelo} aria-busy={borrando === `tasa${mb.id}`} aria-label={`${t("Quitar")} ${t("Tasa 790-012")}`} className={xCls}>
                        {borrando === `tasa${mb.id}` ? <span className="text-xs">…</span> : IconX}
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {formularios.map((f) => (
          <span key={f.code} className={chipCls}>
            {esFamilia ? (
              <Link href={`/app/expedientes/${expedienteId}/formularios`} className={bodyCls}>
                {IconDl}
                <span className="text-sm font-medium text-slate-700">{f.code}</span>
                <span className="text-xs text-aproba-700">{t("por solicitante →")}</span>
              </Link>
            ) : (
              <a
                href={`/api/expedientes/${expedienteId}/formularios?tipo=${encodeURIComponent(f.code)}&modo=oficial`}
                title={t("Descargar el PDF relleno (editable en tu lector de PDF)")}
                className={bodyCls}
              >
                {IconDl}
                <span className="text-sm font-medium text-slate-700">{f.code}</span>
                <span className="text-xs text-aproba-700">{t("PDF editable")}</span>
              </a>
            )}
            <button onClick={() => quitarFormulario(f.code)} disabled={enVuelo} aria-busy={borrando === f.code} aria-label={`${t("Quitar")} ${f.code}`} title={`${t("Quitar")} ${f.code}`} className={xCls}>
              {borrando === f.code ? <span className="text-xs">…</span> : IconX}
            </button>
          </span>
        ))}
        {tieneTasa && (
          <span className={chipCls}>
            <a href={`/api/expedientes/${expedienteId}/tasa`} title={t("Descargar la tasa oficial guardada")} className={bodyCls}>
              {IconDl}
              <span className="text-sm font-medium text-slate-700">{t("Tasa 790-012")}</span>
              <span className="text-xs text-aproba-700">PDF</span>
            </a>
            <button onClick={() => quitarTasa()} disabled={enVuelo} aria-busy={borrando === "tasa"} aria-label={`${t("Quitar")} ${t("Tasa 790-012")}`} title={`${t("Quitar")} ${t("Tasa 790-012")}`} className={xCls}>
              {borrando === "tasa" ? <span className="text-xs">…</span> : IconX}
            </button>
          </span>
        )}
      </div>
      <span role="status" className="sr-only">{enVuelo ? t("Quitando…") : ""}</span>
      {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
