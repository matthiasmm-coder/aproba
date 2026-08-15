"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { borrarScope, guardarAvisos } from "@/lib/config-browser";
import type { Aviso } from "@/lib/avisos";

// Estado de la config de UNA sede (servicios o avisos). Modelo COPIA, no enlace:
// Matthias 15/08 — «se copia como base y luego se hacen unas modificaciones». Al
// copiar, las filas aparecen EN esta oficina, editables. El puntero «mismas que X»
// solo sobrevive como estado legado: se puede convertir en copia o desvincular,
// pero ya no se ofrece crear nuevos.
export function ConfigDeOficina({
  oficinaId,
  nombre,
  tabla,               // ServicioConfig | AvisoConfig
  propios,             // ¿tiene filas propias?
  comoOficinaId,       // puntero legado (avisos)
  fuentesAvisos,       // [{id: null=gestoría | sedeId, nombre, avisos}] — bases copiables
  conDuplicarServicios,
  editor,              // el editor con las filas propias
}: {
  oficinaId: string;
  nombre: string;
  tabla: "ServicioConfig" | "AvisoConfig";
  propios: boolean;
  comoOficinaId: string | null;
  fuentesAvisos?: { id: string | null; nombre: string; avisos: Aviso[] }[];
  conDuplicarServicios?: boolean;
  editor: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState<string>("");

  const api = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/oficinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
  };
  const correr = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : t("No se pudo guardar.")); }
    finally { setBusy(false); }
  };

  const copiarAvisos = async (fuenteId: string | null) => {
    const fuente = (fuentesAvisos ?? []).find((f) => (f.id ?? "") === (fuenteId ?? ""));
    if (!fuente) throw new Error(t("Fuente no encontrada."));
    await guardarAvisos(fuente.avisos, oficinaId);
    if (comoOficinaId) await api({ action: "avisosComo", oficinaId, comoOficinaId: null });
  };

  // ── puntero legado : convertir en copia editable, o desvincular ──
  if (comoOficinaId && !propios) {
    const ref = (fuentesAvisos ?? []).find((f) => f.id === comoOficinaId);
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p>{t("Esta oficina usa los mismos que")} <strong>{ref?.nombre ?? "otra oficina"}</strong>.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ref && (
            <button type="button" disabled={busy} onClick={() => correr(() => copiarAvisos(comoOficinaId))}
              className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
              {busy ? t("Copiando…") : t("Convertir en copia editable")}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => correr(() => api({ action: "avisosComo", oficinaId, comoOficinaId: null }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
            {t("Desvincular")}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── heredando : elegir la base y COPIARLA (aparece aquí, editable) ──
  if (!propios) {
    const fuentes = conDuplicarServicios
      ? [{ id: "", nombre: t("los de la gestoría") }] // el server resuelve otras sedes vía duplicarServicios
      : (fuentesAvisos ?? []).map((f) => ({ id: f.id ?? "", nombre: f.nombre }));
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">{nombre}: {t("usando la configuración de la gestoría")}</p>
        <p className="mt-1 text-xs text-slate-500">
          {t("Copia una configuración como base: aparecerá aquí y podrás retocar solo lo que cambie en esta oficina.")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {conDuplicarServicios ? (
            <>
              <select value={desde} onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                <option value="">{t("Copiar los de la gestoría")}</option>
                {(fuentesAvisos ?? []).filter((f) => f.id).map((f) => <option key={f.id} value={f.id!}>{t("Copiar los de")} {f.nombre}</option>)}
              </select>
              <button type="button" disabled={busy}
                onClick={() => correr(() => api({ action: "duplicarServicios", oficinaId, desdeOficinaId: desde || null }))}
                className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                {busy ? t("Copiando…") : t("Copiar y personalizar")}
              </button>
            </>
          ) : (
            <>
              <select value={desde} onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
                {fuentes.map((f) => <option key={f.id} value={f.id}>{t("Copiar los de")} {f.nombre}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => correr(() => copiarAvisos(desde || null))}
                className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
                {busy ? t("Copiando…") : t("Copiar y personalizar")}
              </button>
            </>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── config propia : el contenido REAL, editable ──
  return (
    <div>
      {editor}
      <div className="mt-4">
        <button type="button" disabled={busy}
          onClick={async () => {
            if (!(await confirmar(t("¿Quitar la configuración propia de esta oficina? Volverá a heredar la de la gestoría.")))) return;
            await correr(() => borrarScope(tabla, oficinaId));
          }}
          className="text-xs font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-50">
          {t("Quitar configuración propia (volver a heredar)")}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
