"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PLAN_IDS, PLANES, TIPOS, type PlanId } from "@/lib/planes";
import { DEFAULT_SERVICIOS, type Servicio } from "@/lib/servicios";
import { guardarServicios } from "@/lib/config-browser";

export function OnboardingForm() {
  const router = useRouter();
  const [paso, setPaso] = useState<0 | 1>(0);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("GESTORIA");
  const [plan, setPlan] = useState<PlanId>("PRO");
  // Étape 2 : el gestor configura sus servicios (nada pre-aplicado hasta que confirma).
  const [servicios, setServicios] = useState<Servicio[]>(() => DEFAULT_SERVICIOS.map((s) => ({ ...s })));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hayActivos = servicios.some((s) => s.active);

  function patchSrv(id: string, patch: Partial<Servicio>) {
    setServicios((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        next.precio = (next.anticipo || 0) + (next.resto || 0);
        return next;
      }),
    );
  }

  function irAServicios(e: React.FormEvent) {
    e.preventDefault();
    if (nombre.trim().length < 2) { setError("Indica el nombre de tu despacho."); return; }
    setError(null);
    setPaso(1);
  }

  // Crea el workspace, guarda los servicios y lleva a la pasarela de pago (tarjeta
  // obligatoria, prueba de 14 días). Si Stripe no está configurado, entra directo.
  async function finalizar() {
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();

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

    // Guardar la configuración de servicios del gestor (no bloqueante).
    try { await guardarServicios(servicios, []); } catch { /* se podrá ajustar después */ }

    // Tarjeta: Stripe Checkout (no se cobra hasta el final de la prueba).
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volverA: "/app" }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) { window.location.href = url; return; }
      }
      // 503 (Stripe no configurado) u otro error → entrar sin tarjeta.
    } catch { /* ignore */ }

    router.push("/app");
    router.refresh();
  }

  // ── Paso 1 · Despacho + plan ──────────────────────────────────────────────
  if (paso === 0) {
    return (
      <form onSubmit={irAServicios} className="space-y-8">
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

        <div>
          <p className="text-sm font-semibold text-slate-800">Elige tu plan</p>
          <p className="text-xs text-slate-500">14 días gratis. Te pediremos una tarjeta para empezar, pero no se cobra nada hasta el final de la prueba. Cancela cuando quieras.</p>
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
          className="block w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700"
        >
          Continuar
        </button>
      </form>
    );
  }

  // ── Paso 2 · Servicios ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Configura tus servicios</h2>
        <p className="mt-1 text-sm text-slate-500">
          Activa los trámites que ofreces y define su precio (al empezar + al finalizar). Es lo que verá tu cliente. Podrás cambiarlo en cualquier momento en <strong className="font-semibold text-slate-700">Ajustes</strong>.
        </p>
      </div>

      <div className="space-y-3">
        {servicios.map((s) => (
          <div key={s.id} className={`rounded-xl border p-4 transition ${s.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/60"}`}>
            <div className="flex items-center justify-between gap-3">
              <input
                value={s.label}
                onChange={(e) => patchSrv(s.id, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 outline-none hover:border-slate-200 focus:border-aproba-400 focus:bg-white"
              />
              <button
                type="button"
                role="switch"
                aria-checked={s.active}
                onClick={() => patchSrv(s.id, { active: !s.active })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${s.active ? "bg-aproba-600" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.active ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            {s.active && (
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="text-xs text-slate-500">
                  Al empezar (€)
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={s.anticipo}
                    onChange={(e) => patchSrv(s.id, { anticipo: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Al finalizar (€)
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={s.resto}
                    onChange={(e) => patchSrv(s.id, { resto: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                  />
                </label>
                <div className="self-end text-xs text-slate-400">
                  Total honorarios: <span className="font-semibold text-slate-600">{(s.anticipo || 0) + (s.resto || 0)} €</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!hayActivos && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Activa al menos un servicio para continuar.</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => { setError(null); setPaso(0); }}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
        >
          Atrás
        </button>
        <button
          type="button"
          onClick={finalizar}
          disabled={loading || !hayActivos}
          className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Preparando tu espacio…" : "Empezar prueba de 14 días"}
        </button>
      </div>
    </div>
  );
}
