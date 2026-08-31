"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_AVISOS, esCustom, nuevaClaveCustom, rellenar, type Aviso, type CanalAvisos } from "@/lib/avisos";
import { borrarAvisoCustom, guardarAvisos } from "@/lib/config-browser";
import { confirmar } from "@/components/confirm-dialog";
import { useT } from "@/components/lang-provider";

type SaveState = "idle" | "saving" | "saved" | "error";

// Avisos automáticos al cliente — el gestor activa/desactiva cada aviso y edita su texto.
// El canal es ÚNICO en la plataforma: email. El selector Email/WhatsApp/Ambos se retiró
// (2026-07-26, WhatsApp apagado por coste/complejidad — ver WHATSAPP_PLATAFORMA en
// lib/whatsapp.ts); Workspace.canalAvisos sigue en base para el día que vuelva.
export function AvisosManager({ inicial, envioEmailActivo = false, oficinaId = null }: {
  inicial: Aviso[]; envioEmailActivo?: boolean; envioWhatsAppActivo?: boolean; canalInicial?: CanalAvisos; oficinaId?: string | null;
}) {
  const t = useT();
  // On force le canal (legacy per-aviso) email — le canal réel est global au workspace.
  const [avisos, setAvisos] = useState<Aviso[]>(inicial.map((a) => ({ ...a, canal: "email" })));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const mounted = useRef(false);

  // Persister en base (Supabase, RLS) — debounce 600 ms.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    const tm = window.setTimeout(async () => {
      try {
        await guardarAvisos(avisos, oficinaId);
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(tm);
  }, [avisos]);

  const update = (id: string, patch: Partial<Aviso>) => setAvisos((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const visibles = avisos.filter((a) => !a.oculto);
  const ocultos = avisos.filter((a) => a.oculto);
  const activos = visibles.filter((a) => a.activo);

  // «Eliminar» (pedido de Sandra/LexPats, 31/08): un predeterminado se OCULTA (borrar
  // su fila lo resucitaría por el repli a DEFAULT_AVISOS); un personalizado se borra.
  async function eliminar(a: Aviso) {
    if (esCustom(a)) {
      if (!(await confirmar({ mensaje: t("¿Eliminar el aviso «{n}»?").replace("{n}", a.evento), peligro: true, confirmarLabel: t("Eliminar") }))) return;
      try { await borrarAvisoCustom(a.id, oficinaId); } catch (e) { setSaveState("error"); console.error(e); return; }
      setAvisos((l) => l.filter((x) => x.id !== a.id));
    } else {
      if (!(await confirmar({ mensaje: t("¿Eliminar «{n}» de tu lista? No se enviará y podrás restaurarlo cuando quieras.").replace("{n}", t(a.evento)), peligro: true, confirmarLabel: t("Eliminar") }))) return;
      update(a.id, { oculto: true, activo: false });
    }
  }
  const restaurarOcultos = () => setAvisos((l) => l.map((a) => (a.oculto ? { ...a, oculto: false } : a)));

  // Alta de un aviso personalizado, colgado de un evento real del catálogo.
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ eventoBase: DEFAULT_AVISOS[0].id, evento: "", template: "" });
  function crearAviso() {
    const evento = nuevo.evento.trim(), template = nuevo.template.trim();
    if (!evento || !template) return;
    setAvisos((l) => [...l, { id: nuevaClaveCustom(), evento, template, canal: "email", activo: true, eventoBase: nuevo.eventoBase, oculto: false }]);
    setNuevo({ eventoBase: DEFAULT_AVISOS[0].id, evento: "", template: "" });
    setCreando(false);
  }
  const nombreEvento = (id: string | null | undefined) => DEFAULT_AVISOS.find((d) => d.id === id)?.evento ?? id ?? "";

  const IconOk = <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />;
  const IconWarn = <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>;
  const bandera = (activo: boolean, fuerte: string, resto: string) => (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${activo ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {activo ? IconOk : IconWarn}
      </svg>
      <span><span className="font-semibold">{fuerte}</span> {resto}</span>
    </div>
  );

  return (
    <div>
      {/* Estado de envío : real vs simulación (email — único canal de la plataforma) */}
      <div className="mb-4 space-y-2">
        {bandera(
          envioEmailActivo,
          envioEmailActivo ? t("Envíos por email activos.") : t("Modo simulación."),
          envioEmailActivo ? t("Tus clientes reciben estos avisos por correo automáticamente.") : t("Los avisos se registran en el historial del expediente pero todavía no se envían (falta configurar el envío por email)."),
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos.length} {t("activos")}</span> {t("de")} {visibles.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && t("Guardando…")}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
          {saveState === "error" && t("Error al guardar — reintenta")}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Liste éditable */}
        <div className="space-y-3 lg:col-span-3">
          {visibles.map((a) => (
            <div key={a.id} className={`rounded-xl border bg-white p-4 transition-colors ${a.activo ? "border-slate-200" : "border-slate-200 bg-slate-50/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-slate-900">
                  {esCustom(a) ? a.evento : t(a.evento)}
                  {esCustom(a) && (
                    <span className="ml-2 rounded bg-aproba-50 px-1.5 py-0.5 text-[10px] font-medium text-aproba-700">
                      {t("con")} «{t(nombreEvento(a.eventoBase))}»
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <button onClick={() => eliminar(a)} title={t("Eliminar")} aria-label={`${t("Eliminar")} ${a.evento}`} className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                  <button onClick={() => update(a.id, { activo: !a.activo })} role="switch" aria-checked={a.activo} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.activo ? "bg-aproba-600" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.activo ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </span>
              </div>
              <textarea
                value={a.template}
                onChange={(e) => update(a.id, { template: e.target.value })}
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[16px] sm:text-sm text-slate-700 outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
              />
            </div>
          ))}
          <p className="text-xs text-slate-400">{t("Placeholders disponibles:")} <span className="font-mono">{"{nombre}"}</span> <span className="font-mono">{"{documento}"}</span> <span className="font-mono">{"{fecha}"}</span> {t("— se rellenan solos.")}</p>

          {/* Nuevo aviso personalizado (Sandra/LexPats, 31/08): mensaje adicional
              disparado por un evento real del catálogo — no hay disparadores nuevos. */}
          {creando ? (
            <div className="rounded-xl border border-aproba-200 bg-aproba-50/40 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-900">{t("Nuevo aviso")}</p>
              <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Se envía cuando…")}</label>
              <select value={nuevo.eventoBase} onChange={(e) => setNuevo((n) => ({ ...n, eventoBase: e.target.value }))} className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-500">
                {DEFAULT_AVISOS.map((d) => <option key={d.id} value={d.id}>{t(d.evento)}</option>)}
              </select>
              <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Asunto del email")}</label>
              <input value={nuevo.evento} onChange={(e) => setNuevo((n) => ({ ...n, evento: e.target.value }))} placeholder={t("P. ej. Recordatorio: trae tu pasaporte original")} className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-500" />
              <label className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Mensaje")}</label>
              <textarea value={nuevo.template} onChange={(e) => setNuevo((n) => ({ ...n, template: e.target.value }))} rows={3} placeholder={t("Hola {nombre}, …")} className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-500" />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setCreando(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
                <button onClick={crearAviso} disabled={!nuevo.evento.trim() || !nuevo.template.trim()} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{t("Crear aviso")}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreando(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-aproba-400 hover:text-aproba-700">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {t("Nuevo aviso")}
            </button>
          )}

          {ocultos.length > 0 && (
            <p className="text-xs text-slate-400">
              {ocultos.length} {t(ocultos.length === 1 ? "aviso predeterminado eliminado" : "avisos predeterminados eliminados")}.{" "}
              <button onClick={restaurarOcultos} className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-800">{t("Restaurar")}</button>
            </p>
          )}
        </div>

        {/* Aperçu email — ce que reçoit le client */}
        <div className="lg:col-span-2">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Lo que recibe tu cliente")}</p>
          <div className="space-y-2">
            {activos.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">{t("Sin avisos activos")}</p>}
            {activos.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-cream-50 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-aproba-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                  </span>
                  <span className="truncate text-xs font-semibold text-slate-700">{esCustom(a) ? a.evento : t(a.evento)}</span>
                </div>
                <p className="px-3 py-2.5 text-[12px] leading-snug text-slate-600">{rellenar(a.template)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
