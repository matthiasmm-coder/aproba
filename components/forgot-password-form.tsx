"use client";

import { useState } from "react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="mt-6 rounded-lg border border-aproba-100 bg-aproba-50 p-4 text-sm text-aproba-800">
        <p className="font-semibold">Revisa tu correo</p>
        <p className="mt-1 text-aproba-700">
          Si <strong>{email}</strong> corresponde a una cuenta, te hemos enviado un enlace para restablecer tu contraseña. Caduca en 1 hora.
        </p>
        <Link href="/login" className="mt-3 inline-block font-semibold text-aproba-700 hover:underline">← Volver a entrar</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@gestoria.es"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="block w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
      >
        {loading ? "Enviando…" : "Enviar enlace de recuperación"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-aproba-700 hover:underline">← Volver a entrar</Link>
      </p>
    </form>
  );
}
