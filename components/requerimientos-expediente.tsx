"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";
import { sumarDiasHabiles, urgenciaDe, plazoClave, PLAZO_HABITUAL_DIAS, AVISAR_DIAS_DEFECTO, type Urgencia } from "@/lib/requerimientos";
import type { RequerimientoRow } from "@/lib/data/requerimientos";

// REQUERIMIENTOS de un expediente (petición de Jennifer, Gesadmbcn, 21/09/2026).
//
// La gestoría manda de principio a fin: ESCRIBE la fecha límite que lee en el
// requerimiento (el botón «10 días hábiles» solo la propone), ELIGE con cuántos días de
// antelación quiere el aviso, y lo cierra ella con «Marcar como aportado». Aproba no
// escribe al cliente: si quiere pedirle los papeles, usa el enlace como siempre.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const COLOR: Record<Urgencia, string> = {
  VENCIDO: "border-red-300 bg-red-50 text-red-700",
  HOY: "border-red-300 bg-red-50 text-red-700",
  URGENTE: "border-amber-300 bg-amber-50 text-amber-800",
  PROXIMO: "border-amber-200 bg-amber-50/60 text-amber-700",
  TRANQUILO: "border-slate-200 bg-white text-slate-600",
  APORTADO: "border-slate-200 bg-slate-50 text-slate-500",
};

// `compacto` (sección «Estado en Extranjería» de la ficha, 24/09/2026): sin el texto de
// «sin requerimientos» ni el botón de añadir — allí el formulario lo abre el botón
// «Requerimiento» de «¿Qué dice Extranjería?», que cambia `abrirSenal`.
export function RequerimientosExpediente({ expedienteId, inicial, compacto = false, abrirSenal = 0 }: { expedienteId: string; inicial: RequerimientoRow[]; compacto?: boolean; abrirSenal?: number }) {
  const t = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [asunto, setAsunto] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [recibidoEl, setRecibidoEl] = useState(iso(new Date()));
  const [avisarDias, setAvisarDias] = useState(AVISAR_DIAS_DEFECTO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abrirSenal) return;
    setAbierto(true);
    setFechaLimite((f) => f || iso(sumarDiasHabiles(new Date(), PLAZO_HABITUAL_DIAS)));
  }, [abrirSenal]);

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600";
  const lbl = "text-[11px] font-medium uppercase tracking-wide text-slate-400";

  // Ayuda, no automatismo: propone el plazo habitual contando de lunes a viernes. No
  // conoce los festivos (nacionales, autonómicos Y locales), así que la fecha sale igual
  // o ANTES que la real. La que vale es la que ella deje escrita.
  function proponerPlazo() {
    const base = recibidoEl ? new Date(`${recibidoEl}T00:00:00`) : new Date();
    setFechaLimite(iso(sumarDiasHabiles(base, PLAZO_HABITUAL_DIAS)));
  }

  async function crear() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/expedientes/${expedienteId}/requerimientos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asunto, fechaLimite: `${fechaLimite}T00:00:00`, recibidoEl: recibidoEl ? `${recibidoEl}T00:00:00` : null, avisarDias }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar el requerimiento."));
      setAsunto(""); setFechaLimite(""); setAvisarDias(AVISAR_DIAS_DEFECTO); setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar el requerimiento."));
    } finally { setBusy(false); }
  }

  async function cambiar(id: string, cuerpo: Record<string, unknown>, mensajeError: string) {
    setError(null);
    try {
      const res = await fetch(`/api/requerimientos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? mensajeError);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : mensajeError); }
  }

  async function borrar(id: string) {
    if (!(await confirmar({ mensaje: t("¿Eliminar este requerimiento? El plazo dejará de vigilarse."), titulo: t("Eliminar requerimiento"), confirmarLabel: t("Eliminar"), peligro: true }))) return;
    setError(null);
    try {
      const res = await fetch(`/api/requerimientos/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo eliminar el requerimiento."));
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("No se pudo eliminar el requerimiento.")); }
  }

  return (
    <div>
      {inicial.length === 0 && !abierto && !compacto && (
        <p className="text-sm text-slate-500">{t("Sin requerimientos. Si la Administración te pide algo con plazo, anótalo aquí y Aproba te avisará antes de que venza.")}</p>
      )}

      {inicial.length > 0 && (
        <ul className="space-y-2">
          {inicial.map((r) => {
            const u = urgenciaDe(r);
            const aportado = r.estado === "APORTADO";
            return (
              <li key={r.id} className={`rounded-lg border p-3 ${COLOR[u]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${aportado ? "text-slate-500 line-through" : "text-slate-900"}`}>{r.asunto}</p>
                    <p className="mt-0.5 text-xs">
                      <span className="font-semibold">{(() => { const p = plazoClave(r); return t(p.clave).replace("{n}", String(p.n)); })()}</span>
                      <span className="text-slate-500">
                        {" · "}{t("plazo")} {new Date(r.fechaLimite).toLocaleDateString("es-ES")}
                        {r.recibidoEl ? ` · ${t("recibido")} ${new Date(r.recibidoEl).toLocaleDateString("es-ES")}` : ""}
                      </span>
                    </p>
                    {!aportado && (
                      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {t("Avisarme")}
                        <input
                          type="number" min={1} max={60} defaultValue={r.avisarDias}
                          onBlur={(e) => { const v = Number(e.target.value); if (v && v !== r.avisarDias) void cambiar(r.id, { avisarDias: v }, t("No se pudo cambiar el aviso.")); }}
                          className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[16px] sm:text-xs outline-none focus:border-aproba-600"
                        />
                        {t("días antes")}
                      </label>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => cambiar(r.id, { aportado: !aportado }, t("No se pudo actualizar el requerimiento."))}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${aportado ? "border border-slate-300 bg-white text-slate-600 hover:border-slate-400" : "bg-aproba-600 text-white hover:bg-aproba-700"}`}
                    >
                      {aportado ? t("Reabrir") : t("Marcar como aportado")}
                    </button>
                    <button type="button" onClick={() => borrar(r.id)} title={t("Eliminar")} aria-label={t("Eliminar requerimiento")} className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                      <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>
                {aportado && r.aportadoEl && <p className="mt-1 text-[11px] text-slate-400">{t("Aportado el")} {new Date(r.aportadoEl).toLocaleDateString("es-ES")}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {abierto ? (
        <div className="mt-3 rounded-lg border border-aproba-200 bg-white p-3">
          <div><label className={lbl}>{t("Qué te piden")}</label>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={400} autoFocus placeholder={t("Certificado de antecedentes penales apostillado")} className={inp} /></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div><label className={lbl}>{t("Recibido el")}</label>
              <input type="date" value={recibidoEl} onChange={(e) => setRecibidoEl(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>{t("Fecha límite")}</label>
              <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>{t("Avisarme (días antes)")}</label>
              <input type="number" min={1} max={60} value={avisarDias} onChange={(e) => setAvisarDias(Number(e.target.value))} className={inp} /></div>
          </div>
          <button type="button" onClick={proponerPlazo} className="mt-2 text-xs font-semibold text-aproba-700 underline-offset-2 hover:underline">
            {t("Calcular 10 días hábiles")}
          </button>
          <p className="mt-1 text-[11px] text-slate-400">{t("El cálculo salta sábados y domingos, pero no conoce los festivos: comprueba la fecha en tu requerimiento y corrígela si hace falta. Manda la que dejes aquí.")}</p>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setAbierto(false); setError(null); }} disabled={busy} className="text-xs text-slate-400 transition hover:text-slate-600">{t("Cancelar")}</button>
            <button type="button" onClick={crear} disabled={busy || !asunto.trim() || !fechaLimite}
              className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">
              {busy ? t("Guardando…") : t("Guardar requerimiento")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
          {!compacto && <button type="button" onClick={() => { setAbierto(true); if (!fechaLimite) proponerPlazo(); }}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
            {t("+ Añadir requerimiento")}
          </button>}
        </>
      )}
    </div>
  );
}
