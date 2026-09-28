"use client";

import { useState } from "react";
import Link from "next/link";

// Página del enlace «Confirmar mi nuevo email». El cambio se aplica al PULSAR (POST), nunca
// al abrir la página: los escáneres de correo abren los enlaces solos.
const MENSAJES: Record<string, string> = {
  enlace: "El enlace no es válido o ha caducado (dura 1 hora). Vuelve a pedir el cambio en Ajustes › Despacho y cuenta.",
  en_uso: "Ese email ya está en uso en Aproba: el cambio no se ha hecho.",
  no_encontrado: "No encontramos tu cuenta: el cambio no se ha hecho.",
  error: "No se pudo cambiar el email. Inténtalo de nuevo en unos minutos.",
};

export function ConfirmarEmail({ token, email }: { token: string; email: string | null }) {
  const [estado, setEstado] = useState<"listo" | "enviando" | "hecho" | "error">(email ? "listo" : "error");
  const [error, setError] = useState(email ? "" : MENSAJES.enlace);

  async function confirmar() {
    setEstado("enviando");
    try {
      const res = await fetch("/api/cuenta/email/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(MENSAJES[String(d.error)] ?? MENSAJES.error); setEstado("error"); return; }
      setEstado("hecho");
    } catch {
      setError(MENSAJES.error);
      setEstado("error");
    }
  }

  if (estado === "hecho") {
    return (
      <div className="mt-5 space-y-5">
        <p className="text-sm leading-relaxed text-slate-600">Hecho: tu email de acceso es ahora <strong className="break-all text-slate-900">{email}</strong>. Tu contraseña no cambia.</p>
        <Link href="/app" className="block rounded-lg bg-aproba-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aproba-700">Entrar en Aproba</Link>
      </div>
    );
  }
  if (estado === "error") {
    return (
      <div className="mt-5 space-y-5">
        <p role="alert" className="text-sm leading-relaxed text-red-600">{error}</p>
        <Link href="/app/ajustes" className="block rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400">Ir a Ajustes</Link>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-5">
      <p className="text-sm leading-relaxed text-slate-600">Vas a usar <strong className="break-all text-slate-900">{email}</strong> como email de acceso a Aproba. Tu contraseña no cambia.</p>
      <button type="button" onClick={confirmar} disabled={estado === "enviando"} className="w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
        {estado === "enviando" ? "Confirmando…" : "Confirmar mi nuevo email"}
      </button>
    </div>
  );
}
