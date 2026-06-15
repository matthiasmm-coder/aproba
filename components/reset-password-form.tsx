"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";

// Le lien de récupération amène ici avec une session de recovery (détectée dans
// l'URL par le client). On affiche le formulaire de nouveau mot de passe et on
// appelle updateUser. Si aucune session valide → lien invalide/expiré.
export function ResetPasswordForm() {
  const router = useRouter();
  const [estado, setEstado] = useState<"cargando" | "listo" | "invalido">("cargando");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    const sb = createSupabaseBrowser();
    let resuelto = false;
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) { resuelto = true; setEstado("listo"); }
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session) { resuelto = true; setEstado("listo"); }
      else window.setTimeout(() => { if (!resuelto) setEstado("invalido"); }, 2500);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== password2) { setError("Las contraseñas no coinciden."); return; }
    setLoading(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setHecho(true);
    window.setTimeout(() => { router.push("/app"); router.refresh(); }, 1200);
  }

  if (hecho) {
    return (
      <div className="mt-6 rounded-lg border border-aproba-100 bg-aproba-50 p-4 text-sm text-aproba-800">
        <p className="font-semibold">Contraseña actualizada ✓</p>
        <p className="mt-1 text-aproba-700">Te estamos llevando a tu panel…</p>
      </div>
    );
  }

  if (estado === "invalido") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">Enlace no válido o caducado</p>
        <p className="mt-1 text-amber-700">Vuelve a solicitar un enlace de recuperación.</p>
        <Link href="/forgot-password" className="mt-3 inline-block font-semibold text-aproba-700 hover:underline">Pedir un nuevo enlace</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="pw" className="text-sm font-medium text-slate-700">Nueva contraseña</label>
        <input
          id="pw" type="password" required autoComplete="new-password" minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
          disabled={estado !== "listo"}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 disabled:bg-slate-50"
        />
      </div>
      <div>
        <label htmlFor="pw2" className="text-sm font-medium text-slate-700">Repite la contraseña</label>
        <input
          id="pw2" type="password" required autoComplete="new-password"
          value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••"
          disabled={estado !== "listo"}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 disabled:bg-slate-50"
        />
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        type="submit" disabled={loading || estado !== "listo"}
        className="block w-full rounded-lg bg-aproba-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
      >
        {estado === "cargando" ? "Cargando…" : loading ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
