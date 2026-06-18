"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PLAN_IDS, PLANES, TIPOS, ROLES, ROLES_ASIGNABLES, puedeAsignarRol, plyMax, type PlanId, type RolId } from "@/lib/planes";
import { DEFAULT_SERVICIOS, newServicio, type Servicio } from "@/lib/servicios";
import { guardarServicios } from "@/lib/config-browser";
import { parseClientesCsv, PLANTILLA_CSV, type FilaCsv } from "@/lib/csv-clientes";
import { useT } from "@/components/lang-provider";

const ibanValido = (iban: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban.replace(/\s+/g, "").toUpperCase());
type Banco = { titular: string; iban: string; banco: string };
type Invitado = { email: string; nombre: string; role: RolId };

export function OnboardingForm() {
  const t = useT();
  const router = useRouter();

  // ── Datos collectés (tout en mémoire jusqu'à la création finale) ──
  const [nombre, setNombre] = useState("");
  const [nif, setNif] = useState("");
  const [tipo, setTipo] = useState("GESTORIA");
  const [plan, setPlan] = useState<PlanId>("PRO");
  // Au démarrage de la config, les prix sont à 0 € : le gestor pose consciemment ses
  // propres tarifs (évite la confusion avec des montants par défaut qui ne sont pas les siens).
  const [servicios, setServicios] = useState<Servicio[]>(() => DEFAULT_SERVICIOS.map((s) => ({ ...s, anticipo: 0, resto: 0, precio: 0 })));
  const [banco, setBanco] = useState<Banco>({ titular: "", iban: "", banco: "" });
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
  const maxInvitados = plyMax(plan) - 1; // hors propriétaire
  const rolesAsignables = ROLES_ASIGNABLES.filter((r) => puedeAsignarRol("OWNER", r));

  // Étapes du wizard (l'équipe seulement pour Pro/Business).
  const PASOS = ["despacho", "servicios", "banco", "clientes", "foto", ...(conEquipo ? ["equipo"] : []), "pago"] as const;
  type Paso = (typeof PASOS)[number];
  const [paso, setPaso] = useState<Paso>("despacho");
  const idx = PASOS.indexOf(paso);
  const ir = (p: Paso) => { setError(null); setPaso(p); };
  const siguiente = () => ir(PASOS[Math.min(idx + 1, PASOS.length - 1)]);
  const anterior = () => ir(PASOS[Math.max(idx - 1, 0)]);

  const TITULOS: Record<Paso, string> = {
    despacho: t("Tu despacho"), servicios: t("Tus servicios"), banco: t("Cuenta bancaria"),
    clientes: t("Importa tus clientes"), foto: t("Foto de perfil"), equipo: t("Invita a tu equipo"), pago: t("Empieza tu prueba"),
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
    if (nif.trim()) { try { await fetch("/api/onboarding/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nif: nif.trim() }) }); } catch { /* */ } }
    // Servicios.
    try { await guardarServicios(servicios, []); } catch { /* */ }
    // Compte bancaire.
    if (banco.titular.trim() && ibanValido(banco.iban)) {
      try {
        const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
        if (mem) await supabase.from("CuentaBancaria").insert({ id: crypto.randomUUID(), workspaceId: mem.workspaceId, titular: banco.titular.trim(), iban: banco.iban.replace(/\s+/g, "").toUpperCase(), banco: banco.banco.trim() || null, activa: true });
      } catch { /* */ }
    }
    // Clientes (CSV).
    const validas = (clientes ?? []).filter((f) => f.estado === "ok");
    if (validas.length) {
      try {
        const { data: mem } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
        if (mem) {
          const rows = validas.map((f) => ({ id: crypto.randomUUID(), workspaceId: mem.workspaceId, nombre: f.nombre.trim(), apellidos: f.apellidos.trim() || null, email: f.email.trim() || null, telefono: f.telefono.trim() || null, nacionalidad: f.nacionalidad.trim() || null, numeroDocumento: f.numeroDocumento.trim() || null, idioma: f.idioma || "es", updatedAt: new Date().toISOString() }));
          for (let i = 0; i < rows.length; i += 100) await supabase.from("Cliente").insert(rows.slice(i, i + 100));
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
          {loading ? t("Preparando…") : esPrueba ? t("Continuar — empezar mi mes gratis") : t("Continuar — empezar prueba de 15 días")}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("Nombre de tu despacho")}</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("Gestoría Vallès")} className={`mt-2 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-800">{t("NIF / CIF")} <span className="font-normal text-slate-400">{t("(opcional)")}</span></label>
              <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="B12345678" className={`mt-2 ${inputCls}`} />
            </div>
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
            <p className="text-xs text-slate-500">{esPrueba ? t("Prueba gratis de 1 mes, sin tarjeta. Elige el plan que probarás.") : t("15 días gratis. Te pediremos una tarjeta al final, sin cobro hasta el final de la prueba.")}</p>
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
                    <label className="text-xs text-slate-500">{t("Al empezar (€)")}<input type="number" min={0} value={s.anticipo} onChange={(e) => patchSrv(s.id, { anticipo: Math.max(0, parseInt(e.target.value || "0", 10)) })} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" /></label>
                    <label className="text-xs text-slate-500">{t("Al finalizar (€)")}<input type="number" min={0} value={s.resto} onChange={(e) => patchSrv(s.id, { resto: Math.max(0, parseInt(e.target.value || "0", 10)) })} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-aproba-600" /></label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setServicios((l) => [...l, { ...newServicio(), label: t("Nuevo servicio") }])} className="text-sm font-semibold text-aproba-700 hover:underline">
            {t("+ Añadir un servicio")}
          </button>
          <Nav onBack={anterior} onNext={siguiente} onSkip={siguiente} skipLabel={t("Usar estos por defecto")} />
        </div>
      )}

      {/* ── Banco ── */}
      {paso === "banco" && (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">{t("La cuenta donde recibirás los pagos de tus clientes. Puedes añadirla ahora o más tarde en Ajustes.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={banco.titular} onChange={(e) => setBanco((b) => ({ ...b, titular: e.target.value }))} placeholder={t("Titular (ej. Gestoría Vallès SL)")} className={inputCls} />
            <input value={banco.banco} onChange={(e) => setBanco((b) => ({ ...b, banco: e.target.value }))} placeholder={t("Banco (opcional)")} className={inputCls} />
          </div>
          <input value={banco.iban} onChange={(e) => setBanco((b) => ({ ...b, iban: e.target.value }))} placeholder={t("IBAN — ES76 2100 0418 4502 0005 1332")} className={`${inputCls} font-mono`} />
          {banco.iban && !ibanValido(banco.iban) && <p className="text-xs text-amber-600">{t("El IBAN no parece válido.")}</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Nav onBack={anterior} onNext={() => { if (banco.titular.trim() && !ibanValido(banco.iban)) { setError(t("Revisa el IBAN o salta este paso.")); return; } siguiente(); }} onSkip={() => { setBanco({ titular: "", iban: "", banco: "" }); siguiente(); }} />
        </div>
      )}

      {/* ── Clientes (CSV) ── */}
      {paso === "clientes" && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-500">{t("¿Ya tienes clientes? Impórtalos desde un CSV. Columnas:")} <span className="font-mono text-xs">nombre*, apellidos, email, telefono, nacionalidad, documento, idioma</span>.</p>
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
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Nav onBack={anterior} onNext={siguiente} onSkip={() => { setClientes(null); setCsvNombre(""); siguiente(); }} />
        </div>
      )}

      {/* ── Foto ── */}
      {paso === "foto" && (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">{t("Una foto de perfil para tu cuenta (opcional).")}</p>
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-aproba-100 text-2xl font-bold text-aproba-700">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : (nombre.slice(0, 2).toUpperCase() || "AB")}
            </span>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700">
              {fotoSubiendo ? t("Subiendo…") : avatarUrl ? t("Cambiar foto") : t("Subir una foto")}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={subirFoto} />
            </label>
          </div>
          <Nav onBack={anterior} onNext={siguiente} onSkip={siguiente} />
        </div>
      )}

      {/* ── Equipo (Pro/Business) ── */}
      {paso === "equipo" && (
        <div className="space-y-5">
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
          <Nav onBack={anterior} onNext={siguiente} onSkip={() => { setInvitados([]); siguiente(); }} />
        </div>
      )}

      {/* ── Pago / Finalizar ── */}
      {paso === "pago" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-cream-50/60 p-5 text-sm">
            <p className="font-semibold text-slate-800">{nombre || t("Tu despacho")} · {t(PLANES[plan].label)}</p>
            <ul className="mt-2 space-y-1 text-slate-500">
              <li>✓ {servicios.filter((s) => s.active).length} {t("servicios configurados")}</li>
              {banco.titular.trim() && ibanValido(banco.iban) && <li>✓ {t("Cuenta bancaria añadida")}</li>}
              {clientes && clientes.filter((f) => f.estado === "ok").length > 0 && <li>✓ {clientes.filter((f) => f.estado === "ok").length} {t("clientes a importar")}</li>}
              {avatarUrl && <li>✓ {t("Foto de perfil")}</li>}
              {invitados.filter((v) => v.email.trim()).length > 0 && <li>✓ {invitados.filter((v) => v.email.trim()).length} {t("invitaciones de equipo")}</li>}
            </ul>
          </div>
          {esPrueba ? (
            <p className="text-sm text-slate-500"><strong className="text-slate-700">{t("Prueba gratis de 1 mes, sin tarjeta.")}</strong> {t("Al terminar el mes, podrás suscribirte para seguir usando Aproba.")}</p>
          ) : (
            <p className="text-sm text-slate-500">{t("Para empezar tu")} <strong className="text-slate-700">{t("prueba de 15 días")}</strong> {t("te pediremos una tarjeta. No se cobra nada hasta el final de la prueba, y puedes cancelar cuando quieras.")}</p>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={anterior} disabled={loading} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50">{t("Atrás")}</button>
            <button type="button" onClick={finalizar} disabled={loading} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:bg-slate-300 ${esPrueba ? "bg-purple-600 hover:bg-purple-700" : "bg-aproba-600 hover:bg-aproba-700"}`}>
              {loading ? t("Preparando tu espacio…") : esPrueba ? t("Empezar mi mes gratis") : t("Empezar prueba de 15 días")}
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
