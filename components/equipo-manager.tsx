"use client";

import { useState } from "react";
import type { Equipo, Miembro } from "@/lib/data/equipo";
import {
  PLAN_IDS, PLANES, ROLES, ROLES_ASIGNABLES, planLabel, plyMax, seatsLabel,
  puedeGestionarEquipo, puedeAsignarRol, type RolId,
} from "@/lib/planes";

function Avatar({ m }: { m: Miembro }) {
  const ini = m.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  if (m.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />;
  }
  return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aproba-100 text-xs font-bold text-aproba-700">{ini}</span>;
}

async function callEquipo(payload: Record<string, unknown>) {
  const res = await fetch("/api/equipo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as Record<string, unknown> };
}

const ESTADOS_SUB: Record<string, { label: string; pill: string }> = {
  TRIAL: { label: "Prueba", pill: "bg-amber-100 text-amber-700" },
  ACTIVA: { label: "Activa", pill: "bg-green-100 text-green-700" },
  PAST_DUE: { label: "Pago pendiente", pill: "bg-red-100 text-red-700" },
  CANCELADA: { label: "Cancelada", pill: "bg-slate-200 text-slate-600" },
};

const fmtFecha = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export function EquipoManager({ inicial }: { inicial: Equipo }) {
  const [miembros, setMiembros] = useState<Miembro[]>(inicial.miembros);
  const [plan, setPlan] = useState<string>(inicial.plan);
  const { miRol, estado, trialEndsAt, currentPeriodEnd, suscripcionStripe, billingDisponible } = inicial;

  const puedeGestionar = puedeGestionarEquipo(miRol);
  const max = plyMax(plan);
  const usados = miembros.length;
  const sinSitio = usados >= max;
  const rolesQuePuedoAsignar = ROLES_ASIGNABLES.filter((r) => puedeAsignarRol(miRol, r));

  // Invitation
  const [invEmail, setInvEmail] = useState("");
  const [invNombre, setInvNombre] = useState("");
  const [invRole, setInvRole] = useState<RolId>(rolesQuePuedoAsignar.includes("GESTOR") ? "GESTOR" : (rolesQuePuedoAsignar[0] ?? "GESTOR"));
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<{ email: string; password: string } | null>(null);

  // Plan
  const [planPendiente, setPlanPendiente] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Facturation Stripe (checkout / portal)
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const estadoSub = ESTADOS_SUB[estado] ?? ESTADOS_SUB.TRIAL;
  const diasPrueba = trialEndsAt ? Math.ceil((Date.parse(trialEndsAt) - Date.now()) / 86_400_000) : null;

  async function abrirBilling(endpoint: "checkout" | "portal") {
    setBillingError(null);
    setBillingBusy(true);
    const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setBillingBusy(false);
      setBillingError(String(data.error ?? "No se pudo abrir la página de pago."));
      return;
    }
    window.location.href = data.url as string; // Stripe Checkout / Customer Portal
  }

  // Lignes
  const [filaBusy, setFilaBusy] = useState<string | null>(null);
  const [filaError, setFilaError] = useState<string | null>(null);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setInvError(null);
    setCredenciales(null);
    setInvBusy(true);
    const { ok, data } = await callEquipo({ action: "invitar", email: invEmail, nombre: invNombre, role: invRole });
    setInvBusy(false);
    if (!ok) {
      setInvError(String(data.error ?? "No se pudo invitar."));
      return;
    }
    setMiembros((prev) => [...prev, data.miembro as Miembro]);
    if (data.tempPassword) setCredenciales({ email: (data.miembro as Miembro).email, password: String(data.tempPassword) });
    setInvEmail("");
    setInvNombre("");
  }

  async function cambiarRol(m: Miembro, role: string) {
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const { ok, data } = await callEquipo({ action: "rol", membershipId: m.membershipId, role });
    setFilaBusy(null);
    if (!ok) { setFilaError(String(data.error ?? "No se pudo cambiar el rol.")); return; }
    setMiembros((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, role: role as RolId } : x)));
  }

  async function quitar(m: Miembro) {
    if (!confirm(`¿Quitar a ${m.nombre} del equipo? Perderá el acceso a este despacho.`)) return;
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const { ok, data } = await callEquipo({ action: "eliminar", membershipId: m.membershipId });
    setFilaBusy(null);
    if (!ok) { setFilaError(String(data.error ?? "No se pudo quitar.")); return; }
    setMiembros((prev) => prev.filter((x) => x.membershipId !== m.membershipId));
  }

  async function confirmarPlan() {
    if (!planPendiente) return;
    setPlanError(null);
    setPlanBusy(true);
    const { ok, data } = await callEquipo({ action: "plan", plan: planPendiente });
    setPlanBusy(false);
    if (!ok) { setPlanError(String(data.error ?? "No se pudo cambiar el plan.")); return; }
    setPlan(String(data.plan));
    setPlanPendiente(null);
  }

  return (
    <div className="space-y-6">
      {/* ── Plan + sièges ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Plan</h3>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {planLabel(plan)} <span className="text-sm font-medium text-slate-400">· {PLANES[plan as keyof typeof PLANES]?.precio}€/mes</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${estadoSub.pill}`}>{estadoSub.label}</span>
              {estado === "TRIAL" && diasPrueba !== null && (
                <span>{diasPrueba > 0 ? `quedan ${diasPrueba} ${diasPrueba === 1 ? "día" : "días"} de prueba` : "la prueba ha terminado"}</span>
              )}
              {estado === "ACTIVA" && currentPeriodEnd && <span>se renueva el {fmtFecha(currentPeriodEnd)}</span>}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${sinSitio ? "bg-amber-100 text-amber-700" : "bg-aproba-100 text-aproba-700"}`}>
            {seatsLabel(usados, plan)}
          </span>
        </div>

        {/* Activation / gestion de la facturation (Stripe) — visible solo para administradores */}
        {puedeGestionar && billingDisponible && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {suscripcionStripe ? (
              <button
                type="button"
                disabled={billingBusy}
                onClick={() => abrirBilling("portal")}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50"
              >
                {billingBusy ? "Abriendo…" : "Gestionar facturación"}
              </button>
            ) : (
              <button
                type="button"
                disabled={billingBusy}
                onClick={() => abrirBilling("checkout")}
                className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
              >
                {billingBusy ? "Abriendo…" : "Activar suscripción"}
              </button>
            )}
            {!suscripcionStripe && <span className="text-xs text-slate-400">Añade una tarjeta — no se cobra hasta el final de la prueba.</span>}
            {billingError && <span className="text-sm text-red-600">{billingError}</span>}
          </div>
        )}

        {puedeGestionar && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-xs font-medium text-slate-500">Cambiar de plan</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PLAN_IDS.map((id) => {
                const p = PLANES[id];
                const activo = plan === id;
                const tooSmall = usados > p.maxUsuarios;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={activo || tooSmall}
                    onClick={() => { setPlanError(null); setPlanPendiente(id); }}
                    title={tooSmall ? `Tu equipo tiene ${usados} usuarios; este plan permite ${p.maxUsuarios}.` : ""}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      activo ? "border-aproba-600 bg-aproba-50 ring-1 ring-aproba-600"
                      : tooSmall ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                      : "border-slate-200 hover:border-aproba-400"
                    }`}
                  >
                    <span className="font-semibold text-slate-800">{p.label}</span>
                    <span className="block text-xs text-slate-500">
                      {p.precio}€/mes · {p.maxUsuarios === Infinity ? "∞ usuarios" : `${p.maxUsuarios} usuario${p.maxUsuarios > 1 ? "s" : ""}`}
                    </span>
                    {activo && <span className="text-[11px] font-semibold text-aproba-700">Plan actual</span>}
                  </button>
                );
              })}
            </div>

            {planPendiente && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  Cambiar a <strong>{planLabel(planPendiente)}</strong> ({PLANES[planPendiente as keyof typeof PLANES]?.precio}€/mes)
                  {suscripcionStripe && <span className="text-slate-500"> — se aplicará prorrateo en tu próxima factura</span>}
                </span>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setPlanPendiente(null)} className="rounded-md px-3 py-1 text-slate-500 hover:bg-white">Cancelar</button>
                  <button type="button" disabled={planBusy} onClick={confirmarPlan} className="rounded-md bg-aproba-600 px-3 py-1 font-semibold text-white hover:bg-aproba-700 disabled:bg-slate-300">
                    {planBusy ? "Cambiando…" : "Confirmar"}
                  </button>
                </div>
              </div>
            )}
            {planError && <p className="mt-2 text-sm text-red-600">{planError}</p>}
          </div>
        )}
      </div>

      {/* ── Miembros ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Miembros del equipo</h3>
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {miembros.map((m) => {
            const gestionable = puedeGestionar && !m.esYo && m.role !== "OWNER" && puedeAsignarRol(miRol, m.role);
            return (
              <li key={m.membershipId} className="flex flex-col gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar m={m} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {m.nombre}{m.esYo && <span className="ml-1.5 text-xs font-normal text-slate-400">(tú)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-400">{m.email}</p>
                  </div>
                </div>

                {gestionable ? (
                  <div className="flex items-center gap-2 pl-12 sm:pl-0">
                    <select
                      value={m.role}
                      disabled={filaBusy === m.membershipId}
                      onChange={(e) => cambiarRol(m, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-aproba-600 sm:flex-none"
                    >
                      {rolesQuePuedoAsignar.map((r) => (
                        <option key={r} value={r}>{ROLES[r].label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => quitar(m)}
                      disabled={filaBusy === m.membershipId}
                      title="Quitar del equipo"
                      className="flex-none rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                    </button>
                  </div>
                ) : (
                  <span className={`ml-12 self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:ml-0 sm:self-auto ${ROLES[m.role].pill}`} title={ROLES[m.role].desc}>
                    {ROLES[m.role].label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {filaError && <p className="mt-2 text-sm text-red-600">{filaError}</p>}
      </div>

      {/* ── Inviter ───────────────────────────────────────────────────── */}
      {puedeGestionar && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-800">Invitar a un miembro</h3>
          {sinSitio ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Has alcanzado el límite de tu plan ({max} {max === 1 ? "usuario" : "usuarios"}). Sube de plan arriba para invitar a más.
            </p>
          ) : (
            <form onSubmit={invitar} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
                  placeholder="email@despacho.es"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                />
                <input
                  type="text" value={invNombre} onChange={(e) => setInvNombre(e.target.value)}
                  placeholder="Nombre y apellidos"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-500">Rol</label>
                <select
                  value={invRole} onChange={(e) => setInvRole(e.target.value as RolId)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-aproba-600"
                >
                  {rolesQuePuedoAsignar.map((r) => (
                    <option key={r} value={r}>{ROLES[r].label} — {ROLES[r].desc}</option>
                  ))}
                </select>
                <button
                  type="submit" disabled={invBusy}
                  className="ml-auto rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  {invBusy ? "Invitando…" : "Invitar"}
                </button>
              </div>
              {invError && <p className="text-sm text-red-600">{invError}</p>}
            </form>
          )}

          {/* Credenciales d'un nouvel utilisateur (pas d'envoi email pour l'instant) */}
          {credenciales && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
              <p className="font-semibold text-green-800">Usuario añadido ✓ — comparte estas credenciales</p>
              <p className="mt-1 text-green-700">La persona podrá entrar en Aproba y cambiar su contraseña después.</p>
              <div className="mt-2 space-y-1 font-mono text-xs text-slate-700">
                <p>Email: <strong>{credenciales.email}</strong></p>
                <p>Contraseña temporal: <strong>{credenciales.password}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`Email: ${credenciales.email}\nContraseña: ${credenciales.password}\nEntra en https://aproba-software.com/login`)}
                className="mt-3 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
              >
                Copiar credenciales
              </button>
            </div>
          )}
        </div>
      )}

      {!puedeGestionar && (
        <p className="text-sm text-slate-400">Solo los administradores pueden gestionar el equipo.</p>
      )}
    </div>
  );
}
