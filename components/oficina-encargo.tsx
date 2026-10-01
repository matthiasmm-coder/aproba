"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { VistaPrevia } from "@/components/encargo-config";

// Hoja de encargo/mandato de UNA sede — modelo COPIA (Matthias 15/08): se copia un
// bloque como base (de la gestoría o de otra sede), aparece AQUÍ editable, y se
// retoca lo que cambie. El puntero «la misma que X» solo sobrevive como estado
// legado: convertir en copia o desvincular.
// mandatoActivo (27/09/2026): el interruptor del mandato de la sede; null = sigue a su hoja.
type Datos = { hojaEncargoActiva: boolean | null; mandatoActivo: boolean | null; mandatarioNombre: string; mandatarioDni: string; mandatarioColegiado: string; mandatarioColegio: string; encargoFormasPago: string };
export type FuenteEncargo = { id: string | null; nombre: string; bloque: Omit<Datos, "hojaEncargoActiva" | "mandatoActivo"> & { hojaEncargoActiva: boolean; mandatoActivo: boolean } };

export function OficinaEncargo({ oficinaId, nombre, inicial, comoOficinaId, fuentes }: {
  oficinaId: string; nombre: string; inicial: Datos; comoOficinaId: string | null;
  fuentes: FuenteEncargo[];
}) {
  const t = useT();
  const router = useRouter();
  const [d, setD] = useState<Datos>(inicial);
  const [desde, setDesde] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propio = d.hojaEncargoActiva !== null;
  // Vista previa de los documentos de ESTA sede (01/10/2026): lo guardado; si hay cambios, se
  // guardan antes de abrirla (la pestaña se abre en el mismo clic para que no la bloqueen).
  const guardado = useRef(JSON.stringify(inicial));
  async function verPrevia(qs: string) {
    const url = `/api/ajustes/encargo/vista-previa?${qs}&oficina=${encodeURIComponent(oficinaId)}`;
    if (JSON.stringify(d) === guardado.current) { window.open(url, "_blank", "noopener"); return; }
    const w = window.open("", "_blank");
    try {
      await api({ action: "encargo", oficinaId, ...d });
      guardado.current = JSON.stringify(d);
      if (w) w.location.href = url;
    } catch (e) {
      w?.close();
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    }
  }

  async function api(body: Record<string, unknown>) {
    const r = await fetch("/api/oficinas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
  }
  async function correr(fn: () => Promise<void>, conOk = false) {
    setBusy(true); setError(null); setOk(false);
    try {
      await fn();
      if (conOk) { setOk(true); window.setTimeout(() => setOk(false), 2500); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }

  const copiar = async (fuenteId: string | null) => {
    const f = fuentes.find((x) => (x.id ?? "") === (fuenteId ?? ""));
    if (!f) throw new Error(t("Fuente no encontrada."));
    const nuevo: Datos = { ...f.bloque };
    setD(nuevo);
    await api({ action: "encargo", oficinaId, ...nuevo });
    if (comoOficinaId) await api({ action: "encargoComo", oficinaId, comoOficinaId: null });
  };

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
  const lbl = "mb-1 block text-xs font-medium text-slate-500";

  // ── puntero legado ──
  if (comoOficinaId && !propio) {
    const ref = fuentes.find((o) => o.id === comoOficinaId);
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p>{t("Esta oficina usa la misma hoja de encargo que")} <strong>{ref?.nombre ?? "otra oficina"}</strong>.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ref && (
            <button type="button" disabled={busy} onClick={() => correr(() => copiar(comoOficinaId))}
              className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
              {busy ? t("Copiando…") : t("Convertir en copia editable")}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => correr(() => api({ action: "encargoComo", oficinaId, comoOficinaId: null }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50">
            {t("Desvincular")}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── heredando : copier une base ──
  if (!propio) {
    return (
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3.5 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">{nombre}: {t("usando la hoja de encargo de la gestoría")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("Copia una configuración como base: aparecerá aquí y podrás retocar el mandatario o las formas de pago de esta oficina.")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600">
            {fuentes.map((f) => <option key={f.id ?? "g"} value={f.id ?? ""}>{t("Copiar la de")} {f.nombre}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => correr(() => copiar(desde || null))}
            className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-50">
            {busy ? t("Copiando…") : t("Copiar y personalizar")}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ── bloque propio, editable ──
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">{t("Hoja de encargo de")} {nombre}</h3>
      <div className="mt-4 space-y-3">
        {/* Cada documento, su interruptor (27/09/2026), como en el bloque de la gestoría. */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(d.hojaEncargoActiva)}
              onChange={(e) => setD({ ...d, hojaEncargoActiva: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-aproba-600" />
            {t("Hoja de encargo activada")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={d.mandatoActivo ?? Boolean(d.hojaEncargoActiva)}
              onChange={(e) => setD({ ...d, mandatoActivo: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-aproba-600" />
            {t("Mandatos activados")}
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>{t("Profesional responsable")}</label>
            <input value={d.mandatarioNombre} onChange={(e) => setD({ ...d, mandatarioNombre: e.target.value })} maxLength={120} className={inp} /></div>
          <div><label className={lbl}>DNI/NIE</label>
            <input value={d.mandatarioDni} onChange={(e) => setD({ ...d, mandatarioDni: e.target.value })} maxLength={20} className={inp} /></div>
          <div><label className={lbl}>{t("Nº colegiado")}</label>
            <input value={d.mandatarioColegiado} onChange={(e) => setD({ ...d, mandatarioColegiado: e.target.value })} maxLength={40} className={inp} /></div>
          <div><label className={lbl}>{t("Colegio profesional")}</label>
            <input value={d.mandatarioColegio} onChange={(e) => setD({ ...d, mandatarioColegio: e.target.value })} maxLength={120} className={inp} /></div>
          <div className="sm:col-span-2"><label className={lbl}>{t("Formas de pago (una por línea)")}</label>
            <textarea value={d.encargoFormasPago} onChange={(e) => setD({ ...d, encargoFormasPago: e.target.value })} rows={3} className={inp} /></div>
        </div>
        <VistaPrevia onVer={verPrevia} documentos={[{ label: t("Hoja de encargo"), qs: "doc=hoja" }, { label: t("Presupuesto"), qs: "doc=presupuesto" }, { label: t("Mandato"), qs: "doc=mandato" }]} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => correr(() => api({ action: "encargo", oficinaId, ...d }), true)}
            className="rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
            {busy ? t("Guardando…") : t("Guardar")}
          </button>
          {ok && <span className="text-sm font-medium text-aproba-700">✓ {t("Guardado")}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="button" disabled={busy}
            onClick={() => correr(async () => { await api({ action: "encargo", oficinaId, hojaEncargoActiva: null, mandatoActivo: null }); setD({ ...d, hojaEncargoActiva: null, mandatoActivo: null }); })}
            className="ml-auto text-xs font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-50">
            {t("Quitar configuración propia (volver a heredar)")}
          </button>
        </div>
      </div>
    </div>
  );
}
