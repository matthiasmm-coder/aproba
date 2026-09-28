"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

// Fila «Email» del bloque Cuenta (Ajustes). Cada usuario cambia su propio email de acceso:
// llega un enlace al email NUEVO y el cambio se aplica al pulsarlo (la contraseña no cambia).
// Hasta entonces se sigue entrando con el actual.
export function CambiarEmail({ email }: { email: string }) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);

  const mensaje = (codigo: unknown) => ({
    invalido: t("Escribe un email válido."),
    igual: t("Ese ya es tu email."),
    en_uso: t("Ese email ya está en uso en Aproba."),
    sesion: t("Tu sesión ha caducado: vuelve a entrar."),
  } as Record<string, string>)[String(codigo)] ?? t("No se pudo enviar el enlace. Inténtalo de nuevo.");

  async function enviar() {
    const limpio = draft.trim().toLowerCase();
    if (!limpio) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cuenta/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: limpio }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(mensaje(d.error)); return; }
      setPendiente(String(d.email));
      setEditando(false);
    } catch {
      setError(mensaje(null));
    } finally {
      setBusy(false);
    }
  }

  if (!editando) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">{t("Email")}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-slate-800">{email || "—"}</span>
            <button
              type="button"
              onClick={() => { setDraft(""); setError(null); setEditando(true); }}
              title={t("Cambiar tu email de acceso")}
              aria-label={t("Cambiar tu email de acceso")}
              className="shrink-0 rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-aproba-700"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
            </button>
          </span>
        </div>
        {pendiente && (
          <p role="status" className="mt-2 rounded-lg bg-aproba-50 px-3 py-2 text-xs leading-relaxed text-aproba-800">
            {t("Te hemos enviado un enlace a")} <strong className="break-all">{pendiente}</strong>. {t("Tu email cambia cuando lo pulses (caduca en 1 hora). Tu contraseña no cambia.")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-slate-500">{t("Email")}</span>
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviar(); if (e.key === "Escape") setEditando(false); }}
          placeholder={t("Nuevo email")}
          autoComplete="email"
          maxLength={254}
          autoFocus
          disabled={busy}
          className="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-[16px] sm:text-sm font-medium text-slate-800 outline-none focus:border-aproba-600"
        />
        <button onClick={enviar} disabled={busy || !draft.trim()} className="shrink-0 rounded-lg bg-aproba-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
          {busy ? "…" : t("Enviar enlace")}
        </button>
        <button onClick={() => setEditando(false)} disabled={busy} className="shrink-0 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-600">✕</button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{t("Te enviaremos un enlace al email nuevo para confirmar que es tuyo.")}</p>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
