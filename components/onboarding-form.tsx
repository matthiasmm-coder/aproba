"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PLAN_IDS, PLANES, TIPOS, type PlanId } from "@/lib/planes";

export function OnboardingForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("GESTORIA");
  const [plan, setPlan] = useState<PlanId>("PRO");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) {
      setError("Indica el nombre de tu despacho.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();

    // create_workspace (SECURITY DEFINER) crée Workspace + Membership(OWNER) + Subscription(TRIAL)
    // avec le plan choisi — atomique côté serveur (les tables de gouvernance sont en lecture
    // seule pour le client : aucune écriture directe possible).
    const { error: rpcError } = await supabase.rpc("create_workspace", {
      p_nombre: nombre.trim(),
      p_tipo: tipo,
      p_plan: plan,
    });
    if (rpcError) {
      setLoading(false);
      setError(rpcError.message ?? "No se pudo crear el espacio de trabajo.");
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Nom du despacho */}
      <div>
        <label htmlFor="ws-nombre" className="text-sm font-semibold text-slate-800">Nombre de tu despacho</label>
        <input
          id="ws-nombre"
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Gestoría Vallès"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
        />
      </div>

      {/* Type */}
      <div>
        <p className="text-sm font-semibold text-slate-800">Tipo de despacho</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={`rounded-xl border p-3 text-left transition ${
                tipo === t.id ? "border-aproba-600 bg-aproba-50 ring-1 ring-aproba-600" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800">{t.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Plan */}
      <div>
        <p className="text-sm font-semibold text-slate-800">Elige tu plan</p>
        <p className="text-xs text-slate-500">14 días gratis. Puedes cambiarlo o invitar a tu equipo cuando quieras.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const p = PLANES[id];
            const activo = plan === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPlan(id)}
                className={`relative flex flex-col rounded-2xl border p-4 text-left transition ${
                  activo ? "border-aproba-600 bg-aproba-50/60 ring-1 ring-aproba-600" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {id === "PRO" && (
                  <span className="absolute -top-2 right-3 rounded-full bg-aproba-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Popular
                  </span>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-900">{p.label}</span>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${activo ? "border-aproba-600 bg-aproba-600" : "border-slate-300"}`}>
                    {activo && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="mt-1">
                  <span className="text-2xl font-extrabold tracking-tight text-slate-900">{p.precio}€</span>
                  <span className="text-xs text-slate-500">/mes</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{p.para}</p>
                <ul className="mt-3 space-y-1">
                  {p.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <svg className="mt-0.5 h-3 w-3 flex-none text-aproba-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="block w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
      >
        {loading ? "Preparando tu espacio…" : "Empezar a usar Aproba"}
      </button>
    </form>
  );
}
