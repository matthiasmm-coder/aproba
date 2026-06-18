"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Arrivée via le bouton violet « Prueba 1 mes » (cookie posé par /prueba).
  const [esPrueba, setEsPrueba] = useState(false);
  useEffect(() => { setEsPrueba(typeof document !== "undefined" && document.cookie.includes("aproba.modo=prueba")); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // 1) Création du compte (route serveur, utilisateur confirmé d'emblée).
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "No se pudo crear la cuenta.");
      return;
    }

    // 2) Connexion immédiate → puis onboarding (nombre del despacho + plan).
    const supabase = createSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError("Cuenta creada, pero no pudimos iniciar sesión. Prueba a entrar manualmente.");
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="nombre" className="text-sm font-medium text-slate-700">Tu nombre</label>
        <input
          id="nombre"
          type="text"
          required
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Marta Ribas"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
      </div>
      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Email de trabajo</label>
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
      <div>
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="block w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
      >
        {loading ? "Creando tu cuenta…" : "Crear cuenta gratis"}
      </button>
      <p className="text-center text-xs text-slate-400">{esPrueba ? "1 mes de prueba · sin tarjeta" : "14 días de prueba · sin tarjeta"}</p>
    </form>
  );
}
