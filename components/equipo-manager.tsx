"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipo, Miembro } from "@/lib/data/equipo";
import {
  PLAN_IDS, PLANES, ROLES, ROLES_ASIGNABLES, planLabel, plyMax, seatsLabel,
  puedeGestionarEquipo, puedeAsignarRol, type RolId,
} from "@/lib/planes";
import { useT } from "@/components/lang-provider";
import { confirmar } from "@/components/confirm-dialog";

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

// `oficinas` (multi-oficina, Business) : la sede se elige EN LA FILA del miembro, junto a
// su rol — es el mismo gesto, sobre la misma persona. Un bloque aparte repetía la lista
// entera del equipo para una sola columna. Solo aparece a partir de DOS oficinas: con una
// sola, elegir entre «Todas» y la única sede no cambia absolutamente nada de lo que ve.
export function EquipoManager({ inicial, oficinas = [] }: { inicial: Equipo; oficinas?: { id: string; nombre: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [miembros, setMiembros] = useState<Miembro[]>(inicial.miembros);
  const [plan, setPlan] = useState<string>(inicial.plan);
  const { miRol, estado, trialEndsAt, currentPeriodEnd, suscripcionStripe, billingDisponible, tarjeta } = inicial;

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
  // `enviado` distingue « ya lo tiene en su correo » de « pásaselas tú » : sin eso,
  // el administrador no sabe si copiar la contraseña o no (y si no copia y el envío
  // falló, la persona se queda fuera — pasó con el equipo de Gesnet).
  const [credenciales, setCredenciales] = useState<{ email: string; password: string; enviado: boolean } | null>(null);

  // Plan
  const [planPendiente, setPlanPendiente] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Facturation Stripe (checkout / portal)
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  // Ciclo elegido para el checkout de «Añadir tarjeta» — el anual (2 meses gratis) también aquí, no solo en /onboarding/pago.
  const [intervalo, setIntervalo] = useState<"mensual" | "anual">("mensual");

  // Résiliation (à la fin de période) / réactivation
  const [cancelAtEnd, setCancelAtEnd] = useState(inicial.cancelAtPeriodEnd);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [confirmarCancel, setConfirmarCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancelarSuscripcion(reactivar: boolean) {
    setCancelError(null);
    setCancelBusy(true);
    const res = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: reactivar ? "reactivar" : "cancelar" }),
    });
    const data = await res.json().catch(() => ({}));
    setCancelBusy(false);
    if (!res.ok) { setCancelError(String(data.error ?? t("No se pudo completar la operación."))); return; }
    setCancelAtEnd(!reactivar);
    setConfirmarCancel(false);
  }

  const estadoSub = ESTADOS_SUB[estado] ?? ESTADOS_SUB.TRIAL;
  const diasPrueba = trialEndsAt ? Math.ceil((Date.parse(trialEndsAt) - Date.now()) / 86_400_000) : null;

  async function abrirBilling(endpoint: "checkout" | "portal") {
    setBillingError(null);
    setBillingBusy(true);
    const res = await fetch(`/api/billing/${endpoint}`, {
      method: "POST",
      ...(endpoint === "checkout"
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalo }) }
        : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setBillingBusy(false);
      setBillingError(String(data.error ?? t("No se pudo abrir la página de pago.")));
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
      setInvError(String(data.error ?? t("No se pudo invitar.")));
      return;
    }
    setMiembros((prev) => [...prev, data.miembro as Miembro]);
    if (data.tempPassword) setCredenciales({ email: (data.miembro as Miembro).email, password: String(data.tempPassword), enviado: Boolean(data.emailEnviado) });
    setInvEmail("");
    setInvNombre("");
  }

  // Renombrado inline: cada uno puede cambiar SU nombre; los admins, el de los demás
  // (la jerarquía exacta la impone el servidor). Enter guarda, Escape cancela.
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreDraft, setNombreDraft] = useState("");

  async function renombrar(m: Miembro) {
    const limpio = nombreDraft.trim().replace(/\s+/g, " ");
    if (limpio === m.nombre || limpio.length < 2) { setRenombrando(null); return; }
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const { ok, data } = await callEquipo({ action: "renombrar", membershipId: m.membershipId, nombre: limpio });
    setFilaBusy(null);
    if (!ok) { setFilaError(String(data.error ?? t("No se pudo cambiar el nombre."))); return; }
    setMiembros((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, nombre: String(data.nombre) } : x)));
    setRenombrando(null);
    if (m.esYo) router.refresh(); // el «Hola, X» del dashboard y la tarjeta Cuenta
  }

  async function cambiarRol(m: Miembro, role: string) {
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const { ok, data } = await callEquipo({ action: "rol", membershipId: m.membershipId, role });
    setFilaBusy(null);
    if (!ok) { setFilaError(String(data.error ?? t("No se pudo cambiar el rol."))); return; }
    setMiembros((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, role: role as RolId } : x)));
  }

  // Multi-sedes : chaque case cochée/décochée renvoie le array COMPLET (la primaire
  // = la première). Les administrateurs ne passent jamais ici (badge fixe « Todas »).
  async function asignarOficinas(m: Miembro, oficinaIds: string[]) {
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const res = await fetch("/api/oficinas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "asignar", membershipId: m.membershipId, oficinaIds }) });
    const data = await res.json().catch(() => ({}));
    setFilaBusy(null);
    if (!res.ok) { setFilaError(String(data.error ?? t("No se pudo asignar la oficina."))); return; }
    const nuevos = (data.oficinaIds as string[] | undefined) ?? [];
    setMiembros((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, oficinaIds: nuevos, oficinaId: nuevos[0] ?? null } : x)));
    router.refresh(); // los contadores «N usuarios» de la lista de oficinas, justo debajo
  }

  async function quitar(m: Miembro) {
    if (!(await confirmar({ mensaje: `${t("¿Quitar a")} ${m.nombre} ${t("del equipo? Perderá el acceso a este despacho.")}`, peligro: true, confirmarLabel: t("Quitar") }))) return;
    setFilaError(null);
    setFilaBusy(m.membershipId);
    const { ok, data } = await callEquipo({ action: "eliminar", membershipId: m.membershipId });
    setFilaBusy(null);
    if (!ok) { setFilaError(String(data.error ?? t("No se pudo quitar."))); return; }
    setMiembros((prev) => prev.filter((x) => x.membershipId !== m.membershipId));
  }

  async function confirmarPlan() {
    if (!planPendiente) return;
    setPlanError(null);
    setPlanBusy(true);
    const { ok, data } = await callEquipo({ action: "plan", plan: planPendiente });
    setPlanBusy(false);
    if (!ok) { setPlanError(String(data.error ?? t("No se pudo cambiar el plan."))); return; }
    setPlan(String(data.plan));
    setPlanPendiente(null);
  }

  // El toggle Mensual/Anual solo existe en el estado «sin tarjeta y sin suscripción»;
  // ahí TODOS los precios visibles siguen el ciclo elegido (anual = 10× mensual,
  // «2 meses gratis»). Con suscripción activa se mantiene €/mes (no conocemos aquí
  // el ciclo real de Stripe y el toggle no se muestra).
  const eligeCiclo = puedeGestionar && billingDisponible && !tarjeta && !suscripcionStripe;
  const precioCiclo = (mensual: number) =>
    eligeCiclo && intervalo === "anual" ? `${mensual * 10} ${t("€/año")} + IVA` : `${mensual} ${t("€/mes")} + IVA`;

  return (
    <div className="space-y-6">
      {/* ── Plan + sièges ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Plan")}</h3>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {t(planLabel(plan))} <span className="text-sm font-medium text-slate-400">· {precioCiclo(PLANES[plan as keyof typeof PLANES]?.precio ?? 0)}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${estadoSub.pill}`}>{t(estadoSub.label)}</span>
              {estado === "TRIAL" && diasPrueba !== null && (
                <span>{diasPrueba > 0 ? `${t("quedan")} ${diasPrueba} ${diasPrueba === 1 ? t("día") : t("días")} ${t("de prueba")}` : t("la prueba ha terminado")}</span>
              )}
              {estado === "ACTIVA" && currentPeriodEnd && <span>{t("se renueva el")} {fmtFecha(currentPeriodEnd)}</span>}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${sinSitio ? "bg-amber-100 text-amber-700" : "bg-aproba-100 text-aproba-700"}`}>
            {t(seatsLabel(usados, plan))}
          </span>
        </div>

        {/* Tarjeta de pago de la suscripción — solo administradores. La suscripción
            se activa sola al final de la prueba con la tarjeta añadida al registrarse;
            aquí el admin ve y cambia la tarjeta que paga. */}
        {puedeGestionar && billingDisponible && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {tarjeta ? (
              <>
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                  {t("Paga con")} <span className="font-semibold capitalize">{tarjeta.brand}</span> ···· {tarjeta.last4}
                </span>
                <button
                  type="button"
                  disabled={billingBusy}
                  onClick={() => abrirBilling("portal")}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50"
                >
                  {billingBusy ? t("Abriendo…") : t("Cambiar tarjeta")}
                </button>
              </>
            ) : suscripcionStripe ? (
              <button
                type="button"
                disabled={billingBusy}
                onClick={() => abrirBilling("portal")}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-50"
              >
                {billingBusy ? t("Abriendo…") : t("Gestionar facturación")}
              </button>
            ) : (
              <div className="w-full text-center">
                <button
                  type="button"
                  disabled={billingBusy}
                  onClick={() => abrirBilling("checkout")}
                  className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  {billingBusy ? t("Abriendo…") : t("Añadir tarjeta de pago")}
                </button>
                <p className="mx-auto mt-2 text-xs text-slate-400">{t("Tu suscripción se activará al añadir una tarjeta de pago. No se cobra hasta el final de la prueba.")}</p>
                <div className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-2" role="radiogroup" aria-label={t("Ciclo de facturación")}>
                  {([{ id: "mensual" as const, label: t("Mensual"), nota: null }, { id: "anual" as const, label: t("Anual"), nota: t("2 meses gratis") }]).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={intervalo === o.id}
                      onClick={() => setIntervalo(o.id)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${intervalo === o.id ? "border-aproba-600 bg-aproba-50 text-aproba-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      {o.label}
                      {o.nota && <span className={`block text-xs font-medium ${intervalo === o.id ? "text-aproba-600" : "text-slate-400"}`}>{o.nota}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {billingError && <span className="w-full text-center text-sm text-red-600">{billingError}</span>}
          </div>
        )}

        {/* Résiliation / réactivation (admin, abonnement Stripe actif) */}
        {puedeGestionar && billingDisponible && suscripcionStripe && (
          <div className="mt-3">
            {cancelAtEnd ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span className="text-amber-700">
                  {t("Tu suscripción se cancelará")}{currentPeriodEnd ? ` ${t("el")} ${fmtFecha(currentPeriodEnd)}` : ` ${t("al final del periodo")}`}. {t("Mantienes el acceso hasta entonces.")}
                </span>
                <button type="button" disabled={cancelBusy} onClick={() => cancelarSuscripcion(true)} className="ml-auto rounded-lg border border-aproba-300 bg-white px-3 py-1.5 text-xs font-semibold text-aproba-700 transition hover:bg-aproba-50 disabled:opacity-50">
                  {cancelBusy ? "…" : t("Reactivar suscripción")}
                </button>
              </div>
            ) : confirmarCancel ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm">
                <p className="text-red-700">{t("¿Seguro que quieres cancelar? Mantendrás el acceso hasta el final del periodo")}{currentPeriodEnd ? ` (${fmtFecha(currentPeriodEnd)})` : ""} {t("y no se te volverá a cobrar.")}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={cancelBusy} onClick={() => cancelarSuscripcion(false)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">{cancelBusy ? t("Cancelando…") : t("Sí, cancelar")}</button>
                  <button type="button" onClick={() => setConfirmarCancel(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400">{t("Volver")}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setCancelError(null); setConfirmarCancel(true); }} className="text-xs font-medium text-slate-400 underline-offset-2 transition hover:text-red-600 hover:underline">
                {t("Cancelar suscripción")}
              </button>
            )}
            {cancelError && <p className="mt-1 text-sm text-red-600">{cancelError}</p>}
          </div>
        )}

        {puedeGestionar && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-xs font-medium text-slate-500">{t("Elegir plan")}</p>
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
                    title={tooSmall ? `${t("Tu equipo tiene")} ${usados} ${t("usuarios; este plan permite")} ${p.maxUsuarios}.` : ""}
                    className={`rounded-lg border px-3 py-2 text-center text-sm transition ${
                      activo ? "border-aproba-600 bg-aproba-50 ring-1 ring-aproba-600"
                      : tooSmall ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                      : "border-slate-200 hover:border-aproba-400"
                    }`}
                  >
                    <span className="font-semibold text-slate-800">{t(p.label)}</span>
                    <span className="block text-xs text-slate-500">
                      {precioCiclo(p.precio)} · {p.maxUsuarios === Infinity ? t("∞ usuarios") : `${p.maxUsuarios} ${p.maxUsuarios > 1 ? t("usuarios") : t("usuario")}`}
                    </span>
                    {activo && <span className="text-[11px] font-semibold text-aproba-700">{t("Plan actual")}</span>}
                  </button>
                );
              })}
            </div>

            {planPendiente && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-aproba-200 bg-aproba-50 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {t("Cambiar a")} <strong>{t(planLabel(planPendiente))}</strong> ({precioCiclo(PLANES[planPendiente as keyof typeof PLANES]?.precio ?? 0)})
                  {suscripcionStripe && <span className="text-slate-500"> {t("— se aplicará prorrateo en tu próxima factura")}</span>}
                </span>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setPlanPendiente(null)} className="rounded-md px-3 py-1 text-slate-500 hover:bg-white">{t("Cancelar")}</button>
                  <button type="button" disabled={planBusy} onClick={confirmarPlan} className="rounded-md bg-aproba-600 px-3 py-1 font-semibold text-white hover:bg-aproba-700 disabled:bg-slate-300">
                    {planBusy ? t("Cambiando…") : t("Confirmar")}
                  </button>
                </div>
              </div>
            )}
            {planError && <p className="mt-2 text-sm text-red-600">{planError}</p>}

            {/* Recordatorio del código promo, al pie — solo cuando hay checkout por delante. */}
            {eligeCiclo && (
              <p className="mt-4 text-center text-xs text-aproba-700">{t("¿Tienes un código promocional? Podrás introducirlo en la página de pago.")}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Miembros ──────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("Miembros del equipo")}</h3>
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {miembros.map((m) => {
            const gestionable = puedeGestionar && !m.esYo && m.role !== "OWNER" && puedeAsignarRol(miRol, m.role);
            return (
              <li key={m.membershipId} className="flex flex-col gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar m={m} />
                  <div className="min-w-0 flex-1">
                    {renombrando === m.membershipId ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={nombreDraft}
                          onChange={(e) => setNombreDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renombrar(m); if (e.key === "Escape") setRenombrando(null); }}
                          maxLength={80}
                          autoFocus
                          disabled={filaBusy === m.membershipId}
                          className="w-full min-w-0 max-w-[240px] rounded-lg border border-slate-300 px-2 py-1 text-[16px] sm:text-sm font-medium text-slate-800 outline-none focus:border-aproba-600"
                        />
                        <button type="button" onClick={() => renombrar(m)} disabled={filaBusy === m.membershipId} className="shrink-0 rounded-lg bg-aproba-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-aproba-700 disabled:opacity-60">
                          {filaBusy === m.membershipId ? "…" : t("Guardar")}
                        </button>
                        <button type="button" onClick={() => setRenombrando(null)} className="shrink-0 rounded-lg px-1 py-1 text-xs text-slate-400 transition hover:text-slate-600">✕</button>
                      </div>
                    ) : (
                      <p className="group/nombre flex items-center gap-1 truncate text-sm font-medium text-slate-800">
                        <span className="truncate">{m.nombre}</span>
                        {m.esYo && <span className="shrink-0 text-xs font-normal text-slate-400">{t("(tú)")}</span>}
                        {(m.esYo || (puedeGestionar && (m.role !== "OWNER" || miRol === "OWNER"))) && (
                          <button
                            type="button"
                            onClick={() => { setNombreDraft(m.nombre); setRenombrando(m.membershipId); setFilaError(null); }}
                            title={t("Cambiar el nombre")}
                            aria-label={t("Cambiar el nombre")}
                            className="shrink-0 rounded-md p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-aproba-700"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                          </button>
                        )}
                      </p>
                    )}
                    <p className="truncate text-xs text-slate-400">{m.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  {/* Sede — regla: los ADMINISTRADORES nunca se anclan (ver todo es el
                      sentido de ser admin) → etiqueta fija. Gestores/asistentes: una o
                      VARIAS oficinas, con casillas. Los no-admins lo ven en gris. */}
                  {oficinas.length > 1 && (
                    (m.role === "OWNER" || m.role === "ADMIN") ? (
                      <span className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[13px] font-medium text-slate-400 sm:w-44 sm:flex-none"
                        title={t("Los administradores ven todas las oficinas.")}>
                        {t("Todas las oficinas")}
                      </span>
                    ) : (
                      <details className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
                        <summary className={`flex cursor-pointer list-none items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] sm:text-sm ${filaBusy === m.membershipId ? "opacity-60" : ""} ${!puedeGestionar ? "pointer-events-none opacity-60" : ""}`}>
                          <span className="truncate">
                            {(m.oficinaIds?.length ?? 0) === 0
                              ? t("Todas las oficinas")
                              : oficinas.filter((o) => m.oficinaIds.includes(o.id)).map((o) => o.nombre).join(" · ")}
                          </span>
                          <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </summary>
                        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                          {oficinas.map((o) => (
                            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={m.oficinaIds?.includes(o.id) ?? false}
                                disabled={filaBusy === m.membershipId}
                                onChange={(e) => {
                                  const actual = m.oficinaIds ?? [];
                                  asignarOficinas(m, e.target.checked ? [...actual, o.id] : actual.filter((x) => x !== o.id));
                                }}
                                className="h-4 w-4 rounded border-slate-300 accent-aproba-600"
                              />
                              <span className="truncate">{o.nombre}</span>
                            </label>
                          ))}
                          <p className="mt-1 border-t border-slate-100 px-2 pt-1.5 text-[11px] text-slate-400">
                            {t("Sin marcar ninguna: ve todas las oficinas.")}
                          </p>
                        </div>
                      </details>
                    )
                  )}
                  {/* Columna de ROL de ancho fijo: la pastilla «Administrador» es más
                      estrecha que el selector, y sin ancho fijo cada fila empujaba su
                      selector de oficina a una posición distinta. */}
                  <div className="flex min-w-0 flex-1 items-center sm:w-40 sm:flex-none">
                    {gestionable ? (
                      <select
                        value={m.role}
                        disabled={filaBusy === m.membershipId}
                        onChange={(e) => cambiarRol(m, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[16px] outline-none focus:border-aproba-600 sm:text-sm"
                      >
                        {rolesQuePuedoAsignar.map((r) => (
                          <option key={r} value={r}>{t(ROLES[r].label)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLES[m.role].pill}`} title={t(ROLES[m.role].desc)}>
                        {t(ROLES[m.role].label)}
                      </span>
                    )}
                  </div>
                  {/* Hueco de la papelera SIEMPRE reservado: las filas sin botón
                      (uno mismo, el propietario) desalineaban toda la rejilla. */}
                  <div className="w-7 flex-none">
                    {gestionable && (
                      <button
                        type="button"
                        onClick={() => quitar(m)}
                        disabled={filaBusy === m.membershipId}
                        title={t("Quitar del equipo")}
                        aria-label={t("Quitar del equipo")}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {filaError && <p className="mt-2 text-sm text-red-600">{filaError}</p>}
      </div>

      {/* ── Inviter ───────────────────────────────────────────────────── */}
      {puedeGestionar && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-800">{t("Invitar a un miembro")}</h3>
          {sinSitio ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t("Has alcanzado el límite de tu plan")} ({max} {max === 1 ? t("usuario") : t("usuarios")}). {t("Sube de plan arriba para invitar a más.")}
            </p>
          ) : (
            <form onSubmit={invitar} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
                  placeholder="email@despacho.es"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                />
                <input
                  type="text" value={invNombre} onChange={(e) => setInvNombre(e.target.value)}
                  placeholder={t("Nombre y apellidos")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-500">{t("Rol")}</label>
                <select
                  value={invRole} onChange={(e) => setInvRole(e.target.value as RolId)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[16px] sm:text-sm outline-none focus:border-aproba-600"
                >
                  {rolesQuePuedoAsignar.map((r) => (
                    <option key={r} value={r}>{t(ROLES[r].label)} — {t(ROLES[r].desc)}</option>
                  ))}
                </select>
                <button
                  type="submit" disabled={invBusy}
                  className="ml-auto rounded-lg bg-aproba-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  {invBusy ? t("Invitando…") : t("Invitar")}
                </button>
              </div>
              {invError && <p className="text-sm text-red-600">{invError}</p>}
            </form>
          )}

          {/* Credenciales d'un nouvel utilisateur (pas d'envoi email pour l'instant) */}
          {credenciales && (
            <div className={`mt-4 rounded-lg border p-4 text-sm ${credenciales.enviado ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              {credenciales.enviado ? (
                <>
                  <p className="font-semibold text-green-800">{t("Usuario añadido ✓ — le hemos enviado sus datos por email")}</p>
                  <p className="mt-1 text-green-700">{t("Ya puede entrar en Aproba y cambiar su contraseña. Te los dejamos aquí también, por si acaso.")}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-800">{t("Usuario añadido ✓ — pero el email no ha salido")}</p>
                  <p className="mt-1 text-amber-700">{t("Cópialas ahora y pásaselas tú: al cerrar esta ventana no se vuelven a ver.")}</p>
                </>
              )}
              <div className="mt-2 space-y-1 font-mono text-xs text-slate-700">
                <p>{t("Email:")} <strong>{credenciales.email}</strong></p>
                <p>{t("Contraseña temporal:")} <strong>{credenciales.password}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`${t("Email:")} ${credenciales.email}\n${t("Contraseña:")} ${credenciales.password}\n${t("Entra en")} https://aproba-software.com/login`)}
                className={`mt-3 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold ${credenciales.enviado ? "border-green-300 text-green-700 hover:bg-green-100" : "border-amber-300 text-amber-800 hover:bg-amber-100"}`}
              >
                {t("Copiar credenciales")}
              </button>
            </div>
          )}
        </div>
      )}

      {!puedeGestionar && (
        <p className="text-sm text-slate-400">{t("Solo los administradores pueden gestionar el equipo.")}</p>
      )}
    </div>
  );
}
