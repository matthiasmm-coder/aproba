"use client";

import { useEffect, useRef, useState } from "react";
import { AprobaMark } from "./logo";
import { DEFAULT_SERVICIOS, loadServicios, type Servicio } from "@/lib/servicios";
import { eur, totalDe, r2 } from "@/lib/facturas";
import { aplicarDescuento, etiquetaDescuento, type Descuento } from "@/lib/multi-servicio";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, fichaVacia, type ClienteFicha } from "@/lib/ficha";
import { labelADocTipo } from "@/lib/tramites";
import { subirConProgreso } from "@/lib/subir-con-progreso";
import {
  LANGS, makeT, detectarLang, fieldLabel, grupoLabel, sexoLabel, estadoCivilLabel,
  servicioLabel, servicioDesc, docLabel, docHelp, type Lang, esRTL,
} from "@/lib/portal-i18n";
import { DatosFamilia, type MiembroInicial } from "@/components/datos-familia";
import { DocumentosFamiliaPortal } from "@/components/documentos-familia-portal";

// Portail client — ce que voit le client du gestor depuis le lien WhatsApp.
// Wizard : trámite → datos → documentos (validación IA) → pago (si anticipo) → enviado.
// Le client choisit sa langue (5) à la 1re étape (i18n via lib/portal-i18n).

type DocStatus = "pending" | "analyzing" | "validado" | "alerta";

const LANG_KEY = "aproba.portal.lang";
// Hoja de encargo + mandato firmados: labels ES fijos (labelADocTipo los mapea a
// HOJA_ENCARGO/MANDATO en el servidor). Nivel módulo → reutilizado por el
// inicializador de reprise Y el render.
const DOCS_FIRMA = ["Hoja de encargo firmada", "Mandato de representación firmado"];

// Champs obligatoires : tous sauf « piso / puerta » et les deux documents — pour
// NIE/pasaporte la règle est « AU MOINS UN des deux » (primera solicitud = souvent
// passeport seul ; nacionalizado = NIE seul). Exiger les deux bloquerait Continuar.
const REQUIRED_KEYS = FICHA_CAMPOS.filter((f) => f.k !== "piso" && f.k !== "numeroDocumento" && f.k !== "pasaporte").map((f) => f.k);
const docIdentidadOk = (f: Record<string, string | undefined>) => Boolean((f.numeroDocumento ?? "").trim() || (f.pasaporte ?? "").trim());

const EXTRACTED: Record<string, [string, string][]> = {
  Pasaporte: [["Nombre", "Julia Mendoza"], ["Nº", "AV284917"], ["Caducidad", "22/08/2029"]],
  "Certificado de empadronamiento": [["Dirección", "C/ Sepúlveda 112"], ["Municipio", "Barcelona"]],
  "Contrato de trabajo": [["Empleador", "Bonavista SL"], ["Puesto", "Ayud. cocina"]],
  "Antecedentes penales": [["Resultado", "Sin antecedentes"], ["País", "Colombia"]],
  "TIE actual": [["NIE", "Y3948172X"], ["Caducidad", "15/07/2026"]],
  "Justificante de medios económicos": [["Saldo", "4.200 €"], ["Entidad", "CaixaBank"]],
  "Libro de familia": [["Miembros", "3"]],
  "Justificante de vivienda": [["Tipo", "Contrato alquiler"]],
  "Certificado de nacimiento": [["País", "Colombia"]],
};

function Check({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

export function ClientPortal({
  servicios: serviciosProp,
  referencia,
  clienteNombre,
  clienteFicha,
  gestoria,
  token,
  tarjetaActiva,
  encargoActivo,
  familia,
  servicioInicial,
  serviciosExtraClaves,
  suplidosOverride,
  descuento = null,
  docsSubidos,
}: {
  servicios?: Servicio[];
  referencia?: string; // expediente réel (lien token) — sinon démo
  clienteNombre?: string;
  clienteFicha?: ClienteFicha;
  gestoria?: string;
  token?: string;
  tarjetaActiva?: boolean; // la gestoría acepta tarjeta → opción de pago con tarjeta
  encargoActivo?: boolean; // hoja de encargo + mandato: descarga y firma en el portal
  // Expediente FAMILIAR: la etapa Datos recoge la ficha de cada miembro (multi-membre).
  familia?: { familiaId: string; miembros: MiembroInicial[] };
  // REPRISE DE SESSION: servicio ya elegido + documentos ya subidos (el migrante que
  // vuelve al enlace NO empieza de cero — retoma en el primer paso incompleto).
  servicioInicial?: string | null;
  serviciosExtraClaves?: string[]; // multi-servicio: extras puestos por el gestor (no elegibles aquí)
  suplidosOverride?: { concepto: string; importe: number }[] | null; // tasas ajustadas por el gestor (sustituyen a las del servicio)
  descuento?: Descuento | null; // descuento del expediente (rebaja honorarios, nunca tasas)
  docsSubidos?: { tipo: string; estado: string }[];
}) {
  // Paso inicial = primer jalón incompleto (solo con token real y servicio ya elegido).
  const [step, setStep] = useState(() => {
    if (!token || !servicioInicial) return 0;
    const base: Record<string, string> = { ...fichaVacia(), ...(clienteFicha ?? {}) } as Record<string, string>;
    const fichaCompleta = REQUIRED_KEYS.every((k) => (base[k] ?? "").trim()) && docIdentidadOk(base);
    return fichaCompleta ? 2 : 1;
  });
  const [reanudado, setReanudado] = useState(() => Boolean(token && servicioInicial));
  const [lang, setLang] = useState<Lang>("es");
  const [tramiteId, setTramiteId] = useState<string | null>(servicioInicial ?? null);
  // Miembros de la familia (con esSolicitante): estado compartido entre Datos y Documentos.
  const [famMiembros, setFamMiembros] = useState<MiembroInicial[]>(familia?.miembros ?? []);
  const nombreCliente = clienteNombre ?? "Julia";
  const nombreGestoria = gestoria ?? "Gestoría Vallès";
  const inicialesGestoria = nombreGestoria.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const [ficha, setFicha] = useState<ClienteFicha>(() => {
    const base = fichaVacia();
    if (clienteFicha) Object.assign(base, clienteFicha);
    if (!base.nombre && !base.apellidos && clienteNombre) {
      const p = clienteNombre.trim().split(/\s+/);
      base.nombre = p[0] ?? ""; base.apellidos = p.slice(1).join(" ");
    }
    return base;
  });
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [errorPaso, setErrorPaso] = useState<string | null>(null);

  // POST con verificación + 1 reintento. ANTES: fire-and-forget → si el guardado
  // fallaba (red móvil), el wizard avanzaba igual y la ficha llegaba VACÍA al gestor.
  async function postSeguro(url: string, body: unknown): Promise<boolean> {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) return true;
      } catch { /* reintento */ }
    }
    return false;
  }
  const [docInfo, setDocInfo] = useState<number | null>(null); // quel doc affiche son infobulle
  // Reprise: los documentos YA subidos aparecen con su estado real (validado/analizando/
  // alerta) en vez de «pendiente» — el migrante no vuelve a subir lo que ya envió.
  const [docs, setDocs] = useState<Record<number, { status: DocStatus; attempts: number }>>(() => {
    if (!servicioInicial || !docsSubidos?.length) return {};
    const catalogo = serviciosProp ?? DEFAULT_SERVICIOS;
    const svc = catalogo.find((s) => s.id === servicioInicial);
    const m: Record<number, { status: DocStatus; attempts: number }> = {};
    // Iterar sobre la MISMA lista que el render (unión de docs del principal + extras
    // + firma) para que los índices coincidan — si no, al reanudar con extras los
    // estados se pintarían en los slots equivocados.
    const base = [...(svc?.docs ?? [])];
    for (const c of serviciosExtraClaves ?? []) {
      if (c === servicioInicial) continue;
      const sv = catalogo.find((x) => x.id === c);
      for (const d of sv?.docs ?? []) if (!base.includes(d)) base.push(d);
    }
    const labels = [...base, ...(encargoActivo && token ? DOCS_FIRMA : [])];
    labels.forEach((label, i) => {
      const row = docsSubidos.find((d) => d.tipo === labelADocTipo(label));
      if (row) m[i] = { status: row.estado === "VALIDADO" ? "validado" : row.estado === "PROCESANDO" ? "analyzing" : "alerta", attempts: 1 };
    });
    return m;
  });
  const [prog, setProg] = useState<Record<number, number>>({}); // % de progreso por documento (subida + análisis)
  const [servicios, setServicios] = useState<Servicio[]>(() => (serviciosProp ?? DEFAULT_SERVICIOS).filter((s) => s.active && s.label.trim()));
  const [pagando, setPagando] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [facturaNumero, setFacturaNumero] = useState<string | null>(null);
  // Total/estado REALES de la factura emitida (respuesta del servidor): tras un
  // cambio de miembros o un pago ya hecho, el cálculo local puede quedarse viejo.
  const [facturaTotal, setFacturaTotal] = useState<number | null>(null);
  const [facturaPagada, setFacturaPagada] = useState(false);
  const [camposReales, setCamposReales] = useState<Record<number, [string, string][]>>({});
  const [alertasReales, setAlertasReales] = useState<Record<number, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docPendienteRef = useRef<number | null>(null);
  const docsRef = useRef<HTMLDivElement>(null); // pour « seguir subiendo » → remonter à la liste

  const t = makeT(lang);

  // Langue : préférence sauvegardée, sinon celle du navigateur.
  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem(LANG_KEY)) as Lang | null;
    const l = saved && LANGS.some((x) => x.code === saved) ? saved : detectarLang();
    setLang(l);
    document.documentElement.lang = l; // lectores de pantalla + autotraducción del navegador
    document.documentElement.dir = esRTL(l) ? "rtl" : "ltr"; // árabe
  }, []);
  function elegirLang(l: Lang) {
    setLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = esRTL(l) ? "rtl" : "ltr"; // árabe: derecha → izquierda
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }

  // Sans prop serveur (anciennes routes) : config locale du gestor si présente.
  useEffect(() => {
    if (!serviciosProp) setServicios(loadServicios().filter((s) => s.active));
  }, [serviciosProp]);

  // Volver atrás desde Stripe Checkout restaura la página del bfcache TAL CUAL
  // (pagando=true → los tres botones congelados en «Procesando…»). Al restaurar,
  // reactivamos: elegir transferencia entonces reutiliza la factura ya emitida.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setPagando(false); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const tramite = servicios.find((tr) => tr.id === tramiteId);
  // Multi-servicio: los extras del gestor suman documentos (unión, orden principal→extras,
  // estable — los slots se indexan por posición) y tarifa. Mismas reglas que el servidor.
  // Catálogo SIN filtrar por active: un extra desactivado después de asignarse sigue
  // sumando en /api/pagos — el portal debe enseñar el mismo precio y los mismos docs.
  const extrasServicios = (serviciosExtraClaves ?? [])
    .filter((c) => c !== tramiteId)
    .map((c) => (serviciosProp ?? DEFAULT_SERVICIOS).find((sv) => sv.id === c))
    .filter((sv): sv is NonNullable<typeof sv> => Boolean(sv));
  const docsBase = [...(tramite?.docs ?? [])];
  for (const sv of extrasServicios) for (const d of sv.docs ?? []) if (!docsBase.includes(d)) docsBase.push(d);
  const requiredDocs = [...docsBase, ...(encargoActivo && token ? DOCS_FIRMA : [])];
  const allValidated = requiredDocs.length > 0 && requiredDocs.every((_, i) => docs[i]?.status === "validado");
  const nValidados = requiredDocs.filter((_, i) => docs[i]?.status === "validado").length;
  // Docs «completos» = el servicio no pide ninguno, o todos están validados. Si no,
  // la pantalla final no debe afirmar que todo está enviado (faltan documentos).
  const docsCompletos = requiredDocs.length === 0 || allValidated;
  // Expediente FAMILIAR: el servicio se tarifica POR MIEMBRO → el pago total
  // multiplica por el nº de miembros. OJO: famMiembros (estado VIVO, incluye los
  // añadidos en el paso Datos), no la prop SSR que llegó congelada del servidor.
  const nMiembros = Math.max(1, familia ? famMiembros.length : 1);
  // Honorarios del expediente: unidad × N, y DESPUÉS el descuento del gestor (mismo
  // helper y mismo orden que /api/pagos — el total mostrado DEBE cuadrar con Stripe).
  const tarifaUnit = {
    anticipo: (tramite?.anticipo ?? 0) + extrasServicios.reduce((a, sv) => a + (sv.anticipo ?? 0), 0),
    resto: (tramite?.resto ?? 0) + extrasServicios.reduce((a, sv) => a + (sv.resto ?? 0), 0),
  };
  const rebajadoExp = aplicarDescuento(tarifaUnit, nMiembros, descuento);
  const anticipoBruto = r2(tarifaUnit.anticipo * nMiembros);
  const anticipo = rebajadoExp.anticipo;
  const resto = rebajadoExp.resto;
  // Tasas y suplidos (SIN IVA): mismos que el servidor pondrá en la PRIMERA factura
  // (el anticipo si lo hay). ×N miembros — el total mostrado DEBE cuadrar con Stripe.
  // Si el gestor ajustó las tasas para este expediente (override), sustituyen a las del
  // servicio en todo el presupuesto — el mismo importe que emitirá /api/pagos.
  const ovUnit = Array.isArray(suplidosOverride) ? suplidosOverride.filter((x) => x.concepto && Number(x.importe) > 0) : null;
  const suplidosUnit = (sv?: { suplidos?: { concepto: string; importe: number }[] } | null) =>
    (sv?.suplidos ?? []).reduce((a, x) => a + (Number(x.importe) || 0), 0);
  // Total de tasas por UNIDAD (antes de ×N) — override si existe, si no servicio+extras.
  const suplidosUnitTotal = ovUnit
    ? ovUnit.reduce((a, x) => a + Number(x.importe), 0)
    : null; // null → cada tarjeta calcula el suyo con suplidosUnit
  const suplidosExp = (ovUnit ?? [tramite, ...extrasServicios].flatMap((sv) => sv?.suplidos ?? []))
    .filter((x) => x.concepto && Number(x.importe) > 0)
    .map((x) => ({ concepto: x.concepto, importe: Math.round(Number(x.importe) * nMiembros * 100) / 100 }));
  const suplidosTotal = suplidosExp.reduce((a, x) => a + x.importe, 0);
  const conPago = anticipo > 0;
  const PASO_PAGO = 3;
  const PASO_LISTO = 4;

  // Validation des données (active en mode réel) : compte les champs requis vides.
  const faltan = REQUIRED_KEYS.filter((k) => !((ficha[k] ?? "").trim())).length + (docIdentidadOk(ficha) ? 0 : 1);
  const validacionActiva = Boolean(token);
  const datosOk = !validacionActiva || faltan === 0;

  const stepLabels = [t("step.tramite"), t("step.datos"), t("step.documentos"), ...(conPago ? [t("step.pago")] : [])];

  function upload(i: number) {
    if (token) {
      docPendienteRef.current = i;
      fileInputRef.current?.click();
      return;
    }
    setDocs((d) => {
      const attempts = (d[i]?.attempts ?? 0) + 1;
      return { ...d, [i]: { status: "analyzing", attempts } };
    });
    window.setTimeout(() => {
      setDocs((d) => {
        const attempts = d[i]?.attempts ?? 1;
        const problem = i === 1 && attempts === 1;
        return { ...d, [i]: { status: problem ? "alerta" : "validado", attempts } };
      });
    }, 1400);
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const i = docPendienteRef.current;
    if (!file || i === null || !token) return;
    // Pre-check del tamaño ANTES de gastar datos móviles subiendo 20 MB para un rechazo.
    if (file.size > 8 * 1024 * 1024) {
      setAlertasReales((m) => ({ ...m, [i]: [t("s2.demasiadoGrande")] }));
      setDocs((d) => ({ ...d, [i]: { status: "alerta", attempts: d[i]?.attempts ?? 0 } }));
      return;
    }
    const label = requiredDocs[i];
    setDocs((d) => ({ ...d, [i]: { status: "analyzing", attempts: (d[i]?.attempts ?? 0) + 1 } }));
    setProg((p) => ({ ...p, [i]: 0 }));
    try {
      const { ok, data } = await subirConProgreso({
        form: { token: token ?? "", label },
        file,
        onProgreso: (v) => setProg((p) => ({ ...p, [i]: v })),
        errorRed: t("s2.errorSubir"),
      });
      if (!ok || !data) throw new Error(data?.error ?? t("s2.noSeLee"));
      const alertas: string[] = data.alertas ?? [];
      if (data.estado === "VALIDADO") {
        setCamposReales((m) => ({ ...m, [i]: (data.campos ?? []).slice(0, 6).map((c) => [c.label, c.value]) }));
        if (alertas.length) setAlertasReales((m) => ({ ...m, [i]: alertas }));
        setDocs((d) => ({ ...d, [i]: { status: "validado", attempts: d[i]?.attempts ?? 1 } }));
      } else {
        setAlertasReales((m) => ({ ...m, [i]: alertas.length ? alertas : [t("s2.noSeLee")] }));
        setDocs((d) => ({ ...d, [i]: { status: "alerta", attempts: d[i]?.attempts ?? 1 } }));
      }
    } catch (err) {
      setAlertasReales((m) => ({ ...m, [i]: [err instanceof Error ? err.message : t("s2.errorSubir")] }));
      setDocs((d) => ({ ...d, [i]: { status: "alerta", attempts: d[i]?.attempts ?? 1 } }));
    } finally {
      docPendienteRef.current = null;
    }
  }

  // Suppression d'un document soumis par erreur → on remet le slot à zéro (et on supprime
  // côté serveur en mode réel). Le client peut alors re-téléverser le bon fichier.
  async function quitarDoc(i: number) {
    const label = requiredDocs[i];
    setDocs((d) => { const c = { ...d }; delete c[i]; return c; });
    setCamposReales((m) => { const c = { ...m }; delete c[i]; return c; });
    setAlertasReales((m) => { const c = { ...m }; delete c[i]; return c; });
    setDocInfo((cur) => (cur === i ? null : cur));
    if (token) {
      try {
        await fetch("/api/portal/documentos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, label }),
        });
      } catch { /* le reset local suffit pour re-téléverser */ }
    }
  }

  async function confirmarTramite() {
    setErrorPaso(null);
    if (token && tramiteId) {
      setGuardandoDatos(true);
      const ok = await postSeguro("/api/portal/iniciar", { token, clave: tramiteId });
      setGuardandoDatos(false);
      if (!ok) { setErrorPaso(t("common.errorGuardar")); return; }
    }
    setStep(1);
  }

  async function pagar() {
    setPagando(true);
    setPagoError(null);
    try {
      if (!token) {
        // Démo (sans token réel) : on simule la confirmation, sans émettre de facture.
        setFacturaNumero(null);
        setStep(PASO_LISTO);
        return;
      }
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, momento: "ANTICIPO" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("s3.errorPago"));
      setFacturaNumero(data.numero);
      if (typeof data.total === "number") setFacturaTotal(data.total);
      setFacturaPagada(data.estado === "PAGADA");
      setStep(PASO_LISTO);
    } catch (err) {
      setPagoError(err instanceof Error ? err.message : t("s3.errorPago"));
    } finally {
      setPagando(false);
    }
  }

  // Pago del anticipo CON TARJETA : crea la factura y redirige a Stripe Checkout
  // (al volver, /pagar/exito la marca pagada). En demo (sin token) se simula.
  async function pagarTarjeta() {
    setPagando(true);
    setPagoError(null);
    try {
      if (!token) {
        setFacturaNumero(null);
        setStep(PASO_LISTO);
        return;
      }
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, momento: "ANTICIPO" }),
      });
      const data = await res.json();
      if (!res.ok || !data.facturaId) throw new Error(data.error ?? t("s3.errorPago"));
      window.location.href = `/api/pagos/checkout?f=${data.facturaId}`; // redirige (no reactivar pagando)
    } catch (err) {
      setPagoError(err instanceof Error ? err.message : t("s3.errorPago"));
      setPagando(false);
    }
  }

  // Avance depuis l'étape documents (vers pago ou listo) — autorisé même si tous
  // les documents ne sont pas encore validés (le client les complétera plus tard).
  async function proceder() {
    setErrorPaso(null);
    // Parcours sans paiement : fin du parcours → lien de suivi (email + WhatsApp).
    if (!conPago && token) {
      const ok = await postSeguro("/api/portal/completar", { token });
      if (!ok) { setErrorPaso(t("common.errorGuardar")); return; } // sin esto, el seguimiento nunca se enviaría
    }
    setStep(conPago ? PASO_PAGO : PASO_LISTO);
  }

  return (
    <div className="portal-mobile min-h-screen bg-cream-50">
      {/* Barre supérieure (marque de la gestoría) */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{inicialesGestoria}</span>
            <span className="text-sm font-semibold text-slate-800">{nombreGestoria}</span>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Idioma SIEMPRE accesible (antes solo vivía en el paso 0: un migrante que
                reanudaba su sesión en el paso 2 ya no podía cambiar de idioma). */}
            {step > 0 && step < PASO_LISTO && (
              <select
                value={lang}
                onChange={(e) => elegirLang(e.target.value as Lang)}
                aria-label={t("lang.selectLabel")}
                className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-aproba-600"
              >
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
              </select>
            )}
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              {t("header.con")} <AprobaMark size={13} />
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pb-16 pt-6">
        {/* Stepper */}
        {step < PASO_LISTO && (
          <div className="mb-7 flex items-center gap-2">
            {stepLabels.map((l, i) => (
              <div key={l} className="flex flex-1 items-center gap-2">
                <div className="flex-1">
                  <div className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-aproba-600" : "bg-slate-200"}`} />
                  <p className={`mt-1.5 text-[10px] font-medium ${i <= step ? "text-aproba-700" : "text-slate-400"}`}>{l}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reprise de session: el migrante retoma donde lo dejó (se cierra solo al avanzar). */}
        {reanudado && step < PASO_LISTO && (
          <div className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-aproba-200 bg-aproba-50 px-3.5 py-2.5">
            <p className="text-sm text-aproba-700">👋 {t("common.reanudado")}</p>
            <button onClick={() => setReanudado(false)} aria-label="OK" className="shrink-0 rounded-md px-1.5 text-aproba-400 hover:text-aproba-700">✕</button>
          </div>
        )}

        {/* Error de guardado: visible, traducido, y el wizard NO avanza hasta resolverlo. */}
        {errorPaso && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{errorPaso}</p>
        )}

        {/* ── Step 0 · Trámite ── */}
        {step === 0 && (
          <div>
            {/* Sélecteur de langue — liste déroulante élégante */}
            <div className="mb-5">
              <label htmlFor="portal-lang" className="mb-1 block text-xs font-medium text-slate-500">{t("lang.selectLabel")}</label>
              <select
                id="portal-lang"
                value={lang}
                onChange={(e) => elegirLang(e.target.value as Lang)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("s0.hola", { nombre: nombreCliente })}</h1>
            <p className="mt-2 text-slate-600">{t("s0.intro")}</p>
            {/* Servicios adicionales puestos por la gestoría: el precio de las tarjetas
                subiría «sin explicación» en el pago — se anuncian ANTES de elegir. */}
            {extrasServicios.length > 0 && (
              <div className="mt-4 rounded-xl border border-aproba-200 bg-aproba-50 px-4 py-3 text-sm text-aproba-800">
                {t("s0.extras", { lista: extrasServicios.map((sv) => servicioLabel(sv.id, sv.label, lang)).join(" + ") })}
              </div>
            )}
            <div className="mt-6 space-y-3">
              {servicios.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  {t("s0.sinServicios")}
                </p>
              )}
              {servicios.map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => setTramiteId(tr.id)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${
                    tramiteId === tr.id ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-slate-900">{servicioLabel(tr.id, tr.label, lang)}</p>
                      {/* Precio TOTAL si elige esta tarjeta: servicio + extras del gestor
                          + tasas — el mismo importe que verá al pagar (nada sube «después»). */}
                      <p className="shrink-0 text-right text-sm font-bold text-slate-700">
                        {(() => {
                          const reb = aplicarDescuento({
                            anticipo: tr.anticipo + extrasServicios.reduce((a, sv) => a + (sv.anticipo ?? 0), 0),
                            resto: tr.resto + extrasServicios.reduce((a, sv) => a + (sv.resto ?? 0), 0),
                          }, nMiembros, descuento);
                          // Suma de los DOS pagos reales (cada uno con su IVA redondeado):
                          // totalDe(a+r) puede desviarse 1 céntimo de lo que el cliente paga.
                          const precio = r2(totalDe(reb.anticipo) + totalDe(reb.resto)) + (suplidosUnitTotal ?? (suplidosUnit(tr) + extrasServicios.reduce((a, sv) => a + suplidosUnit(sv), 0))) * nMiembros;
                          return (
                            <>
                              {eur(precio)}
                              {reb.rebaja > 0 && <span dir="ltr" className="ml-1.5 rounded-full bg-aproba-100 px-1.5 py-0.5 text-[10px] font-semibold text-aproba-700">{etiquetaDescuento(descuento)}</span>}
                            </>
                          );
                        })()}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">{servicioDesc(tr.id, tr.desc, lang)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr.anticipo > 0 && tr.resto > 0
                        ? (() => {
                            // MISMA base que el precio de arriba (servicio + extras): con
                            // descuento IMPORTE, repartirlo solo sobre la tarjeta restaría
                            // el importe completo dos veces y el split no cuadraría.
                            const rebTr = aplicarDescuento({
                              anticipo: tr.anticipo + extrasServicios.reduce((a, sv) => a + (sv.anticipo ?? 0), 0),
                              resto: tr.resto + extrasServicios.reduce((a, sv) => a + (sv.resto ?? 0), 0),
                            }, nMiembros, descuento);
                            return t("pago.split", { a: eur(totalDe(rebTr.anticipo)), b: eur(totalDe(rebTr.resto)) });
                          })()
                        : tr.anticipo > 0
                          ? t("pago.unico")
                          : t("pago.final")}
                      {" · "}{t("pago.ivaIncluido")}
                      {nMiembros > 1 && <>{" · "}{t("s3.nMiembros", { n: nMiembros })}</>}
                    </p>
                  </div>
                  <span className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${tramiteId === tr.id ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>
                    {tramiteId === tr.id && <Check className="h-3 w-3" />}
                  </span>
                </button>
              ))}
            </div>
            <button
              disabled={!tramiteId}
              onClick={confirmarTramite}
              className="mt-7 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {t("common.continuar")}
            </button>
          </div>
        )}

        {/* ── Step 1 · Datos (familiar → multi-membre) ── */}
        {step === 1 && familia && token && (
          <DatosFamilia
            token={token}
            lang={lang}
            miembrosIniciales={famMiembros}
            onMiembrosChange={setFamMiembros}
            onBack={() => setStep(0)}
            onContinue={(ms) => { setFamMiembros(ms); setStep(2); }}
          />
        )}

        {/* ── Step 1 · Datos (individual) ── */}
        {step === 1 && !familia && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("step.datos")}</h1>
            <p className="mt-2 text-slate-600">{t("s1.intro")}</p>
            <div className="mt-6 space-y-5">
              {GRUPOS.map((grupo) => (
                <div key={grupo}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{grupoLabel(grupo, lang)}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {FICHA_CAMPOS.filter((f) => f.grupo === grupo).map((f) => {
                      const req = f.k !== "piso";
                      const vacio = !((ficha[f.k] ?? "").trim());
                      return (
                        <div key={f.k} className={f.w === "full" ? "sm:col-span-2" : ""}>
                          <label htmlFor={`ficha-${f.k}`} className="text-[13px] font-medium text-slate-600">
                            {fieldLabel(f.k, lang)}
                            {req ? <span className="text-red-500"> *</span> : <span className="text-slate-400"> ({t("s1.opcional")})</span>}
                          </label>
                          {f.tipo === "sexo" || f.tipo === "estadoCivil" ? (
                            <select
                              id={`ficha-${f.k}`}
                              value={ficha[f.k] ?? ""}
                              onChange={(e) => setFicha((d) => ({ ...d, [f.k]: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                            >
                              {(f.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v]) => (
                                <option key={v} value={v}>{f.tipo === "sexo" ? sexoLabel(v, lang) : estadoCivilLabel(v, lang)}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={`ficha-${f.k}`}
                              type={f.tipo === "date" ? "date" : f.type ?? "text"}
                              inputMode={f.inputMode}
                              autoComplete={f.ac}
                              value={ficha[f.k] ?? ""}
                              onChange={(e) => setFicha((d) => ({ ...d, [f.k]: e.target.value }))}
                              className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100 ${
                                validacionActiva && req && vacio ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
                              }`}
                            />
                          )}
                          {f.k === "apellidos" && <p className="mt-1 text-[11px] text-slate-400">{t("s1.apellidosHint")}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {validacionActiva && faltan > 0 && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{t("s1.faltan", { n: faltan })}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={() => setStep(0)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
              <button
                disabled={guardandoDatos || !datosOk}
                onClick={async () => {
                  setErrorPaso(null);
                  if (token) {
                    setGuardandoDatos(true);
                    const ok = await postSeguro("/api/portal/datos", { token, ficha, idioma: lang });
                    setGuardandoDatos(false);
                    if (!ok) { setErrorPaso(t("common.errorGuardar")); return; } // la ficha NO se pierde en silencio
                  }
                  setStep(2);
                }}
                className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {guardandoDatos ? t("s1.guardando") : t("common.continuar")}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 · Documentos (familiar → comunes + por miembro) ── */}
        {step === 2 && familia && token && (
          <DocumentosFamiliaPortal
            token={token}
            lang={lang}
            miembros={famMiembros}
            requiredDocs={requiredDocs}
            encargoActivo={encargoActivo && Boolean(token)}
            onBack={() => setStep(1)}
            onContinue={proceder}
          />
        )}

        {/* ── Step 2 · Documentos (individual) ── */}
        {step === 2 && !familia && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("step.documentos")}</h1>
            <p className="mt-2 text-slate-600">{t("s2.intro")}</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onArchivo} />

            {/* Documentos para FIRMAR: descarga → firma → subida en los huecos de abajo */}
            {encargoActivo && token && (
              <div className="mt-6 rounded-xl border border-aproba-200 bg-aproba-50 p-4">
                <p className="text-sm font-semibold text-aproba-800">{t("firma.titulo")}</p>
                <p className="mt-1 text-xs leading-relaxed text-aproba-700">{t("firma.intro")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <a href={`/api/portal/encargo?token=${token}&doc=hoja`} className="flex items-center justify-center gap-2 rounded-lg border border-aproba-300 bg-white px-3 py-2.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-100">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                    {t("firma.hoja")}
                  </a>
                  <a href={`/api/portal/encargo?token=${token}&doc=mandato`} className="flex items-center justify-center gap-2 rounded-lg border border-aproba-300 bg-white px-3 py-2.5 text-sm font-semibold text-aproba-700 transition hover:bg-aproba-100">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                    {t("firma.mandato")}
                  </a>
                </div>
              </div>
            )}

            <div ref={docsRef} className="mt-6 space-y-3">
              {requiredDocs.map((label, i) => {
                const st = docs[i]?.status ?? "pending";
                const ayuda = docHelp(label, lang);
                return (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st === "validado" ? "bg-aproba-100 text-aproba-600" : st === "alerta" ? "bg-amber-100 text-amber-600" : "bg-cream-50 text-slate-400"}`}>
                          {st === "validado" ? <Check className="h-4 w-4" /> : st === "alerta" ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                          )}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-800">{docLabel(label, lang)}</span>
                        {ayuda && (
                          <button
                            type="button"
                            onClick={() => setDocInfo((cur) => (cur === i ? null : i))}
                            aria-label={t("s2.queEsto")}
                            aria-expanded={docInfo === i}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                              docInfo === i ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300 text-slate-400 hover:border-aproba-400 hover:text-aproba-600"
                            }`}
                          >
                            i
                          </button>
                        )}
                      </div>
                      {st === "pending" && (
                        <button onClick={() => upload(i)} className="shrink-0 rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">{t("s2.subir")}</button>
                      )}
                      {st === "analyzing" && <span className="shrink-0 text-xs font-semibold tabular-nums text-aproba-600">{Math.round(prog[i] ?? 0)}%</span>}
                      {st === "validado" && <span className="shrink-0 text-xs font-semibold text-aproba-700">{t("s2.validado")}</span>}
                      {(st === "validado" || st === "alerta") && (
                        <button type="button" onClick={() => quitarDoc(i)} aria-label={t("s2.eliminar")} title={t("s2.eliminar")} className="shrink-0 rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg>
                        </button>
                      )}
                    </div>

                    {docInfo === i && ayuda && (
                      <p className="mt-3 rounded-lg bg-cream-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{ayuda}</p>
                    )}

                    {st === "analyzing" && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-aproba-500 transition-[width] duration-200 ease-out" style={{ width: `${prog[i] ?? 0}%` }} />
                      </div>
                    )}

                    {st === "validado" && (camposReales[i] ?? EXTRACTED[label]) && (
                      <div className="mt-3 rounded-lg bg-cream-50 px-3 py-2">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {(camposReales[i] ?? EXTRACTED[label]).map(([k, v]) => (
                            <span key={k} className="text-[11px]"><span className="text-slate-400">{k}: </span><span className="font-mono text-slate-700">{v}</span></span>
                          ))}
                        </div>
                        {alertasReales[i]?.length ? (
                          <p className="mt-1.5 text-[11px] text-amber-700">⚠ {alertasReales[i].join(" · ")}</p>
                        ) : null}
                      </div>
                    )}

                    {st === "alerta" && (
                      <div className="mt-3">
                        {(alertasReales[i] ?? [t("s2.borrosa")]).map((a) => (
                          <p key={a} className="mb-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{a}</p>
                        ))}
                        <button onClick={() => upload(i)} className="mt-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50">{t("s2.volverSubir")}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* État du dépôt : encadré jaune dès le début si incomplet (envoyer / continuer
                à téléverser), sinon confirmation verte. Le bouton Retour reste dans les deux cas. */}
            {requiredDocs.length === 0 ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-cream-50 p-3.5">
                <p className="text-sm leading-relaxed text-slate-600">{t("s2.sinDocs")}</p>
                <div className="mt-3 flex gap-3">
                  <button onClick={() => setStep(1)} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
                  <button onClick={proceder} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">{conPago ? t("s2.continuarPago") : t("s2.enviar")}</button>
                </div>
              </div>
            ) : allValidated ? (
              <div className="mt-6 rounded-xl border border-aproba-200 bg-aproba-50 p-3.5">
                <p className="flex items-start gap-2 text-sm font-medium text-aproba-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" /> {t("s2.todosOk")}
                </p>
                <div className="mt-3 flex gap-3">
                  <button onClick={() => setStep(1)} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
                  <button onClick={proceder} className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700">{conPago ? t("s2.continuarPago") : t("s2.enviar")}</button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <p className="text-xs leading-relaxed text-amber-700">{t("s2.faltanDocs")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={proceder} className="rounded-lg bg-aproba-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-aproba-700">{t("s2.continuarIgual")}</button>
                  <button onClick={() => docsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400">{t("s2.seguirSubiendo")}</button>
                  <button onClick={() => setStep(1)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400">{t("common.atras")}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3 · Pago del anticipo ── */}
        {step === PASO_PAGO && tramite && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("s3.titulo")}</h1>
            <p className="mt-2 text-slate-600">{t("s3.intro")}</p>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{t("s3.anticipo", { label: [servicioLabel(tramite.id, tramite.label, lang), ...extrasServicios.map((sv) => servicioLabel(sv.id, sv.label, lang))].join(" + ") })}</span>
                <span className="font-medium text-slate-800">{eur(anticipoBruto)}</span>
              </div>
              {anticipoBruto - anticipo > 0.004 && (
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  {/* La etiqueta solo con PORCENTAJE: con IMPORTE mostraría el total del
                      expediente (−100 €) junto a la parte del anticipo (−30 €) — dos cifras
                      distintas bajo el mismo «Descuento». dir=ltr: en árabe (RTL) el signo
                      − inicial se reordenaría detrás de la cifra. */}
                  <span className="text-slate-500">{t("s3.descuento")}{descuento?.tipo === "PORCENTAJE" && <> <span dir="ltr" className="text-xs text-aproba-700">{etiquetaDescuento(descuento)}</span></>}</span>
                  <span dir="ltr" className="font-medium text-aproba-700">−{eur(r2(anticipoBruto - anticipo))}</span>
                </div>
              )}
              {nMiembros > 1 && (
                <p className="mt-1 text-right text-xs text-slate-400">{t("s3.xMiembros", { precio: eur(r2(anticipoBruto / nMiembros)), n: nMiembros })}</p>
              )}
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-slate-500">{t("s3.iva")}</span>
                <span className="font-medium text-slate-800">{eur(totalDe(anticipo) - anticipo)}</span>
              </div>
              {suplidosExp.map((sup, i) => (
                <div key={i} className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{sup.concepto} <span className="text-xs text-slate-400">({t("s3.sinIva")})</span></span>
                  <span className="font-medium text-slate-800">{eur(sup.importe)}</span>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="font-semibold text-slate-900">{t("s3.totalHoy")}</span>
                <span className="text-lg font-bold text-slate-900">{eur(totalDe(anticipo) + suplidosTotal)}</span>
              </div>
              {resto > 0 && (
                <p className="mt-3 rounded-lg bg-cream-50 px-3 py-2 text-xs text-slate-500">
                  {t("s3.queda", { monto: eur(totalDe(resto)) })}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-cream-50 p-4 text-sm leading-relaxed text-slate-600">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span>{tarjetaActiva ? t("s3.metodos") : t("s3.transferencia")}</span>
            </div>

            {pagoError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pagoError}</p>}

            {tarjetaActiva ? (
              <div className="mt-6 space-y-2.5">
                <button
                  onClick={pagarTarjeta}
                  disabled={pagando}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                  {pagando ? t("s3.procesando") : t("s3.pagarTarjeta", { monto: eur(totalDe(anticipo)) })}
                </button>
                <button
                  onClick={pagar}
                  disabled={pagando}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-aproba-400 hover:text-aproba-700 disabled:opacity-60"
                >
                  {t("s3.pagarTransferencia")}
                </button>
                <button onClick={() => setStep(2)} disabled={pagando} className="w-full px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-600 disabled:opacity-60">{t("common.atras")}</button>
              </div>
            ) : (
              <div className="mt-6 flex gap-3">
                <button onClick={() => setStep(2)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">{t("common.atras")}</button>
                <button
                  onClick={pagar}
                  disabled={pagando}
                  className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
                >
                  {pagando ? t("s3.procesando") : t("s3.confirmar")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4 · Listo ── */}
        {step === PASO_LISTO && (
          <div className="flex flex-col items-center pt-12 text-center">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full ${docsCompletos ? "bg-aproba-600" : "bg-amber-500"}`}>
              {docsCompletos ? (
                <Check className="h-10 w-10 text-white" />
              ) : (
                <svg className="h-10 w-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 1.5" /></svg>
              )}
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">{docsCompletos ? t("s4.titulo") : t("s4.tituloIncompleto")}</h1>
            <p className="mt-3 max-w-xs leading-relaxed text-slate-600">{docsCompletos ? t("s4.intro") : t("s4.introIncompleto")}</p>
            <div className="mt-8 w-full rounded-xl border border-slate-200 bg-white p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("s4.resumen")}</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><span className="shrink-0 text-slate-500">{t("step.tramite")}</span><span className="text-right font-medium text-slate-800">{[...(tramite ? [servicioLabel(tramite.id, tramite.label, lang)] : []), ...extrasServicios.map((sv) => servicioLabel(sv.id, sv.label, lang))].join(" + ")}</span></div>
                {requiredDocs.length > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">{t("s4.documentos")}</span>
                    {allValidated
                      ? <span className="font-medium text-aproba-700">{t("s4.nValidados", { n: requiredDocs.length })}</span>
                      : <span className="font-medium text-amber-600">{t("s4.docsParciales", { n: nValidados, total: requiredDocs.length })}</span>}
                  </div>
                )}
                {facturaNumero && (
                  <div className="flex justify-between gap-3"><span className="shrink-0 text-slate-500">{t("s3.titulo")}</span>
                    {facturaPagada
                      ? <span className="text-right font-medium text-aproba-700">{eur(facturaTotal ?? totalDe(anticipo))} · {t("s4.pagada")} · {facturaNumero}</span>
                      : <span className="text-right font-medium text-amber-600">{eur(facturaTotal ?? totalDe(anticipo))} · {t("s4.pendiente")} · {facturaNumero}</span>}
                  </div>
                )}
                <div className="flex justify-between"><span className="text-slate-500">{t("s4.gestoria")}</span><span className="font-medium text-slate-800">{nombreGestoria}</span></div>
              </div>
            </div>
            {facturaNumero && (
              <p className="mt-4 max-w-xs text-xs text-slate-400">{t("s4.facturaEmail", { numero: facturaNumero })}</p>
            )}
            <p className="mt-6 flex items-center gap-1 text-xs text-slate-400">{t("header.con")} <AprobaMark size={13} /> aproba</p>
          </div>
        )}
      </div>
    </div>
  );
}
