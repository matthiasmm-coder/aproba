"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { ContadorExpedientes } from "@/components/contador-expedientes";
import { useT } from "@/components/lang-provider";

// Nuevo expediente — RÉEL : choisir un client existant (individu OU famille) ou en créer un
// (individual OU familia), créer l'expediente en base (referencia + token de portail),
// puis envoyer le lien /j/{token}. Le client choisira son trámite dans le portail.
// Famille : UN seul expediente couvre toute la famille ; le client remplit la ficha de
// chaque membre et téléverse les documents (les communs une seule fois).

type ClienteRow = { id: string; nombre: string; apellidos: string | null; telefono: string | null; nacionalidad: string | null };
type FamiliaRow = { id: string; nombre: string; miembros: number };

const STEP_LABELS = ["Cliente", "Enlace"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const iniciales = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function Check({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
function FamIcon({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.2" /><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M15.5 20v-1a3.5 3.5 0 0 1 3.5-3.5h.5" /></svg>;
}

export function NuevoExpediente() {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [familias, setFamilias] = useState<FamiliaRow[]>([]);
  const [q, setQ] = useState("");
  const [seleccionado, setSeleccionado] = useState<ClienteRow | null>(null);
  const [familiaSel, setFamiliaSel] = useState<FamiliaRow | null>(null);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<"individual" | "familia">("individual");
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", telefono: "" });
  const [nuevaFam, setNuevaFam] = useState({ nombre: "", titularNombre: "", titularApellidos: "", telefono: "" });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // résultat
  const [ref, setRef] = useState("");
  const [token, setToken] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [esFamiliar, setEsFamiliar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gestoriaNombre, setGestoriaNombre] = useState("");
  // Contador mensual de expedientes (cuota del plan).
  const [usados, setUsados] = useState<number | null>(null);
  const [plan, setPlan] = useState("STARTER");
  const [enPrueba, setEnPrueba] = useState(false);
  const [extraFacturado, setExtraFacturado] = useState(false);
  const enviando = useRef(false);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowser();
      const [{ data: cli }, { data: mem }] = await Promise.all([
        supabase.from("Cliente").select("id, nombre, apellidos, telefono, nacionalidad").order("nombre"),
        supabase.from("Membership").select("Workspace(nombre)").limit(1).maybeSingle(),
      ]);
      setClientes((cli ?? []) as ClienteRow[]);
      const ws = mem ? (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace) : null;
      if (ws?.nombre) setGestoriaNombre(ws.nombre as string);

      // Familias del workspace (repli propre si la table n'existe pas encore).
      try {
        const { data: fams } = await supabase.from("Familia").select("id, nombre, clientes:Cliente(id)").order("nombre");
        setFamilias(((fams ?? []) as unknown as { id: string; nombre: string; clientes: { id: string }[] | null }[]).map((f) => ({ id: f.id, nombre: f.nombre, miembros: (f.clientes ?? []).length })));
      } catch { /* sans familles */ }

      try {
        let subRes = await supabase.from("Subscription").select("plan, estado, modoPrueba").limit(1).maybeSingle();
        if (subRes.error) subRes = await supabase.from("Subscription").select("plan, estado").limit(1).maybeSingle();
        const sub = subRes.data as { plan?: string; estado?: string; modoPrueba?: boolean | null } | null;
        if (sub?.plan) setPlan(sub.plan);
        setEnPrueba(sub?.estado === "TRIAL" || sub?.modoPrueba === true);
      } catch { /* STARTER */ }

      const ahora = new Date();
      const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
      const { count } = await supabase.from("Expediente").select("*", { count: "exact", head: true }).gte("createdAt", inicioMes);
      setUsados(count ?? 0);
    })();
  }, []);

  const filtrados = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return clientes;
    return clientes.filter((c) => norm(`${c.nombre} ${c.apellidos ?? ""}`).includes(nq) || norm(c.nacionalidad ?? "").includes(nq));
  }, [q, clientes]);
  const famFiltradas = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return familias;
    return familias.filter((f) => norm(f.nombre).includes(nq));
  }, [q, familias]);

  const canCrear = !creando && (
    modoNuevo
      ? (tipoNuevo === "familia" ? nuevaFam.nombre.trim().length > 0 : nuevo.nombre.trim().length > 0)
      : (!!seleccionado || !!familiaSel)
  );

  async function crear() {
    if (enviando.current) return;
    enviando.current = true;
    setCreando(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      let nombre: string;
      let tel: string;
      if (modoNuevo && tipoNuevo === "familia") {
        nombre = nuevaFam.nombre.trim();
        tel = nuevaFam.telefono.trim();
        body = { familiaNueva: { nombre, titular: { nombre: nuevaFam.titularNombre.trim(), apellidos: nuevaFam.titularApellidos.trim(), telefono: tel } } };
      } else if (modoNuevo) {
        nombre = `${nuevo.nombre.trim()} ${nuevo.apellidos.trim()}`.trim();
        tel = nuevo.telefono.trim();
        body = { nuevo: { nombre: nuevo.nombre.trim(), apellidos: nuevo.apellidos.trim(), telefono: tel } };
      } else if (familiaSel) {
        nombre = familiaSel.nombre;
        tel = "";
        body = { familiaExistenteId: familiaSel.id };
      } else {
        nombre = `${seleccionado!.nombre} ${seleccionado!.apellidos ?? ""}`.trim();
        tel = seleccionado!.telefono ?? "";
        body = { clienteId: seleccionado!.id };
      }

      const res = await fetch("/api/expedientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo crear el expediente. Vuelve a intentarlo."));

      setRef(d.referencia);
      setToken(d.portalToken);
      setTelefono(tel);
      setNombreCliente(nombre);
      setEsFamiliar(Boolean(d.familiar));
      setExtraFacturado(Boolean(d.extra));
      setUsados((u) => (u ?? 0) + 1);
      setStep(1);
      router.refresh();
    } catch (err) {
      console.error("[nuevo-expediente]", err);
      setError(err instanceof Error ? err.message : t("No se pudo crear el expediente. Vuelve a intentarlo."));
    } finally {
      setCreando(false);
      enviando.current = false;
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://aproba-software.com";
  const host = typeof window !== "undefined" ? window.location.host : "aproba-software.com";
  const portalUrl = `${host}/j/${token}`;
  const portalFull = `${origin}/j/${token}`;
  const portalHref = `/j/${token}`;
  const saludo = esFamiliar ? (nombreCliente || t("familia")) : nombreCliente.split(" ")[0];
  const waMsg = esFamiliar
    ? `Hola, soy de ${gestoriaNombre || "tu gestoría"}. Para empezar el trámite de ${saludo}, entra aquí, elige el trámite y rellena los datos y documentos de cada miembro: ${portalFull}`
    : `Hola ${saludo}, soy de ${gestoriaNombre || "tu gestoría"}. Para empezar tu trámite de extranjería, entra aquí, elige tu trámite y sube tus documentos: ${portalFull}`;
  const waLink = telefono
    ? `https://wa.me/${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(waMsg)}`
    : `https://wa.me/?text=${encodeURIComponent(waMsg)}`;

  function copiar() {
    navigator.clipboard?.writeText(portalFull).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  const input = "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/app/expedientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {t("Expedientes")}
      </Link>

      {/* Stepper */}
      <div className="mb-7 flex items-center gap-2">
        {STEP_LABELS.map((l, i) => (
          <div key={l} className="flex-1">
            <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-aproba-600" : "bg-slate-200"}`} />
            <p className={`mt-1.5 text-[11px] font-medium ${i <= step ? "text-aproba-700" : "text-slate-400"}`}>{t(l)}</p>
          </div>
        ))}
      </div>

      {/* Step 0 · Cliente */}
      {step === 0 && (
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-slate-900">{t("Nuevo expediente")}</h1>
          <p className="mt-1 text-slate-500">{t("Elige el cliente (o una familia). Le enviarás un enlace y elegirá su trámite y subirá sus documentos.")}</p>

          {usados !== null && (
            <div className="mt-5">
              <ContadorExpedientes usados={usados} plan={plan} enPrueba={enPrueba} />
            </div>
          )}

          {/* Bascule existant / nouveau */}
          <div className="mt-5 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
            <button onClick={() => { setModoNuevo(false); setError(null); }} className={`rounded-md px-4 py-2 text-sm font-medium transition ${!modoNuevo ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Cliente existente")}</button>
            <button onClick={() => { setModoNuevo(true); setSeleccionado(null); setFamiliaSel(null); setError(null); }} className={`rounded-md px-4 py-2 text-sm font-medium transition ${modoNuevo ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Cliente nuevo")}</button>
          </div>

          {!modoNuevo ? (
            <div className="mt-4">
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente o familia…")} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
              </div>
              <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {/* Familias (seleccionar la familia = expediente familiar) */}
                {famFiltradas.length > 0 && (
                  <>
                    <p className="px-1 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Familias")}</p>
                    {famFiltradas.map((f) => {
                      const sel = familiaSel?.id === f.id;
                      return (
                        <button key={f.id} onClick={() => { setFamiliaSel(f); setSeleccionado(null); }} className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition ${sel ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-aproba-700"><FamIcon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{f.nombre}</span>
                            <span className="block truncate text-xs text-slate-400">{f.miembros} {f.miembros === 1 ? t("miembro") : t("miembros")}</span>
                          </span>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sel ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>{sel && <Check className="h-3 w-3" />}</span>
                        </button>
                      );
                    })}
                    {filtrados.length > 0 && <p className="px-1 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("Clientes")}</p>}
                  </>
                )}
                {/* Individuos */}
                {filtrados.map((c) => {
                  const nombre = `${c.nombre} ${c.apellidos ?? ""}`.trim();
                  const sel = seleccionado?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => { setSeleccionado(c); setFamiliaSel(null); }} className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left transition ${sel ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-xs font-semibold text-aproba-700">{iniciales(nombre)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{nombre}</span>
                        <span className="block truncate text-xs text-slate-400">{c.nacionalidad ?? "—"}{c.telefono ? ` · ${c.telefono}` : ""}</span>
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sel ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>{sel && <Check className="h-3 w-3" />}</span>
                    </button>
                  );
                })}
                {filtrados.length === 0 && famFiltradas.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{t("Sin resultados. ¿Es un")} <button onClick={() => setModoNuevo(true)} className="font-semibold text-aproba-700 hover:underline">{t("cliente nuevo")}</button>?</p>}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {/* Sous-bascule individual / familia */}
              <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
                <button onClick={() => setTipoNuevo("individual")} className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${tipoNuevo === "individual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Individual")}</button>
                <button onClick={() => setTipoNuevo("familia")} className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${tipoNuevo === "familia" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Familia")}</button>
              </div>

              {tipoNuevo === "individual" ? (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">{t("Nombre *")}</label>
                    <input value={nuevo.nombre} onChange={(e) => setNuevo((c) => ({ ...c, nombre: e.target.value }))} className={input} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">{t("Apellidos")}</label>
                    <input value={nuevo.apellidos} onChange={(e) => setNuevo((c) => ({ ...c, apellidos: e.target.value }))} className={input} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-slate-700">{t("Teléfono (WhatsApp)")}</label>
                    <input value={nuevo.telefono} onChange={(e) => setNuevo((c) => ({ ...c, telefono: e.target.value }))} placeholder="612 345 678" className={input} />
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">{t("Nombre de la familia *")}</label>
                    <input value={nuevaFam.nombre} onChange={(e) => setNuevaFam((f) => ({ ...f, nombre: e.target.value }))} placeholder={t("p. ej. Familia Benali")} className={input} />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{t("El titular recibirá el enlace y rellenará la ficha de cada miembro (y los documentos comunes una sola vez) desde el portal.")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">{t("Titular · nombre")}</label>
                      <input value={nuevaFam.titularNombre} onChange={(e) => setNuevaFam((f) => ({ ...f, titularNombre: e.target.value }))} className={input} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">{t("Titular · apellidos")}</label>
                      <input value={nuevaFam.titularApellidos} onChange={(e) => setNuevaFam((f) => ({ ...f, titularApellidos: e.target.value }))} className={input} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-slate-700">{t("Teléfono del titular (WhatsApp)")}</label>
                      <input value={nuevaFam.telefono} onChange={(e) => setNuevaFam((f) => ({ ...f, telefono: e.target.value }))} placeholder="612 345 678" className={input} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            disabled={!canCrear}
            onClick={crear}
            className="mt-6 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {creando ? t("Creando…") : (familiaSel || (modoNuevo && tipoNuevo === "familia")) ? t("Crear expediente familiar") : t("Crear expediente")}
          </button>
        </div>
      )}

      {/* Step 1 · Enlace */}
      {step === 1 && (
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-aproba-600">
            <Check className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tightest text-slate-900">{esFamiliar ? t("Expediente familiar creado") : t("Expediente creado")}</h1>
          <p className="mt-1 text-slate-500">
            <span className="font-mono text-slate-700">{ref}</span> · {nombreCliente}
          </p>

          {esFamiliar && (
            <div className="mx-auto mt-4 max-w-md rounded-lg border border-aproba-200 bg-aproba-50/60 px-3 py-2 text-xs leading-relaxed text-aproba-800">
              {t("El cliente rellenará la ficha de cada miembro de la familia y subirá los documentos (los comunes una sola vez).")}
            </div>
          )}

          {extraFacturado && (
            <div className="mx-auto mt-4 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              {t("Este expediente supera el límite de tu plan: se añadirán 3 € a tu próxima factura.")}
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 text-left">
            <p className="text-sm font-semibold text-slate-800">{t("Enlace para tu cliente")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("Envíaselo por WhatsApp. Elegirá su trámite y subirá sus datos y documentos sin instalar nada.")}</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-cream-50 px-3 py-2.5">
              <span className="flex-1 truncate font-mono text-sm text-slate-700">{portalUrl}</span>
              <button onClick={copiar} className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
                {copied ? t("¡Copiado!") : t("Copiar")}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.2zM12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2z" /></svg>
                {t("Enviar por WhatsApp")}
              </a>
              <a href={portalHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
                {t("Ver portal")}
              </a>
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-3 text-sm">
            <Link href="/app/expedientes" className="font-semibold text-aproba-700 hover:underline">{t("Ir al tablero")}</Link>
            <span className="text-slate-300">·</span>
            <button onClick={() => { setStep(0); setSeleccionado(null); setFamiliaSel(null); setModoNuevo(false); setTipoNuevo("individual"); setNuevo({ nombre: "", apellidos: "", telefono: "" }); setNuevaFam({ nombre: "", titularNombre: "", titularApellidos: "", telefono: "" }); setQ(""); }} className="text-slate-500 hover:text-slate-800">
              {t("Crear otro")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
