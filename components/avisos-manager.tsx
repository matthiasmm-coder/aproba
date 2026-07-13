"use client";

import { useEffect, useRef, useState } from "react";
import { rellenar, type Aviso, type CanalAvisos } from "@/lib/avisos";
import { guardarAvisos } from "@/lib/config-browser";
import { useT } from "@/components/lang-provider";

type SaveState = "idle" | "saving" | "saved" | "error";

// Opciones del canal global (label = clave i18n, salvo la marca WhatsApp).
const CANALES: [CanalAvisos, string][] = [["EMAIL", "Email"], ["WHATSAPP", "WhatsApp"], ["AMBOS", "Ambos"]];

// Avisos automáticos au client — le gestor choisit le CANAL de livraison du workspace
// (Email / WhatsApp / Ambos → Workspace.canalAvisos, honoré par lib/notificaciones.ts),
// active/désactive chaque aviso et édite son texte.
export function AvisosManager({ inicial, envioEmailActivo = false, envioWhatsAppActivo = false, canalInicial = "EMAIL" }: {
  inicial: Aviso[]; envioEmailActivo?: boolean; envioWhatsAppActivo?: boolean; canalInicial?: CanalAvisos;
}) {
  const t = useT();
  // On force le canal (legacy per-aviso) email — le canal réel est global au workspace.
  const [avisos, setAvisos] = useState<Aviso[]>(inicial.map((a) => ({ ...a, canal: "email" })));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const mounted = useRef(false);

  // Canal global du workspace — sauvegarde immédiate (pas de debounce : un clic = un choix).
  const [canal, setCanal] = useState<CanalAvisos>(canalInicial);
  const [canalState, setCanalState] = useState<SaveState>("idle");
  const [canalError, setCanalError] = useState<string | null>(null);
  async function elegirCanal(c: CanalAvisos) {
    if (c === canal || canalState === "saving") return;
    const prev = canal;
    setCanal(c); setCanalState("saving"); setCanalError(null);
    try {
      const fd = new FormData();
      fd.set("soloCanal", "1");
      fd.set("canalAvisos", c);
      const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo guardar el canal."));
      setCanalState("saved");
      window.setTimeout(() => setCanalState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setCanal(prev);
      setCanalState("error");
      setCanalError(e instanceof Error ? e.message : t("No se pudo guardar el canal."));
    }
  }
  const conEmail = canal !== "WHATSAPP";
  const conWhatsApp = canal !== "EMAIL";

  // Persister en base (Supabase, RLS) — debounce 600 ms.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    const tm = window.setTimeout(async () => {
      try {
        await guardarAvisos(avisos);
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(tm);
  }, [avisos]);

  const update = (id: string, patch: Partial<Aviso>) => setAvisos((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const activos = avisos.filter((a) => a.activo);

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
      {/* Canal de entrega — Email / WhatsApp / Ambos (Workspace.canalAvisos) */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("Canal de los avisos")}</p>
            <p className="text-xs text-slate-500">{t("Cómo recibe el cliente estos mensajes.")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium transition-opacity duration-300 ${canalState === "idle" ? "opacity-0" : "opacity-100"} ${canalState === "error" ? "text-red-600" : "text-aproba-700"}`}>
              {canalState === "saving" ? t("Guardando…") : canalState === "saved" ? t("Guardado") : canalState === "error" ? t("Error al guardar — reintenta") : ""}
            </span>
            <div
              className="flex divide-x divide-slate-300 overflow-hidden rounded-lg border border-slate-300"
              role="radiogroup"
              aria-label={t("Canal de los avisos")}
              onKeyDown={(e) => {
                // Patrón radio WAI-ARIA: las flechas mueven selección + foco (roving tabindex).
                const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!delta || canalState === "saving") return;
                e.preventDefault();
                const idx = CANALES.findIndex(([c]) => c === canal);
                const next = (idx + delta + CANALES.length) % CANALES.length;
                void elegirCanal(CANALES[next][0]);
                e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
              }}
            >
              {CANALES.map(([c, labelKey]) => (
                <button key={c} role="radio" aria-checked={canal === c} tabIndex={canal === c ? 0 : -1}
                  onClick={() => elegirCanal(c)} aria-disabled={canalState === "saving"}
                  className={`px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900 ${canal === c ? "bg-aproba-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {labelKey === "WhatsApp" ? labelKey : t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {canalError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{canalError}</p>}
      </div>

      {/* Estado de envío por canal : real vs simulación */}
      <div className="mb-4 space-y-2">
        {conEmail && bandera(
          envioEmailActivo,
          envioEmailActivo ? t("Envíos por email activos.") : t("Modo simulación."),
          envioEmailActivo ? t("Tus clientes reciben estos avisos por correo automáticamente.") : t("Los avisos se registran en el historial del expediente pero todavía no se envían (falta configurar el envío por email)."),
        )}
        {conWhatsApp && bandera(
          envioWhatsAppActivo,
          envioWhatsAppActivo ? t("Envíos por WhatsApp activos.") : t("WhatsApp en modo simulación."),
          envioWhatsAppActivo ? t("Tus clientes reciben estos avisos por WhatsApp automáticamente.") : t("Los mensajes se registran en el historial del expediente pero todavía no se envían (falta configurar el número de WhatsApp)."),
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos.length} {t("activos")}</span> {t("de")} {avisos.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && t("Guardando…")}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{t("Guardado")}</>)}
          {saveState === "error" && t("Error al guardar — reintenta")}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Liste éditable */}
        <div className="space-y-3 lg:col-span-3">
          {avisos.map((a) => (
            <div key={a.id} className={`rounded-xl border bg-white p-4 transition-colors ${a.activo ? "border-slate-200" : "border-slate-200 bg-slate-50/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">{t(a.evento)}</span>
                <button onClick={() => update(a.id, { activo: !a.activo })} role="switch" aria-checked={a.activo} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.activo ? "bg-aproba-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.activo ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <textarea
                value={a.template}
                onChange={(e) => update(a.id, { template: e.target.value })}
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
              />
            </div>
          ))}
          <p className="text-xs text-slate-400">{t("Placeholders disponibles:")} <span className="font-mono">{"{nombre}"}</span> <span className="font-mono">{"{documento}"}</span> <span className="font-mono">{"{fecha}"}</span> {t("— se rellenan solos.")}</p>
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
                    {conEmail ? (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                    ) : (
                      // canal WhatsApp solo → burbuja de chat (el aperçu ya no finge ser un email)
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                    )}
                  </span>
                  <span className="truncate text-xs font-semibold text-slate-700">{t(a.evento)}</span>
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
