"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { copiarTexto } from "@/lib/copiar";
import {
  CLASES_PERMISO, PAISES_CONVENIO, PAISES_UE_EEE, URL_INFO_CANJE, URL_SEDE_CANJE,
  avisosCanje, datosParaSede, type AvisoCanje, type DatosCanje,
} from "@/lib/canje";

// CANJE DEL PERMISO DE CONDUCIR (DGT) — ficha del expediente (Jennifer y Samara, 03/10/2026).
// El canje se pide en la sede de la DGT (en línea) o en la Jefatura con cita, con la solicitud
// en impreso oficial (Mod. 03) y, si lo presenta el despacho, la representación (Mod. 24):
// aquí se guardan los datos del permiso, se sacan los dos impresos rellenados
// (/api/expedientes/[id]/dgt), se avisa de lo que impide el canje y de sus plazos, y se anota
// la entrega del permiso original en la Jefatura. Reglas: lib/canje.ts; impresos: lib/dgt-forms.ts.
const ddmmaaaa = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return a && m && d ? `${d}/${m}/${a}` : ""; };
const COLOR: Record<AvisoCanje["nivel"], string> = {
  bloqueo: "border-red-200 bg-red-50 text-red-700",
  atencion: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-slate-50 text-slate-600",
  ok: "border-aproba-200 bg-aproba-50 text-aproba-800",
};

export function CanjePermiso({ expedienteId, inicial, persona, presentado, activo }: {
  expedienteId: string;
  inicial: DatosCanje;
  persona: { nombre: string; documento: string; fechaNacimiento: string };
  presentado: boolean;  // la solicitud ya está presentada (fecha de presentación)
  activo: boolean;      // la base guarda los datos (supabase/canje-permiso.sql)
}) {
  const t = useT();
  const router = useRouter();
  const [d, setD] = useState<DatosCanje>(inicial);
  const [guardado, setGuardado] = useState<DatosCanje>(inicial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const cambiado = JSON.stringify(d) !== JSON.stringify(guardado);
  const avisos = avisosCanje(d, { presentado });
  const campo = <K extends keyof DatosCanje>(k: K, v: DatosCanje[K]) => setD((x) => ({ ...x, [k]: v }));
  const clase = (c: string) => setD((x) => ({ ...x, clases: x.clases.includes(c) ? x.clases.filter((y) => y !== c) : [...x.clases, c].sort((a, b) => CLASES_PERMISO.indexOf(a as never) - CLASES_PERMISO.indexOf(b as never)) }));

  async function guardar() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/canje`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t("No se pudo guardar."));
      setGuardado(j.canje as DatosCanje); setD(j.canje as DatosCanje);
      router.refresh(); // el historial de la ficha enseña el cambio
    } catch (e) {
      setError(e instanceof Error ? e.message : t("No se pudo guardar."));
    } finally { setBusy(false); }
  }
  async function copiar(k: string, v: string) {
    if (await copiarTexto(v)) { setCopiado(k); window.setTimeout(() => setCopiado(null), 1500); }
  }

  const lbl = "mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400";
  const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[16px] outline-none focus:border-aproba-600 sm:text-sm";
  const texto = (a: AvisoCanje) => t(a.clave).replace("{fecha}", a.fecha ? ddmmaaaa(a.fecha) : "").replace("{n}", String(a.n ?? "").replace(".", ","));

  return (
    <section id="canje" className="mt-4 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{t("Canje del permiso de conducir (DGT)")}</h2>
        <a href={URL_SEDE_CANJE} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">
          {t("Abrir el canje en la sede de la DGT")} ↗
        </a>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {t("El canje se pide en la sede de la DGT (en línea, con Cl@ve, certificado o como representante) o en la Jefatura, con cita. Aquí guardas los datos del permiso, sacas los impresos oficiales rellenados y Aproba vigila los plazos.")}{" "}
        <a href={URL_INFO_CANJE} target="_blank" rel="noopener noreferrer" className="font-semibold text-aproba-700 hover:underline">{t("Requisitos en dgt.es")}</a>
      </p>

      {avisos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {avisos.map((a, i) => <li key={i} className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${COLOR[a.nivel]}`}>{texto(a)}</li>)}
        </ul>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>{t("País que expidió el permiso")}</span>
          <input value={d.pais} list="paises-canje" onChange={(e) => campo("pais", e.target.value)} placeholder={t("p. ej. Perú")} className={inp} />
          <datalist id="paises-canje">{[...PAISES_CONVENIO, ...PAISES_UE_EEE].map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label className="block">
          <span className={lbl}>{t("Nº del permiso")}</span>
          <input value={d.numero} onChange={(e) => campo("numero", e.target.value)} maxLength={40} className={`${inp} font-mono`} />
        </label>
        <div className="sm:col-span-2">
          <span className={lbl}>{t("Clases")}</span>
          <div role="group" aria-label={t("Clases")} className="flex flex-wrap gap-1.5">
            {CLASES_PERMISO.map((c) => (
              <button key={c} type="button" onClick={() => clase(c)} aria-pressed={d.clases.includes(c)}
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition ${d.clases.includes(c) ? "border-aproba-500 bg-aproba-50 text-aproba-800" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>{c}</button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className={lbl}>{t("Fecha de expedición")}</span>
          <input type="date" value={d.expedicion} onChange={(e) => campo("expedicion", e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className={lbl}>{t("Fecha de caducidad")}</span>
          <input type="date" value={d.caducidad} onChange={(e) => campo("caducidad", e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className={lbl}>{t("Reside en España desde")}</span>
          <input type="date" value={d.residenciaDesde} onChange={(e) => campo("residenciaDesde", e.target.value)} className={inp} />
          <span className="mt-0.5 block text-[11px] text-slate-400">{t("Su permiso vale para conducir 6 meses desde entonces.")}</span>
        </label>
        <label className="block">
          <span className={lbl}>{t("Informe médico (aptitud psicofísica)")}</span>
          <input type="date" value={d.informeMedicoEl} onChange={(e) => campo("informeMedicoEl", e.target.value)} className={inp} />
          <span className="mt-0.5 block text-[11px] text-slate-400">{t("De un centro de reconocimiento de conductores; vale 90 días.")}</span>
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>{t("Permiso original entregado en la Jefatura el")}</span>
          <input type="date" value={d.entregadoEl} onChange={(e) => campo("entregadoEl", e.target.value)} className={`${inp} sm:w-56`} />
          <span className="mt-0.5 block text-[11px] text-slate-400">{t("Allí le dan la autorización provisional para conducir; el permiso español llega por correo (alrededor de mes y medio). Cuando llegue, regístralo como resolución favorable.")}</span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={guardar} disabled={!cambiado || busy || !activo}
          className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-40">
          {busy ? t("Guardando…") : t("Guardar")}
        </button>
        {!activo && <span className="text-[11px] text-slate-400">{t("El canje aún no está activado en tu despacho: escríbenos y lo activamos.")}</span>}
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Impresos oficiales de la DGT")}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {/* El Mod. 03 sale con los datos GUARDADOS del permiso: con cambios sin guardar, primero Guardar. */}
          {cambiado ? (
            <span aria-disabled="true" className="cursor-not-allowed rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white opacity-40">{t("Mod. 03 · Solicitud de canje")} ↓</span>
          ) : (
            <a href={`/api/expedientes/${expedienteId}/dgt?modelo=03`} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">{t("Mod. 03 · Solicitud de canje")} ↓</a>
          )}
          <a href={`/api/expedientes/${expedienteId}/dgt?modelo=24`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">{t("Mod. 24 · Representación")} ↓</a>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {cambiado
            ? t("Guarda los cambios antes de sacar el Mod. 03: sale con los datos guardados.")
            : t("Salen rellenados con la ficha del cliente y los datos del permiso, y se pueden corregir en el PDF. El Mod. 24 autoriza al despacho a presentar el canje por el cliente: lo firman los dos.")}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Datos para la sede de la DGT")}</p>
        <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {datosParaSede(d, persona).map(([k, v]) => (
            <button key={k} type="button" onClick={() => copiar(k, v)} title={t("Copiar")}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition hover:bg-white">
              <span className="text-slate-500">{t(k)}</span>
              <span className="truncate font-mono text-slate-900">{copiado === k ? `✓ ${t("copiado")}` : v}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">{t("Un clic copia el dato para pegarlo en el formulario de la sede.")}</p>
      </div>
    </section>
  );
}
