"use client";

import { useMemo, useRef, useState } from "react";
import { partirDocsFamilia } from "@/lib/familia";
import { makeT, docLabel, parentescoI18n, type Lang } from "@/lib/portal-i18n";
import type { MiembroInicial } from "@/components/datos-familia";

type Estado = { status: "pending" | "analyzing" | "validado" | "alerta"; alertas?: string[] };

// ¿El miembro es menor de edad? (según su fecha de nacimiento en la ficha.)
const esMenor = (m: MiembroInicial) => {
  const f = m.ficha?.fechaNacimiento;
  if (!f) return false;
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return false;
  const edad = (Date.now() - d.getTime()) / (365.25 * 864e5);
  return edad >= 0 && edad < 18;
};

// Étape Documentos d'un expediente FAMILIAL : docs COMUNES (une fois, clienteId null) + docs
// PERSONNELS de chaque solicitante (clienteId = membre). Upload XHR avec barre de progression
// (subida réelle → análisis IA) + avertissement si tout n'est pas validé (on peut continuer).
export function DocumentosFamiliaPortal({
  token, lang, miembros, requiredDocs, onBack, onContinue,
}: {
  token: string; lang: Lang; miembros: MiembroInicial[]; requiredDocs: string[]; onBack: () => void; onContinue: () => void;
}) {
  const t = makeT(lang);
  const { comunes, porMiembro } = partirDocsFamilia(requiredDocs);
  const solicitantes = useMemo(() => miembros.filter((m) => m.esSolicitante), [miembros]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [prog, setProg] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pendiente = useRef<{ label: string; clienteId: string | null } | null>(null);

  const keyFor = (clienteId: string | null, label: string) => `${clienteId ?? "comun"}::${label}`;

  // Representante legal: si hay un solicitante MENOR, se pide la identidad del titular
  // (padre/madre). Solo si el titular no es ya solicitante (si no, ya tiene su sección).
  const titular = useMemo(() => miembros.find((m) => m.parentesco === "TITULAR") ?? miembros[0], [miembros]);
  const hayMenorSolicitante = useMemo(() => solicitantes.some(esMenor), [solicitantes]);
  const representante = hayMenorSolicitante && titular && !titular.esSolicitante ? titular : null;
  const DOC_REPRESENTANTE = "Pasaporte";

  // Todas las casillas requeridas (comunes + por solicitante + representante) → aviso de completitud.
  const requiredKeys = useMemo(() => {
    const ks = comunes.map((l) => keyFor(null, l));
    for (const m of solicitantes) for (const l of porMiembro) ks.push(keyFor(m.id, l));
    if (representante) ks.push(keyFor(representante.id, DOC_REPRESENTANTE));
    return ks;
  }, [comunes, porMiembro, solicitantes, representante]);
  const total = requiredKeys.length;
  const validados = requiredKeys.filter((k) => estados[k]?.status === "validado").length;
  const todosOk = total > 0 && validados === total;

  function pick(clienteId: string | null, label: string) {
    pendiente.current = { label, clienteId };
    fileRef.current?.click();
  }

  // Subida con progreso real (XHR): 0-45 % mientras sube el archivo, avance asintótico
  // 45→98 % durante el análisis IA (sin señal), 100 % al recibir la respuesta.
  function subir(key: string, clienteId: string | null, label: string, file: File) {
    setEstados((s) => ({ ...s, [key]: { status: "analyzing" } }));
    setProg((p) => ({ ...p, [key]: 0 }));
    const fd = new FormData();
    fd.set("token", token);
    fd.set("label", label);
    if (clienteId) fd.set("clienteId", clienteId);
    fd.set("file", file);
    const xhr = new XMLHttpRequest();
    let creep: ReturnType<typeof setInterval> | null = null;
    const bump = (v: number) => setProg((p) => ({ ...p, [key]: Math.max(p[key] ?? 0, Math.min(100, v)) }));
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) bump(Math.round((ev.loaded / ev.total) * 45)); };
    xhr.upload.onload = () => {
      bump(45);
      creep = setInterval(() => setProg((p) => { const c = p[key] ?? 45; return c >= 98 ? p : { ...p, [key]: c + (98 - c) * 0.045 }; }), 140);
    };
    const stop = () => { if (creep) { clearInterval(creep); creep = null; } };
    xhr.onload = () => {
      stop();
      setProg((p) => ({ ...p, [key]: 100 }));
      let d: { estado?: string; alertas?: string[]; error?: string } | null = null;
      try { d = JSON.parse(xhr.responseText); } catch { /* respuesta no-JSON */ }
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (ok && d?.estado) setEstados((s) => ({ ...s, [key]: { status: d!.estado === "VALIDADO" ? "validado" : "alerta", alertas: d!.alertas } }));
      else setEstados((s) => ({ ...s, [key]: { status: "alerta", alertas: [d?.error ?? t("s2.noSeLee")] } }));
    };
    xhr.onerror = () => { stop(); setEstados((s) => ({ ...s, [key]: { status: "alerta", alertas: [t("s2.errorSubir")] } })); };
    xhr.open("POST", "/api/portal/documentos");
    xhr.send(fd);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const p = pendiente.current;
    pendiente.current = null;
    if (!file || !p) return;
    subir(keyFor(p.clienteId, p.label), p.clienteId, p.label, file);
  }

  function Slot({ clienteId, label }: { clienteId: string | null; label: string }) {
    const key = keyFor(clienteId, label);
    const st = estados[key]?.status ?? "pending";
    const alertas = estados[key]?.alertas ?? [];
    const pct = Math.round(prog[key] ?? 0);
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
            <span className="shrink-0 text-xs font-semibold tabular-nums text-aproba-600">{pct}%</span>
          ) : st === "validado" ? (
            <button onClick={() => pick(clienteId, label)} className="shrink-0 text-xs font-medium text-slate-400 hover:text-slate-600">{t("fam.docs.cambiar")}</button>
          ) : (
            <button onClick={() => pick(clienteId, label)} className="shrink-0 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">{st === "alerta" ? t("s2.volverSubir") : t("s2.subir")}</button>
          )}
        </div>
        {st === "analyzing" && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
          </div>
        )}
        {st === "alerta" && alertas.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{alertas.join(" · ")}</p>}
      </div>
    );
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("fam.docs.titulo")}</h1>
      <p className="mt-2 text-slate-600">{t("fam.docs.intro")}</p>

      {comunes.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("fam.docs.comunes")}</p>
          <div className="space-y-2">
            {comunes.map((l) => <Slot key={l} clienteId={null} label={l} />)}
          </div>
        </div>
      )}

      {porMiembro.length > 0 && solicitantes.map((m) => (
        <div key={m.id} className="mt-6">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span className="rounded-full bg-cream-50 px-2 py-0.5 text-slate-500">{parentescoI18n(m.parentesco, lang) || t("fam.miembro")}</span>
            {`${m.nombre ?? ""} ${m.apellidos ?? ""}`.trim() || t("fam.miembro")}
          </p>
          <div className="space-y-2">
            {porMiembro.map((l) => <Slot key={`${m.id}:${l}`} clienteId={m.id} label={l} />)}
          </div>
        </div>
      ))}

      {representante && (
        <div className="mt-6">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span className="rounded-full bg-cream-50 px-2 py-0.5 text-slate-500">{t("fam.docs.representante")}</span>
            {`${representante.nombre ?? ""} ${representante.apellidos ?? ""}`.trim() || t("fam.miembro")}
          </p>
          <p className="mb-2 text-[11px] text-slate-400">{t("fam.docs.representanteAyuda")}</p>
          <Slot clienteId={representante.id} label={DOC_REPRESENTANTE} />
        </div>
      )}

      {/* Avertissement de complétude (on peut toujours continuer) */}
      {total === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50 p-3.5">
          <p className="text-sm leading-relaxed text-slate-600">{t("fam.docs.sinDocs")}</p>
          <div className="mt-3 flex gap-3">
            <button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
            <button onClick={onContinue} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("common.continuar")}</button>
          </div>
        </div>
      ) : todosOk ? (
        <div className="mt-6 rounded-xl border border-aproba-200 bg-aproba-50 p-3.5">
          <p className="flex items-start gap-2 text-sm font-medium text-aproba-700">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {t("s2.todosOk")}
          </p>
          <div className="mt-3 flex gap-3">
            <button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
            <button onClick={onContinue} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("common.continuar")}</button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-xs leading-relaxed text-amber-700">{t("s2.faltanDocs")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onContinue} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700">{t("s2.continuarIgual")}</button>
            <button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400">{t("common.atras")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
