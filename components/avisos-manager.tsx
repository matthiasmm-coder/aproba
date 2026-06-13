"use client";

import { useEffect, useRef, useState } from "react";
import { rellenar, type Aviso, type Canal } from "@/lib/avisos";
import { guardarAvisos } from "@/lib/config-browser";

function CanalIcon({ canal, className = "" }: { canal: Canal; className?: string }) {
  if (canal === "whatsapp")
    return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.2zM12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2z" /></svg>;
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function AvisosManager({ inicial, envioEmailActivo = false }: { inicial: Aviso[]; envioEmailActivo?: boolean }) {
  const [avisos, setAvisos] = useState<Aviso[]>(inicial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const mounted = useRef(false);

  // Persister en base (Supabase, RLS) — debounce 600 ms.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("saving");
    const t = window.setTimeout(async () => {
      try {
        await guardarAvisos(avisos);
        setSaveState("saved");
        window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [avisos]);

  const update = (id: string, patch: Partial<Aviso>) => setAvisos((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const activos = avisos.filter((a) => a.activo);

  return (
    <div>
      {/* Estado de envío : email real (Resend) vs simulación */}
      <div className={`mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${envioEmailActivo ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
        <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {envioEmailActivo ? <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
        </svg>
        <span>
          {envioEmailActivo
            ? <><span className="font-semibold">Envíos por email activos.</span> Los avisos con canal Email se envían de verdad a tus clientes.</>
            : <><span className="font-semibold">Modo simulación.</span> Los avisos se registran en el historial del expediente pero no se envían todavía (falta configurar el envío por email). WhatsApp automático llegará más adelante.</>}
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">{activos.length} activos</span> de {avisos.length}</p>
        <span className={`flex items-center gap-1 text-xs font-medium transition-opacity duration-300 ${saveState === "idle" ? "opacity-0" : "opacity-100"} ${saveState === "error" ? "text-red-600" : "text-aproba-700"}`}>
          {saveState === "saving" && "Guardando…"}
          {saveState === "saved" && (<><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Guardado</>)}
          {saveState === "error" && "Error al guardar — reintenta"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Liste éditable */}
        <div className="space-y-3 lg:col-span-3">
          {avisos.map((a) => (
            <div key={a.id} className={`rounded-xl border bg-white p-4 transition-colors ${a.activo ? "border-slate-200" : "border-slate-200 bg-slate-50/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">{a.evento}</span>
                <div className="flex items-center gap-2">
                  {/* canal */}
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                    {(["whatsapp", "email"] as Canal[]).map((c) => (
                      <button key={c} onClick={() => update(a.id, { canal: c })} className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition ${a.canal === c ? "bg-aproba-50 text-aproba-700" : "text-slate-400 hover:text-slate-600"}`}>
                        <CanalIcon canal={c} className="h-3 w-3" />{c === "whatsapp" ? "WhatsApp" : "Email"}
                      </button>
                    ))}
                  </div>
                  {/* toggle */}
                  <button onClick={() => update(a.id, { activo: !a.activo })} role="switch" aria-checked={a.activo} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.activo ? "bg-aproba-600" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${a.activo ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
              <textarea
                value={a.template}
                onChange={(e) => update(a.id, { template: e.target.value })}
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-aproba-500 focus:ring-2 focus:ring-aproba-100"
              />
            </div>
          ))}
          <p className="text-xs text-slate-400">Placeholders disponibles: <span className="font-mono">{"{nombre}"}</span> <span className="font-mono">{"{documento}"}</span> <span className="font-mono">{"{fecha}"}</span> — se rellenan solos.</p>
        </div>

        {/* Aperçu téléphone */}
        <div className="lg:col-span-2">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Lo que recibe tu cliente</p>
          <div className="mx-auto w-[230px]">
            <div className="relative overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-white shadow-xl">
              <div className="flex h-5 items-center justify-center bg-white"><div className="h-3 w-14 rounded-full bg-slate-900" /></div>
              <div className="flex h-9 items-center gap-2 bg-[#075E54] px-3 text-white">
                <div className="h-6 w-6 rounded-full bg-white/20" />
                <span className="text-[12px] font-medium">Gestoría Vallès</span>
              </div>
              <div className="space-y-2 bg-[#ECE5DD] p-3" style={{ minHeight: 330 }}>
                {activos.length === 0 && <p className="mt-10 text-center text-[11px] text-slate-400">Sin avisos activos</p>}
                {activos.map((a) => (
                  <div key={a.id} className="max-w-[88%] rounded-lg rounded-tl-none bg-white p-2 text-[11px] leading-snug text-slate-700 shadow-sm">
                    {rellenar(a.template)}
                    <span className="mt-1 flex items-center justify-end gap-1 text-[8px] text-slate-400">
                      <CanalIcon canal={a.canal} className="h-2.5 w-2.5" />10:2{activos.indexOf(a)} ✓✓
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
