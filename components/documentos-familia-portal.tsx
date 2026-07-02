"use client";

import { useRef, useState } from "react";
import { partirDocsFamilia, parentescoLabel } from "@/lib/familia";
import { docLabel, type Lang } from "@/lib/portal-i18n";

type MiembroDoc = { id: string; nombre: string; apellidos: string | null; parentesco: string | null };
type Estado = { status: "pending" | "analyzing" | "validado" | "alerta"; alertas?: string[] };

// Étape Documentos d'un expediente FAMILIAL : docs COMUNES (une fois, clienteId null) + docs
// PERSONNELS de chaque membre (clienteId = membre). Réutilise /api/portal/documentos (IA).
export function DocumentosFamiliaPortal({
  token, lang, miembros, requiredDocs, onBack, onContinue,
}: {
  token: string; lang: Lang; miembros: MiembroDoc[]; requiredDocs: string[]; onBack: () => void; onContinue: () => void;
}) {
  const { comunes, porMiembro } = partirDocsFamilia(requiredDocs);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pendiente = useRef<{ label: string; clienteId: string | null } | null>(null);

  const keyFor = (clienteId: string | null, label: string) => `${clienteId ?? "comun"}::${label}`;

  function pick(clienteId: string | null, label: string) {
    pendiente.current = { label, clienteId };
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const p = pendiente.current;
    pendiente.current = null;
    if (!file || !p) return;
    const k = keyFor(p.clienteId, p.label);
    setEstados((s) => ({ ...s, [k]: { status: "analyzing" } }));
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("label", p.label);
      if (p.clienteId) fd.set("clienteId", p.clienteId);
      fd.set("file", file);
      const res = await fetch("/api/portal/documentos", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "No se pudo subir.");
      setEstados((s) => ({ ...s, [k]: { status: d.estado === "VALIDADO" ? "validado" : "alerta", alertas: d.alertas } }));
    } catch (err) {
      setEstados((s) => ({ ...s, [k]: { status: "alerta", alertas: [err instanceof Error ? err.message : "Error"] } }));
    }
  }

  function Slot({ clienteId, label }: { clienteId: string | null; label: string }) {
    const st = estados[keyFor(clienteId, label)]?.status ?? "pending";
    const alertas = estados[keyFor(clienteId, label)]?.alertas ?? [];
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${st === "validado" ? "bg-aproba-100 text-aproba-600" : st === "alerta" ? "bg-amber-100 text-amber-600" : "bg-cream-50 text-slate-400"}`}>
              {st === "validado" ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              ) : st === "alerta" ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              )}
            </span>
            <span className="truncate text-sm font-medium text-slate-800">{docLabel(label, lang)}</span>
          </div>
          {st === "analyzing" ? (
            <span className="shrink-0 text-xs font-semibold text-aproba-600">…</span>
          ) : st === "validado" ? (
            <button onClick={() => pick(clienteId, label)} className="shrink-0 text-xs font-medium text-slate-400 hover:text-slate-600">Cambiar</button>
          ) : (
            <button onClick={() => pick(clienteId, label)} className="shrink-0 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">Subir</button>
          )}
        </div>
        {st === "alerta" && alertas.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{alertas.join(" · ")}</p>}
      </div>
    );
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentos de la familia</h1>
      <p className="mt-2 text-slate-600">Los documentos comunes se suben una sola vez. Los personales, uno por cada miembro.</p>

      {comunes.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Documentos comunes de la familia</p>
          <div className="space-y-2">
            {comunes.map((l) => <Slot key={l} clienteId={null} label={l} />)}
          </div>
        </div>
      )}

      {porMiembro.length > 0 && miembros.map((m) => (
        <div key={m.id} className="mt-6">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span className="rounded-full bg-cream-50 px-2 py-0.5 text-slate-500">{parentescoLabel(m.parentesco) || "Miembro"}</span>
            {`${m.nombre ?? ""} ${m.apellidos ?? ""}`.trim() || "Miembro"}
          </p>
          <div className="space-y-2">
            {porMiembro.map((l) => <Slot key={`${m.id}:${l}`} clienteId={m.id} label={l} />)}
          </div>
        </div>
      ))}

      {requiredDocs.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm text-slate-600">Este trámite no requiere documentos. Puedes continuar.</p>
      )}

      <div className="mt-7 flex gap-3">
        <button onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Atrás</button>
        <button onClick={onContinue} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">Continuar</button>
      </div>
    </div>
  );
}
