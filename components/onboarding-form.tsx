"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { PLAN_IDS, PLANES, TIPOS, ROLES, ROLES_ASIGNABLES, puedeAsignarRol, plyMax, type PlanId, type RolId } from "@/lib/planes";
import { DEFAULT_SERVICIOS, newPack, newServicio, packPrecio, temasUsados, type Pack, type Servicio } from "@/lib/servicios";
import { guardarServicios, guardarAvisos, guardarPacks } from "@/lib/config-browser";
import { DEFAULT_AVISOS } from "@/lib/avisos";
import { parseClientesCsv, filaACliente, PLANTILLA_CSV, COLUMNAS_CSV_LABEL, type FilaCsv } from "@/lib/csv-clientes";
import { useT } from "@/components/lang-provider";
import { AsaArrastre, useReordenar } from "@/components/servicios-manager";
import { ibanValido } from "@/lib/iban";

type Banco = { titular: string; iban: string; banco: string };
type Invitado = { email: string; nombre: string; role: RolId };
type Mandatario = { activa: boolean; nombre: string; dni: string; colegiado: string; colegio: string };

// `existente` (05/09/2026): el despacho ya se creó en el paso 1 y el usuario vuelve
// (recarga, cierre del navegador, el enlace del mail de bienvenida). Se retoma en el
// paso 2 con nombre/tipo/plan de la base, en vez de empezar de cero.
export function OnboardingForm({ defaultNombre = "", existente = null }: { defaultNombre?: string; existente?: { nombre: string; tipo: string; plan: string } | null }) {
  const t = useT();
  const router = useRouter();

  // ── Datos collectés (en mémoire ; le despacho lui-même est créé dès l'étape 1) ──
  const [nombre, setNombre] = useState(existente?.nombre ?? "");
  const [nif, setNif] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [emailFact, setEmailFact] = useState("");
  const [tipo, setTipo] = useState(existente?.tipo ?? "GESTORIA");
  const [plan, setPlan] = useState<PlanId>((existente?.plan as PlanId) ?? "PRO");
  // Workspace ya creado (paso 1 o reanudación). finalizar() NO vuelve a crearlo.
  const [wsCreado, setWsCreado] = useState<boolean>(Boolean(existente));
  // Hoja de encargo + mandato de representación (feature clave para abogados/gestores).
  // Se pre-rellena el nombre del profesional con el del titular de la cuenta.
  const [mandatario, setMandatario] = useState<Mandatario>({ activa: false, nombre: defaultNombre, dni: "", colegiado: "", colegio: "" });
  // Au démarrage de la config, les prix sont à 0 € : le gestor pose consciemment ses
  // propres tarifs (évite la confusion avec des montants par défaut qui ne sont pas les siens).
  const [servicios, setServicios] = useState<Servicio[]>(() => DEFAULT_SERVICIOS.map((s) => ({ ...s, anticipo: 0, resto: 0, precio: 0 })));
  const [packs, setPacks] = useState<Pack[]>([]);
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
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<{ email: string; password: string }[] | null>(null);
  // Essai TESTEUR (bouton violet de la landing) : 15 jours, sans carte (cookie aproba.modo=prueba).
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
  const [paso, setPaso] = useState<Paso>(existente ? "servicios" : "despacho");
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

  // Antes de guardar nada en base (todo vive en memoria hasta finalizar), borrar
  // un servicio por defecto es simplemente quitarlo de la lista.
  function quitarSrv(id: string) {
    setServicios((l) => (l.length > 1 ? l.filter((s) => s.id !== id) : l));
    setPacks((l) => l.map((p) => ({ ...p, servicioIds: p.servicioIds.filter((x) => x !== id) })));
  }

  function moverSrv(id: string, delta: -1 | 1) {
    setServicios((l) => {
      const i = l.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const patchPack = (id: string, p: Partial<Pack>) => setPacks((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function moverPack(id: string, delta: -1 | 1) {
    setPacks((l) => {
      const i = l.findIndex((x) => x.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const dndSrv = useReordenar(setServicios, (x) => x.id);
  const dndPack = useReordenar(setPacks, (x) => x.id);

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
    // Se avisa ANTES de gastar datos móviles subiendo algo que el servidor rechazará.
    if (file.size > 2 * 1024 * 1024) { setFotoError(t("La imagen supera los 2 MB.")); return; }
    setFotoSubiendo(true);
    setFotoError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/perfil/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      // Nada de vista previa local cuando la subida falla: el resumen final llegaba a
      // decir «✓ Foto de perfil» con la foto solo en la memoria del navegador.
      if (res.ok && data.url) setAvatarUrl(data.url as string);
      else setFotoError((data as { error?: string }).error ?? t("No se pudo subir la foto."));
    } catch {
      setFotoError(t("No se pudo subir la foto."));
    } finally { setFotoSubiendo(false); }
  }

  function addInvitado() {
    if (invitados.length >= maxInvitados) return;
    setInvitados((l) => [...l, { email: "", nombre: "", role: "GESTOR" }]);
  }
  function setInvitado(i: number, p: Partial<Invitado>) {
    setInvitados((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  // ── Paso 1 → 2 : el despacho se crea AQUÍ (05/09/2026) ──
  // Antes se creaba en finalizar(): quien abandonaba en el paso 2-4 perdía todo y se
  // quedaba sin workspace (3 de 13 altas reales en 45 días). Ahora, con un nombre, el
  // despacho existe; lo demás es configuración y se puede completar en Ajustes.
  // La ruta es idempotente: «Atrás» + «Continuar» actualiza, no duplica.
  async function crearDespacho() {
    if (nombre.trim().length < 2) { setError(t("Indica el nombre de tu despacho.")); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombre.trim(), tipo, plan }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? t("No se pudo crear el espacio.")); return; }
      // Datos fiscales del paso 1: se guardan ya, no al final.
      if (nif.trim() || domicilio.trim() || emailFact.trim()) {
        try { await fetch("/api/onboarding/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nif: nif.trim(), domicilio: domicilio.trim(), emailFacturacion: emailFact.trim() }) }); } catch { /* */ }
      }
      // Línea base del despacho recién creado: los mismos servicios (a 0 €) y avisos que
      // sembraría finalizar(). Así quien abandone aquí tiene lo mismo que quien termina.
      if (data.creado) {
        try { await guardarServicios(servicios, []); } catch { /* */ }
        try { await guardarAvisos(DEFAULT_AVISOS); } catch { /* */ }
      }
      // 05/09/2026 (tarde): UNA sola etapa. Todo lo demás —servicios, cobros, clientes,
      // equipo— se hace dentro, guiado (components/guia-activacion.tsx). Aquí solo
      // queda entrar: prueba de testeador → /app; prueba normal → tarjeta.
      await irAlPago();
      return;
    } catch {
      setError(t("No se pudo crear el espacio."));
    } finally {
      setLoading(false);
    }
  }

  async function irAlPago() {
    setLoading(true);
    // Essai TESTEUR : aucune carte → on active 15 jours gratuits et on entre dans l'app.
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

  const inputCls = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div>
      {/* ── Despacho ── */}
      {(
        <div className="space-y-6">
          {/* Foto / avatar (repliée ici depuis l'ancienne étape « foto ») */}
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-aproba-100 text-xl font-bold text-aproba-700">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : (nombre.slice(0, 2).toUpperCase() || "AB")}
            </span>
            <div className="min-w-0">
              <label className="inline-block cursor-pointer rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700">
                {fotoSubiendo ? t("Subiendo…") : avatarUrl ? t("Cambiar foto") : t("Añadir foto (opcional)")}
                {/* image/* para que el móvil ofrezca cámara Y galería; el formato real
                    lo valida el servidor (JPG, PNG o WebP). */}
                <input type="file" accept="image/*" className="hidden" onChange={subirFoto} />
              </label>
              <p className="mt-1.5 text-xs text-slate-400">{t("Tus clientes la verán en la cabecera de tus emails. JPG, PNG o WebP · máx. 2 MB.")}</p>
              {fotoError && <p role="alert" className="mt-1 text-xs text-red-600">{fotoError}</p>}
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
            <p className="text-xs text-slate-500">{esPrueba ? t("Prueba gratis de 15 días, sin tarjeta. Elige el plan que probarás.") : t("15 días gratis. Te pediremos una tarjeta al final, sin cobro hasta el final de la prueba.")}</p>
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
          <button type="button" onClick={crearDespacho} disabled={loading} className="block w-full rounded-lg bg-aproba-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300">{loading ? t("Creando tu despacho…") : t("Crear mi despacho y entrar")}</button>
        </div>
      )}

    </div>
  );
}
