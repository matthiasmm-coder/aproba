"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { periodoCuota } from "@/lib/cuota";
import { copiarTexto } from "@/lib/copiar";
import { ContadorExpedientes } from "@/components/contador-expedientes";
import { AjustarPresupuestoModal } from "@/components/ajustar-presupuesto-modal";
import { EncargoManualPanel } from "@/components/encargo-manual-panel";
import { useT } from "@/components/lang-provider";
import { SelectorSedeCreacion } from "@/components/selector-sede-creacion";
import { contextoDeTrabajoBrowser } from "@/lib/oficinas-browser";
import { TelefonoInput } from "@/components/telefono-input";
import { avisarGuia } from "@/components/guia-activacion";

// Nuevo expediente — RÉEL : choisir un client existant (individu OU famille) ou en créer un
// (individual OU familia), créer l'expediente en base (referencia + token de portail),
// puis envoyer le lien /j/{token}. Le client choisira son trámite dans le portail.
// Famille : UN seul expediente couvre toute la famille ; le client remplit la ficha de
// chaque membre et téléverse les documents (les communs une seule fois).

type ClienteRow = { id: string; nombre: string; apellidos: string | null; telefono: string | null; nacionalidad: string | null; oficinaId?: string | null };
type FamiliaRow = { id: string; nombre: string; miembros: number; oficinaId: string | null };

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
  const [oficinas, setOficinas] = useState<{ id: string; nombre: string }[]>([]);
  const [q, setQ] = useState("");
  const [seleccionado, setSeleccionado] = useState<ClienteRow | null>(null);
  const [familiaSel, setFamiliaSel] = useState<FamiliaRow | null>(null);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<"individual" | "familia">("individual");
  const [nuevo, setNuevo] = useState({ nombre: "", apellidos: "", telefono: "" });
  // «Todas» = lectura: un cliente creado al vuelo necesita oficina concreta (uno existente ya tiene la suya).
  const [sedeCreacion, setSedeCreacion] = useState<{ sede: string | null; requerida: boolean }>({ sede: null, requerida: false });
  const [nuevaFam, setNuevaFam] = useState({ nombre: "", titularNombre: "", titularApellidos: "", telefono: "" });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // résultat
  const [ref, setRef] = useState("");
  const [expId, setExpId] = useState("");
  const [token, setToken] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [esFamiliar, setEsFamiliar] = useState(false);
  // Miembros de la familia al crear: el servicio se tarifica POR MIEMBRO, así que la
  // previsualización del presupuesto debe multiplicar igual que el portal y la factura.
  // Familia nueva = solo el titular (el cliente añadirá el resto desde su enlace).
  const [miembrosFam, setMiembrosFam] = useState(1);
  const [copied, setCopied] = useState(false);
  const [falloCopia, setFalloCopia] = useState(false);
  const [ajustando, setAjustando] = useState(false); // popup «cerrar el precio antes de enviar»
  const [ajustado, setAjustado] = useState(false);
  // Modo de trabajo, elegido AQUÍ (22/08, pedido de Matthias): «portal» manda el enlace
  // al cliente; «manual» significa que el despacho lo trabaja internamente y el producto
  // deja de pedir el enlace por todas partes (tarjeta, ficha, recordatorios).
  const [modo, setModo] = useState<"portal" | "manual">("portal");
  const [guardandoModo, setGuardandoModo] = useState(false);
  const [errorModo, setErrorModo] = useState<string | null>(null);

  async function elegirModo(nuevo: "portal" | "manual") {
    if (!expId || guardandoModo) return;
    const antes = modo;
    setModo(nuevo); setGuardandoModo(true); setErrorModo(null);
    try {
      const res = await fetch(`/api/expedientes/${expId}/modo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: nuevo }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("No se pudo guardar el modo."));
      }
    } catch (e) {
      setModo(antes); // el toggle no miente: si el servidor no lo guardó, vuelve
      setErrorModo(e instanceof Error ? e.message : t("No se pudo guardar el modo."));
    } finally { setGuardandoModo(false); }
  }
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
      let cliRes = await supabase.from("Cliente").select("id, nombre, apellidos, telefono, nacionalidad, oficinaId").order("nombre");
      if (cliRes.error) cliRes = await supabase.from("Cliente").select("id, nombre, apellidos, telefono, nacionalidad").order("nombre") as typeof cliRes;
      const { data: mem } = await supabase.from("Membership").select("Workspace(nombre)").limit(1).maybeSingle();
      setClientes((cliRes.data ?? []) as ClienteRow[]);
      const ws = mem ? (Array.isArray(mem.Workspace) ? mem.Workspace[0] : mem.Workspace) : null;
      if (ws?.nombre) setGestoriaNombre(ws.nombre as string);

      try {
        setOficinas((await contextoDeTrabajoBrowser()).oficinas); // source unique
      } catch { /* mono-oficina o sin migrar */ }

      // Familias del workspace (repli propre si la table n'existe pas encore).
      try {
        let famRes = await supabase.from("Familia").select("id, nombre, clientes:Cliente(id, oficinaId)").order("nombre");
        if (famRes.error) famRes = await supabase.from("Familia").select("id, nombre, clientes:Cliente(id)").order("nombre") as typeof famRes;
        setFamilias(((famRes.data ?? []) as unknown as { id: string; nombre: string; clientes: { id: string; oficinaId?: string | null }[] | null }[]).map((f) => ({
          id: f.id, nombre: f.nombre, miembros: (f.clientes ?? []).length,
          // sede de la familia = la del primer miembro anclado (como oficinaDeFamilia);
          // null = ningún miembro anclado → habrá que elegir (adopción).
          oficinaId: (f.clientes ?? []).find((c) => c.oficinaId)?.oficinaId ?? null,
        })));
      } catch { /* sans familles */ }

      // La suscripción da el plan Y el día ancla del ciclo de facturación (la cuota se
      // renueva el día en que se paga, no el 1 — ver lib/cuota).
      let subCiclo: { currentPeriodEnd?: string | null; trialEndsAt?: string | null } | null = null;
      try {
        let subRes = await supabase.from("Subscription").select("plan, estado, modoPrueba, currentPeriodEnd, trialEndsAt").limit(1).maybeSingle();
        if (subRes.error) subRes = await supabase.from("Subscription").select("plan, estado, modoPrueba").limit(1).maybeSingle();
        if (subRes.error) subRes = await supabase.from("Subscription").select("plan, estado").limit(1).maybeSingle();
        const sub = subRes.data as { plan?: string; estado?: string; modoPrueba?: boolean | null; currentPeriodEnd?: string | null; trialEndsAt?: string | null } | null;
        if (sub?.plan) setPlan(sub.plan);
        setEnPrueba(sub?.estado === "TRIAL" || sub?.modoPrueba === true);
        subCiclo = sub ? { currentPeriodEnd: sub.currentPeriodEnd, trialEndsAt: sub.trialEndsAt } : null;
      } catch { /* STARTER */ }

      // Contador MONÓTONO del ciclo en curso — el mismo que decide el cobro del excedente
      // (lib/overage.ts): no baja al borrar expedientes. Sin fila aún = 0 creados.
      // Repli al count vivo si supabase/uso-mensual.sql no está aplicado todavía.
      const { clave, inicio } = periodoCuota(new Date(), subCiclo);
      const uso = await supabase.from("UsoMensual").select("expedientesCreados").eq("mes", clave).maybeSingle();
      if (!uso.error) {
        setUsados((uso.data?.expedientesCreados as number | null) ?? 0);
      } else {
        const { count } = await supabase.from("Expediente").select("*", { count: "exact", head: true }).gte("createdAt", inicio.toISOString());
        setUsados(count ?? 0);
      }
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

  // Nace algo sin oficina: cliente nuevo, o cliente/familia EXISTENTE sin sede — en ese
  // caso la sede elegida ADOPTA al cliente (el expediente hereda; el invariante
  // «expediente = sede del cliente» se mantiene).
  const necesitaSede = modoNuevo || (!!seleccionado && !seleccionado.oficinaId) || (!!familiaSel && !familiaSel.oficinaId);
  // Sede impuesta por la selección existente (cliente/familia ya anclados): se ENSEÑA, no se elige.
  const sedeImpuesta = seleccionado?.oficinaId ?? familiaSel?.oficinaId ?? null;

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
      if (necesitaSede && sedeCreacion.requerida && !sedeCreacion.sede) {
        throw new Error(t("Estás en «Todas» (solo lectura). Elige la oficina en la que trabajas."));
      }
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

      if (necesitaSede && sedeCreacion.requerida && sedeCreacion.sede) body.oficinaId = sedeCreacion.sede;
      const res = await fetch("/api/expedientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t("No se pudo crear el expediente. Vuelve a intentarlo."));

      setRef(d.referencia);
      setExpId(d.expedienteId);
      setToken(d.portalToken);
      setTelefono(tel);
      setNombreCliente(nombre);
      setEsFamiliar(Boolean(d.familiar));
      setMiembrosFam(familiaSel ? Math.max(1, familiaSel.miembros) : 1);
      setAjustado(false);
      setExtraFacturado(Boolean(d.extra));
      setUsados((u) => (u ?? 0) + 1);
      setStep(1);
      router.refresh();
      avisarGuia(); // la guía pasa a «envíale el enlace» sin cambiar de página
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

  // Sin manejo del fallo, el botón «Copiar» quedaba MUDO cuando el navegador bloqueaba
  // el portapapeles: ni copiado, ni aviso. El gestor creía haber copiado el enlace.
  async function copiar() {
    if (await copiarTexto(portalFull)) {
      setFalloCopia(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      setFalloCopia(true); // la UI muestra el enlace en claro para copiarlo a mano
    }
  }

  const input = "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100";

  return (
    <div className="mx-auto max-w-xl">
      {ajustando && expId && (
        <AjustarPresupuestoModal
          expedienteId={expId}
          nMiembros={miembrosFam}
          onClose={(guardado) => { setAjustando(false); if (guardado) setAjustado(true); }}
        />
      )}
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
            <button onClick={() => { setModoNuevo(true); setSeleccionado(null); setFamiliaSel(null); setError(null); }} data-guia={!modoNuevo && !seleccionado && !familiaSel ? "cliente-nuevo" : undefined} className={`rounded-md px-4 py-2 text-sm font-medium transition ${modoNuevo ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{t("Cliente nuevo")}</button>
          </div>

          {!modoNuevo ? (
            <div className="mt-4">
              {/* La oficina del expediente, visible DESDE EL PRINCIPIO (≥2 oficinas):
                  cliente/familia ya anclados → su sede manda y se enseña bloqueada;
                  sin selección o selección sin sede → selector (la elegida ADOPTA). */}
              {oficinas.length >= 2 && (sedeImpuesta ? (
                <div className="mb-3 rounded-xl border border-slate-200 bg-cream-50/60 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Creando en")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{oficinas.find((o) => o.id === sedeImpuesta)?.nombre ?? t("Oficina del cliente")}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{familiaSel ? t("La oficina de la familia manda: el expediente la hereda.") : t("La oficina del cliente manda: el expediente la hereda.")}</p>
                </div>
              ) : (
                <div className="mb-1">
                  {(seleccionado || familiaSel) && (
                    <p className="mb-1 text-xs text-slate-500">{familiaSel ? t("Esta familia no tiene oficina asignada: se asignará a la que elijas.") : t("Este cliente no tiene oficina asignada: se asignará a la que elijas.")}</p>
                  )}
                  <SelectorSedeCreacion onEstado={setSedeCreacion} />
                </div>
              ))}
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente o familia…")} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-[16px] sm:text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
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
              <SelectorSedeCreacion onEstado={setSedeCreacion} />
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
                    <div className="mt-1.5">
                      <TelefonoInput value={nuevo.telefono} onChange={(v) => setNuevo((c) => ({ ...c, telefono: v }))} className={input.replace("mt-1.5 ", "")} labelPrefijo={t("Prefijo de país")} labelSinPrefijo={t("— Sin prefijo")} />
                    </div>
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
                      <div className="mt-1.5">
                        <TelefonoInput value={nuevaFam.telefono} onChange={(v) => setNuevaFam((f) => ({ ...f, telefono: v }))} className={input.replace("mt-1.5 ", "")} labelPrefijo={t("Prefijo de país")} labelSinPrefijo={t("— Sin prefijo")} />
                      </div>
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
            data-guia="crear-expediente" className="mt-6 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-200 disabled:text-slate-400"
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

          {/* Cómo se va a trabajar este expediente. Es una decisión REAL del despacho:
              muchos trámites (contra-trámites, clientes que traen los papeles en mano)
              nunca pasan por el portal, y pedirles el enlace era ruido permanente. */}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {/* focus-visible en verde de marca: el anillo azul por defecto del navegador
                se quedaba pegado tras el clic y no era el color de Aproba. */}
            <button
              type="button"
              onClick={() => elegirModo("portal")}
              aria-pressed={modo === "portal"}
              className={`rounded-2xl border p-4 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-aproba-300 ${modo === "portal" ? "border-aproba-500 bg-aproba-50/60 ring-2 ring-aproba-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <p className="text-sm font-semibold text-slate-900">{t("Con enlace al cliente")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("Tu cliente sube sus documentos.")}</p>
            </button>
            <button
              type="button"
              onClick={() => elegirModo("manual")}
              aria-pressed={modo === "manual"}
              className={`rounded-2xl border p-4 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-aproba-300 ${modo === "manual" ? "border-aproba-500 bg-aproba-50/60 ring-2 ring-aproba-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <p className="text-sm font-semibold text-slate-900">{t("Modo manual")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("Los subes tú, sin enlace.")}</p>
            </button>
          </div>
          {errorModo && <p role="alert" className="mt-2 text-xs text-red-600">{errorModo}</p>}

          {modo === "manual" ? (
            /* Modo manual (22/08, pedido de Matthias): antes de trabajar, el gestor FIJA
               el encargo — servicios del catálogo, cobro inicial y el email combinado al
               cliente (factura + hoja de encargo y mandato para firmar). */
            <EncargoManualPanel expedienteId={expId} nMiembros={miembrosFam} />
          ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-left">
            <p className="text-sm font-semibold text-slate-800">{t("Enlace para tu cliente")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("Envíaselo por WhatsApp. Elegirá su trámite y subirá sus datos y documentos sin instalar nada.")}</p>
            <div data-guia="enlace-portal" className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-cream-50 px-3 py-2.5">
              {/* input readonly y no <span>: si el portapapeles falla, el gestor todavía
                  puede seleccionarlo entero y copiarlo a mano. */}
              <input
                readOnly
                value={portalUrl}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={t("Enlace para tu cliente")}
                className="min-w-0 flex-1 bg-transparent font-mono text-[16px] sm:text-sm text-slate-700 outline-none"
              />
              <button onClick={copiar} className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400">
                {copied ? t("¡Copiado!") : t("Copiar")}
              </button>
            </div>
            {falloCopia && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {t("Tu navegador ha bloqueado el portapapeles. Selecciona el enlace de arriba y cópialo a mano.")}
              </p>
            )}
            {/* Precio cerrado con el cliente (packs, varios servicios): el enlace NO se envía
                solo, así que el gestor puede fijar antes el servicio y el descuento sin salir
                del alta — el presupuesto que verá el cliente ya sale ajustado. */}
            {expId && (
              ajustado ? (
                <p className="mt-3 text-xs font-medium text-aproba-700">
                  {t("Presupuesto ajustado ✓")}{" "}
                  <button onClick={() => setAjustando(true)} className="font-normal text-slate-400 underline transition hover:text-slate-600">{t("Volver a editar")}</button>
                </p>
              ) : (
                <button onClick={() => setAjustando(true)} className="mt-3 inline-block text-xs font-medium text-aproba-700 hover:underline">
                  {t("Ajustar servicio y descuento antes de enviarlo")}
                </button>
              )
            )}

            <div className="mt-3 flex gap-2">
              <a href={waLink} target="_blank" rel="noopener noreferrer" data-guia="enviar-enlace" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.2zM12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2z" /></svg>
                {t("Enviar por WhatsApp")}
              </a>
              <a href={portalHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
                {t("Ver portal")}
              </a>
            </div>
          </div>
          )}

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
