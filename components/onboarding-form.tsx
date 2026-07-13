"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PLAN_IDS, PLANES, TIPOS, ROLES, ROLES_ASIGNABLES, puedeAsignarRol, plyMax, type PlanId, type RolId } from "@/lib/planes";
import { DEFAULT_SERVICIOS, newServicio, type Servicio } from "@/lib/servicios";
import { guardarServicios, guardarAvisos } from "@/lib/config-browser";
import { DEFAULT_AVISOS } from "@/lib/avisos";
import { parseClientesCsv, filaACliente, PLANTILLA_CSV, COLUMNAS_CSV_LABEL, type FilaCsv } from "@/lib/csv-clientes";
import { useT } from "@/components/lang-provider";
import { ibanValido } from "@/lib/iban";

type Banco = { titular: string; iban: string; banco: string };
type Invitado = { email: string; nombre: string; role: RolId };
type Mandatario = { activa: boolean; nombre: string; dni: string; colegiado: string; colegio: string };

export function OnboardingForm({ defaultNombre = "" }: { defaultNombre?: string }) {
  const t = useT();
  const router = useRouter();

  // ── Datos collectés (tout en mémoire jusqu'à la création finale) ──
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [emailFact, setEmailFact] = useState("");
  const [tipo, setTipo] = useState("GESTORIA");
  const [plan, setPlan] = useState<PlanId>("PRO");
  // Hoja de encargo + mandato de representación (feature clave para abogados/gestores).
  // Se pre-rellena el nombre del profesional con el del titular de la cuenta.
  const [mandatario, setMandatario] = useState<Mandatario>({ activa: false, nombre: defaultNombre, dni: "", colegiado: "", colegio: "" });
  // Au démarrage de la config, les prix sont à 0 € : le gestor pose consciemment ses
  // propres tarifs (évite la confusion avec des montants par défaut qui ne sont pas les siens).
  const [servicios, setServicios] = useState<Servicio[]>(() => DEFAULT_SERVICIOS.map((s) => ({ ...s, anticipo: 0, resto: 0, precio: 0 })));
  const [banco, setBanco] = useState<Banco>({ titular: "", iban: "", banco: "" });
  // Cobro con tarjeta (opcional): clave secreta Stripe, se guarda cifrada en finalizar().
  const [stripeKey, setStripeKey] = useState("");
  const [stripeAbierto, setStripeAbierto] = useState(false);
  const [clientes, setClientes] = useState<FilaCsv[] | null>(null);
  const [csvNombre, setCsvNombre] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [invitados, setInvitados] = useState<Invitado[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fotoSubiendo, setFotoSubiendo] = useState(false);
  const [credenciales, setCredenciales] = useState<{ email: string; password: string }[] | null>(null);
  // Essai TESTEUR (bouton violet de la landing) : 30 jours, sans carte (cookie aproba.modo=prueba).
  const [esPrueba, setEsPrueba] = useState(false);
  useEffect(() => { setEsPrueba(typeof document !== "undefined" && document.cookie.includes("aproba.modo=prueba")); }, []);

  const conEquipo = plan !== "STARTER";
  const stripeKeyValida = /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(stripeKey.trim());
  const maxInvitados = plyMax(plan) - 1; // hors propriétaire
  const rolesAsignables = ROLES_ASIGNABLES.filter((r) => puedeAsignarRol("OWNER", r));

  // Wizard condensado en 5 pasos (antes 7): la hoja de encargo vive DENTRO de
  // «Tus servicios» (misma materia: qué ofreces y sus límites) y el equipo dentro de
  // «Clientes y equipo». Mismos campos y misma persistencia — solo menos pantallas.
  const PASOS = ["despacho", "servicios", "cobros", "clientes", "pago"] as const;
  type Paso = (typeof PASOS)[number];
  const [paso, setPaso] = useState<Paso>("despacho");
  const idx = PASOS.indexOf(paso);
  const ir = (p: Paso) => { setError(null); setPaso(p); };
  const siguiente = () => ir(PASOS[Math.min(idx + 1, PASOS.length - 1)]);
  const anterior = () => ir(PASOS[Math.max(idx - 1, 0)]);

  const TITULOS: Record<Paso, string> = {
    despacho: t("Tu despacho"), servicios: t("Tus servicios"),
    cobros: t("Cómo cobras a tus clientes"), clientes: conEquipo ? t("Clientes y equipo") : t("Importa tus clientes"), pago: t("Empieza tu prueba"),
  };

  function patchSrv(id: string, p: Partial<Servicio>) {
    setServicios((l) => l.map((s) => (s.id === id ? { ...s, ...p, precio: (p.anticipo ?? s.anticipo) + (p.resto ?? s.resto) } : s)));
  }

  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvNombre(file.name);
    setError(null);
    file.text().then((txt) => {
      try { setClientes(parseClientesCsv(txt)); }
      catch (err) { setClientes(null); setError(err instanceof Error ? err.message : t("CSV no válido.")); }
    });
  }

  function descargarPlantilla() {
    const url = URL.createObjectURL(new Blob([PLANTILLA_CSV], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla_clientes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFotoSubiendo(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/perfil/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) setAvatarUrl(data.url as string);
      else setAvatarUrl(URL.createObjectURL(file)); // aperçu local si la route ne renvoie pas d'URL
    } catch { /* ignore */ } finally { setFotoSubiendo(false); }
  }

  function addInvitado() {
    if (invitados.length >= maxInvitados) return;
    setInvitados((l) => [...l, { email: "", nombre: "", role: "GESTOR" }]);
  }
  function setInvitado(i: number, p: Partial<Invitado>) {
    setInvitados((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  // ── Création finale : workspace + toutes les données collectées + checkout ──
  async function finalizar() {
    if (nombre.trim().length < 2) { ir("despacho"); setError(t("Indica el nombre de tu despacho.")); return; }
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowser();

    const { error: rpcError } = await supabase.rpc("create_workspace", { p_nombre: nombre.trim(), p_tipo: tipo, p_plan: plan });
    if (rpcError) { setLoading(false); setError(rpcError.message ?? t("No se pudo crear el espacio.")); return; }

    // NIF (route admin — table Workspace verrouillée côté client).
    if (nif.trim() || domicilio.trim() || emailFact.trim()) { try { await fetch("/api/onboarding/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nif: nif.trim(), domicilio: domicilio.trim(), emailFacturacion: emailFact.trim() }) }); } catch { /* */ } }
    // Servicios (incluye «no incluye» por servicio, capturado en el paso Encargo).
    try { await guardarServicios(servicios, []); } catch { /* */ }
    // Avisos automáticos : seed des défauts pour que le nouveau despacho ait des
    // notifications fonctionnelles dès le départ (modifiables ensuite dans Ajustes).
    try { await guardarAvisos(DEFAULT_AVISOS); } catch { /* */ }
    // Hoja de encargo + mandato (si activado). soloEncargo=1 solo toca sus campos.
    // Fail-soft: si falta la migración hoja-encargo.sql, no rompe el onboarding.
    if (mandatario.activa) {
      try {
        const fd = new FormData();
        fd.set("soloEncargo", "1");
        fd.set("hojaEncargoActiva", "1");
        fd.set("mandatarioNombre", mandatario.nombre.trim());
        fd.set("mandatarioDni", mandatario.dni.trim());
        fd.set("mandatarioColegiado", mandatario.colegiado.trim());
        fd.set("mandatarioColegio", mandatario.colegio.trim());
        await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
      } catch { /* */ }
    }
    // Compte bancaire.
    if (banco.titular.trim() && ibanValido(banco.iban)) {
      try {
        const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
        if (mem) await supabase.from("CuentaBancaria").insert({ id: crypto.randomUUID(), workspaceId: mem.workspaceId, titular: banco.titular.trim(), iban: banco.iban.replace(/\s+/g, "").toUpperCase(), banco: banco.banco.trim() || null, activa: true });
      } catch { /* */ }
    }
    // Cobro con tarjeta (opcional): clave Stripe → se cifra en servidor. Fail-soft si
    // falta la migración StripeCuenta o el cifrado no está configurado en el entorno.
    if (stripeKeyValida) {
      try { await fetch("/api/ajustes/stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secretKey: stripeKey.trim() }) }); } catch { /* */ }
    }
    // Clientes (CSV).
    const validas = (clientes ?? []).filter((f) => f.estado === "ok");
    if (validas.length) {
      try {
        const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
        if (mem) {
          const rows = validas.map((f) => filaACliente(f, mem.workspaceId as string));
          for (let i = 0; i < rows.length; i += 100) await supabase.from("Cliente").insert(rows.slice(i, i + 100));
          // Vigía: filas con caducidadTIE → sembrar sus vencimientos (mejor esfuerzo).
          const conCaducidad = validas
            .map((f, j) => ({ clienteId: String(rows[j].id), fecha: f.fechaCaducidad }))
            .filter((x) => x.fecha);
          for (let i = 0; i < conCaducidad.length; i += 400) {
            await fetch("/api/clientes/caducidad", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: conCaducidad.slice(i, i + 400) }),
            }).catch(() => {});
          }
        }
      } catch { /* */ }
    }
    // Invitations équipe.
    const aInvitar = invitados.filter((v) => v.email.trim());
    const creds: { email: string; password: string }[] = [];
    for (const v of aInvitar) {
      try {
        const res = await fetch("/api/equipo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invitar", email: v.email.trim(), nombre: v.nombre.trim(), role: v.role }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.tempPassword) creds.push({ email: v.email.trim(), password: String(data.tempPassword) });
      } catch { /* */ }
    }

    // Si des invitations ont été créées, montrer les identifiants avant le paiement.
    if (creds.length) { setCredenciales(creds); setLoading(false); return; }
    await irAlPago();
  }

  async function irAlPago() {
    setLoading(true);
    // Essai TESTEUR : aucune carte → on active 30 jours gratuits et on entre dans l'app.
    if (esPrueba) {
      try { await fetch("/api/onboarding/prueba", { method: "POST" }); } catch { /* */ }
      document.cookie = "aproba.modo=; path=/; max-age=0";
      router.push("/app"); router.refresh();
      return;
    }
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volverA: "/app" }) });
      if (res.ok) { const { url } = await res.json(); if (url) { window.location.href = url; return; } }
    } catch { /* Stripe non configuré → entrer dans l'app */ }
    router.push("/app"); router.refresh();
  }

  // ── Écran identifiants des invités (avant le paiement) ──
  if (credenciales) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{t("Equipo invitado")} ✓</h2>
          <p className="mt-1 text-sm text-slate-500">{t("Comparte estas credenciales con tu equipo (podrán cambiar su contraseña). También las tienes en Ajustes → Equipo.")}</p>
        </div>
        <div className="space-y-2">
          {credenciales.map((c) => (
            <div key={c.email} className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700">
              <p>{t("Email")}: <strong>{c.email}</strong></p>
              <p>{t("Contraseña")}: <strong>{c.password}</strong></p>
            </div>
          ))}
        </div>
        <button onClick={irAlPago} disabled={loading} className={`w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:bg-slate-300 ${esPrueba ? "bg-purple-600 hover:bg-purple-700" : "bg-aproba-600 hover:bg-aproba-700"}`}>
          {loading ? t("Preparando…") : esPrueba ? t("Continuar — empezar mi mes gratis") : t("Continuar — empezar prueba de 1 mes")}
        </button>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div>
      {/* Barre de progression */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-aproba-700">{TITULOS[paso]}</span>
          <span>{t("Paso")} {idx + 1} {t("de")} {PASOS.length}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-aproba-600 transition-all duration-300" style={{ width: `${((idx + 1) / PASOS.length) * 100}%` }} />
        </div>
      </div>

      {/* ── Despacho ── */}
      {paso === "despacho" && (
        <div className="space-y-6">
          {/* Foto / avatar (repliée ici depuis l'ancienne étape « foto ») */}
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-aproba-100 text-xl font-bold text-aproba-700">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : (nombre.slice(0, 2).toUpperCase() || "AB")}
            </span>
            <div>
              <label className="cursor-pointer text-sm font-semibold text-aproba-700 hover:underline">
                {fotoSubiendo ? t("Subiendo…") : avatarUrl ? t("Cambiar foto") : t("Añadir foto (opcional)")}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={subirFoto} />
              </label>
              <p className="text-xs text-slate-400">{t("Aparecerá en tu cuenta.")}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("Nombre de tu despacho")}</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Gestoría Vallès")} className={`mt-2 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("NIF / CIF")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></label>
              <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345678" className={`mt-2 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("Domicilio")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></label>
              <input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder={t("C/ Mayor 1, 28013 Madrid")} className={`mt-2 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("Email de facturación")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></label>
              <input type="email" value={emailFact} onChange={(e) => setEmailFact(e.target.value)} placeholder="facturacion@tudespacho.es" className={`mt-2 ${inputCls}`} />
            </div>
            <p className="sm:col-span-2 text-xs text-slate-400">{t("Estos datos encabezan tus facturas y la hoja de encargo. Puedes completarlos ahora o más tarde en Ajustes.")}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{t("Tipo de despacho")}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {TIPOS.map((tp) => (
                <button key={tp.id} type="button" onClick={() => setTipo(tp.id)} className={`rounded-xl border p-3 text-left transition ${tipo === tp.id ? "border-aproba-600 bg-aproba-50 ring-1 ring-aproba-600" : "border-slate-200 hover:border-slate-300"}`}>
                  <p className="text-sm font-semibold text-slate-800">{t(tp.label)}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{t(tp.desc)}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{t("Elige tu plan")}</p>
            <p className="text-xs text-slate-500">{esPrueba ? t("Prueba gratis de 1 mes, sin tarjeta. Elige el plan que probarás.") : t("1 mes gratis. Te pediremos una tarjeta al final, sin cobro hasta el final de la prueba.")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {PLAN_IDS.map((id) => {
                const p = PLANES[id]; const activo = plan === id;
                return (
                  <button key={id} type="button" onClick={() => setPlan(id)} className={`relative flex flex-col rounded-2xl border p-4 text-left transition ${activo ? "border-aproba-600 bg-aproba-50/60 ring-1 ring-aproba-600" : "border-slate-200 hover:border-slate-300"}`}>
                    {id === "PRO" && <span className="absolute -top-2 right-3 rounded-full bg-aproba-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("Popular")}</span>}
                    <span className="text-sm font-bold text-slate-900">{t(p.label)}</span>
                    <p className="mt-1"><span className="text-2xl font-extrabold tracking-tight text-slate-900">{p.precio}€</span><span className="text-xs text-slate-500">{t("/mes")}</span></p>
                    <p className="mt-1 text-xs text-slate-500">{t(p.para)}</p>
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={() => { if (nombre.trim().length < 2) { setError(t("Indica el nombre de tu despacho.")); return; } siguiente(); }} className="block w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Continuar")}</button>
        </div>
      )}

      {/* ── Servicios ── */}
      {paso === "servicios" && (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">{t("Activa los trámites que ofreces y su precio. Es lo que verá tu cliente. Lo puedes cambiar después en Ajustes.")}</p>
          <div className="space-y-3">
            {servicios.map((s) => (
              <div key={s.id} className={`rounded-xl border p-4 ${s.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/60"}`}>
                <div className="flex items-center justify-between gap-3">
                  <input value={s.label} onChange={(e) => patchSrv(s.id, { label: e.target.value })} className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-800 outline-none hover:border-slate-200 focus:border-aproba-400 focus:bg-white" />
                  <button type="button" role="switch" aria-checked={s.active} onClick={() => patchSrv(s.id, { active: !s.active })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${s.active ? "bg-aproba-600" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.active ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
                {s.active && (
                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="text-xs text-slate-500">{t("Al empezar (€)")}<input type="number" min={0} value={s.anticipo || ""} placeholder="0" onFocus={(e) => e.target.select()} onChange={(e) => patchSrv(s.id, { anticipo: Math.max(0, parseInt(e.target.value || "0", 10)) })} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" /></label>
                    <label className="text-xs text-slate-500">{t("Al finalizar (€)")}<input type="number" min={0} value={s.resto || ""} placeholder="0" onFocus={(e) => e.target.select()} onChange={(e) => patchSrv(s.id, { resto: Math.max(0, parseInt(e.target.value || "0", 10)) })} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" /></label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setServicios((l) => [...l, { ...newServicio(), label: t("Nuevo servicio") }])} className="text-sm font-semibold text-aproba-700 hover:underline">
            {t("+ Añadir un servicio")}
          </button>

          {/* Hoja de encargo y mandato — misma materia que los servicios (límites del encargo) */}
          <div className="border-t border-slate-100 pt-5">
            <p className="mb-3 text-sm font-semibold text-slate-800">{t("Hoja de encargo y mandato")}</p>
          <p className="text-sm text-slate-500">{t("Aproba puede generar automáticamente la hoja de encargo y el mandato de representación con los datos que ya tienes. Tu cliente los descarga, firma y sube desde su portal.")}</p>

          {/* Interruptor activar */}
          <button type="button" role="switch" aria-checked={mandatario.activa} onClick={() => setMandatario((m) => ({ ...m, activa: !m.activa }))} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${mandatario.activa ? "border-aproba-600 bg-aproba-50/60 ring-1 ring-aproba-600" : "border-slate-200 hover:border-slate-300"}`}>
            <div>
              <p className="text-sm font-semibold text-slate-800">{t("Generar hoja de encargo y mandato")}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t("Recomendado para despachos jurídicos y representación ante la Administración.")}</p>
            </div>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${mandatario.activa ? "bg-aproba-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${mandatario.activa ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </button>

          {mandatario.activa && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{t("Datos del profesional que firma el mandato")}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t("Es quien representa al cliente ante la Administración.")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">{t("Nombre y apellidos")}</label>
                  <input value={mandatario.nombre} onChange={(e) => setMandatario((m) => ({ ...m, nombre: e.target.value }))} placeholder={t("Nombre y apellidos")} className={`mt-1 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">DNI</label>
                  <input value={mandatario.dni} onChange={(e) => setMandatario((m) => ({ ...m, dni: e.target.value }))} placeholder="00000000A" className={`mt-1 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">{t("Nº de colegiado (opcional)")}</label>
                  <input value={mandatario.colegiado} onChange={(e) => setMandatario((m) => ({ ...m, colegiado: e.target.value }))} className={`mt-1 ${inputCls}`} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-500">{t("Colegio profesional (opcional)")}</label>
                  <input value={mandatario.colegio} onChange={(e) => setMandatario((m) => ({ ...m, colegio: e.target.value }))} placeholder={t("Colegio Oficial de Gestores Administrativos de…")} className={`mt-1 ${inputCls}`} />
                </div>
              </div>

              {/* Qué NO incluye cada servicio (aparece en la hoja de encargo) */}
              {servicios.some((s) => s.active) && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-800">{t("¿Qué NO incluye cada servicio?")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></p>
                  <p className="mt-0.5 text-xs text-slate-400">{t("Aclara los límites del encargo (ej. tasas, recursos, traducciones).")}</p>
                  <div className="mt-3 space-y-2">
                    {servicios.filter((s) => s.active).map((s) => (
                      <div key={s.id}>
                        <label className="text-xs font-medium text-slate-600">{s.label}</label>
                        <input value={s.noIncluye ?? ""} onChange={(e) => patchSrv(s.id, { noIncluye: e.target.value })} placeholder={t("No incluye tasas ni recursos…")} className={`mt-1 ${inputCls}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Nav onBack={anterior} onNext={() => { if (mandatario.activa && mandatario.nombre.trim().length < 2) { setError(t("Indica el nombre del profesional que firma, o desactiva la opción.")); return; } siguiente(); }} onSkip={() => { setMandatario((m) => ({ ...m, activa: false })); siguiente(); }} skipLabel={t("Usar estos por defecto")} />
        </div>
      )}

      {/* ── Cómo cobras (cuenta bancaria + tarjeta) ── */}
      {paso === "cobros" && (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">{t("La cuenta donde recibirás los pagos de tus clientes. Puedes añadirla ahora o más tarde en Ajustes.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={banco.titular} onChange={(e) => setBanco((b) => ({ ...b, titular: e.target.value }))} placeholder={t("Titular (ej. Gestoría Vallès SL)")} className={inputCls} />
            <input value={banco.banco} onChange={(e) => setBanco((b) => ({ ...b, banco: e.target.value }))} placeholder={t("Banco (opcional)")} className={inputCls} />
          </div>
          <input value={banco.iban} onChange={(e) => setBanco((b) => ({ ...b, iban: e.target.value }))} placeholder={t("IBAN — ES76 2100 0418 4502 0005 1332")} className={`${inputCls} font-mono`} />
          {banco.iban && !ibanValido(banco.iban) && <p className="text-xs text-amber-600">{t("El IBAN no parece válido.")}</p>}

          {/* Cobro con tarjeta (opcional): plegable. La clave Stripe se guarda cifrada en finalizar(). */}
          <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-4">
            <button type="button" aria-expanded={stripeAbierto} aria-controls="onb-stripe-panel" onClick={() => setStripeAbierto((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
              <div className="flex items-start gap-2.5">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-aproba-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t("Cobrar con tarjeta")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></p>
                  <p className="mt-0.5 text-xs text-slate-500">{t("Añade un botón «Pagar con tarjeta» en los emails de factura. Los cobros van a tu cuenta Stripe.")}</p>
                </div>
              </div>
              <span className={`shrink-0 text-slate-400 transition-transform ${stripeAbierto ? "rotate-180" : ""}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </button>
            {stripeAbierto && (
              <div id="onb-stripe-panel" className="mt-4">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("Clave secreta de Stripe")}</label>
                <input type="password" autoComplete="off" value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} placeholder="sk_live_… o rk_live_…" className={`${inputCls} font-mono`} />
                {stripeKey.trim() && !stripeKeyValida && <p className="mt-1 text-xs text-amber-600">{t("La clave debe empezar por sk_live_, rk_live_, sk_test_ o rk_test_.")}</p>}
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{t("Recomendado: una clave RESTRINGIDA de Stripe. Se guarda cifrada y nunca se muestra. También puedes hacerlo más tarde en Ajustes.")}</p>
              </div>
            )}
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Nav onBack={anterior} onNext={() => { if (banco.titular.trim() && !ibanValido(banco.iban)) { setError(t("Revisa el IBAN o salta este paso.")); return; } if (stripeKey.trim() && !stripeKeyValida) { setError(t("Revisa la clave de Stripe o déjala vacía.")); return; } siguiente(); }} onSkip={() => { setBanco({ titular: "", iban: "", banco: "" }); setStripeKey(""); setStripeAbierto(false); siguiente(); }} />
        </div>
      )}

      {/* ── Clientes (CSV) ── */}
      {paso === "clientes" && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-500">{t("¿Ya tienes clientes? Impórtalos desde un CSV. Columnas:")} <span className="font-mono text-xs">{COLUMNAS_CSV_LABEL}</span>.</p>
            <button type="button" onClick={descargarPlantilla} className="shrink-0 text-sm font-semibold text-aproba-700 hover:underline">{t("Plantilla")}</button>
          </div>
          <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-7 text-slate-500 transition hover:border-aproba-400 hover:text-aproba-700">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            <span className="text-sm font-medium">{csvNombre || t("Elegir un fichero CSV")}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsv} />
          </label>
          {clientes && (
            <p className="rounded-lg bg-aproba-50 px-3 py-2 text-sm text-aproba-700">
              {clientes.filter((f) => f.estado === "ok").length} {t("clientes nuevos detectados")}
              {clientes.filter((f) => f.estado !== "ok").length > 0 && ` · ${clientes.filter((f) => f.estado !== "ok").length} ${t("omitidos (duplicados o sin nombre)")}`}
            </p>
          )}
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-cream-50/60 px-3 py-2.5 text-xs text-slate-500">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
            <span>{t("Si incluyes la fecha de caducidad del TIE, Vigía te avisará de cada renovación automáticamente.")}</span>
          </div>
          {conEquipo && (
            <div className="border-t border-slate-100 pt-5">
              <p className="mb-3 text-sm font-semibold text-slate-800">{t("Invita a tu equipo")}</p>
          <p className="text-sm text-slate-500">{t("Invita a tu equipo. Recibirán acceso a este despacho. Tu plan permite hasta")} {maxInvitados + 1} {t("usuarios.")}</p>
          <div className="space-y-2">
            {invitados.map((v, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input value={v.email} onChange={(e) => setInvitado(i, { email: e.target.value })} placeholder="email@despacho.es" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" />
                <input value={v.nombre} onChange={(e) => setInvitado(i, { nombre: e.target.value })} placeholder={t("Nombre")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" />
                <select value={v.role} onChange={(e) => setInvitado(i, { role: e.target.value as RolId })} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-aproba-600">
                  {rolesAsignables.map((r) => <option key={r} value={r}>{t(ROLES[r].label)}</option>)}
                </select>
              </div>
            ))}
          </div>
          {invitados.length < maxInvitados && (
            <button type="button" onClick={addInvitado} className="text-sm font-semibold text-aproba-700 hover:underline">{t("+ Añadir invitación")}</button>
          )}
            </div>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Nav onBack={anterior} onNext={siguiente} onSkip={() => { setClientes(null); setCsvNombre(""); setInvitados([]); siguiente(); }} />
        </div>
      )}

      {/* ── Pago / Finalizar ── */}
      {paso === "pago" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5 text-sm">
            <p className="font-semibold text-slate-800">{nombre || t("Tu despacho")} · {t(PLANES[plan].label)}</p>
            <ul className="mt-2 space-y-1 text-slate-500">
              <li>✓ {servicios.filter((s) => s.active).length} {t("servicios configurados")}</li>
              {mandatario.activa && <li>✓ {t("Hoja de encargo y mandato activados")}</li>}
              {banco.titular.trim() && ibanValido(banco.iban) && <li>✓ {t("Cuenta bancaria añadida")}</li>}
              {stripeKeyValida && <li>✓ {t("Cobro con tarjeta activado")}</li>}
              {clientes && clientes.filter((f) => f.estado === "ok").length > 0 && <li>✓ {clientes.filter((f) => f.estado === "ok").length} {t("clientes a importar")}</li>}
              {avatarUrl && <li>✓ {t("Foto de perfil")}</li>}
              {invitados.filter((v) => v.email.trim()).length > 0 && <li>✓ {invitados.filter((v) => v.email.trim()).length} {t("invitaciones de equipo")}</li>}
            </ul>
          </div>
          {esPrueba ? (
            <p className="text-sm text-slate-500"><strong className="text-slate-700">{t("Prueba gratis de 1 mes, sin tarjeta.")}</strong> {t("Al terminar el mes, podrás suscribirte para seguir usando Aproba.")}</p>
          ) : (
            <p className="text-sm text-slate-500">{t("Para empezar tu")} <strong className="text-slate-700">{t("prueba de 1 mes")}</strong> {t("te pediremos una tarjeta. No se cobra nada hasta el final de la prueba, y puedes cancelar cuando quieras.")}</p>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={anterior} disabled={loading} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{t("Atrás")}</button>
            <button type="button" onClick={finalizar} disabled={loading} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:bg-slate-300 ${esPrueba ? "bg-purple-600 hover:bg-purple-700" : "bg-aproba-600 hover:bg-aproba-700"}`}>
              {loading ? t("Preparando tu espacio…") : esPrueba ? t("Empezar mi mes gratis") : t("Empezar prueba de 1 mes")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Barre de navigation d'une étape skippable.
function Nav({ onBack, onNext, onSkip, skipLabel }: { onBack: () => void; onNext: () => void; onSkip: () => void; skipLabel?: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3 pt-1">
      <button type="button" onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("Atrás")}</button>
      <button type="button" onClick={onSkip} className="text-sm font-medium text-slate-400 hover:text-slate-600">{skipLabel ?? t("Saltar por ahora")}</button>
      <button type="button" onClick={onNext} className="ml-auto rounded-lg bg-aproba-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">{t("Continuar")}</button>
    </div>
  );
}
