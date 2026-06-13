"use client";

import { useEffect, useRef, useState } from "react";
import { AprobaMark } from "./logo";
import { DEFAULT_SERVICIOS, loadServicios, type Servicio } from "@/lib/servicios";
import { eur, totalDe } from "@/lib/facturas";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, fichaVacia, type ClienteFicha } from "@/lib/ficha";

// Portail client — ce que voit le client du gestor depuis le lien WhatsApp.
// Wizard : trámite → datos → documentos (validación IA) → pago (si anticipo) → enviado.
// Le paiement appelle /api/pagos qui génère la factura automatiquement côté gestor.
// La referencia est figée pour la démo (en prod : dérivée du token /j/[token]).

type DocStatus = "pending" | "analyzing" | "validado" | "alerta";

const REFERENCIA_DEMO = "EXP-2026-0042";

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
}: {
  servicios?: Servicio[];
  referencia?: string; // expediente réel (lien token) — sinon démo
  clienteNombre?: string;
  clienteFicha?: ClienteFicha;
  gestoria?: string;
  token?: string;
}) {
  const [step, setStep] = useState(0);
  const [tramiteId, setTramiteId] = useState<string | null>(null);
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
  const [docs, setDocs] = useState<Record<number, { status: DocStatus; attempts: number }>>({});
  // Services du workspace (config DB, passée par le serveur). Fallback : defaults.
  const [servicios, setServicios] = useState<Servicio[]>(() => (serviciosProp ?? DEFAULT_SERVICIOS).filter((s) => s.active));
  const [pagando, setPagando] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [facturaNumero, setFacturaNumero] = useState<string | null>(null);
  // Mode réel (lien token) : résultats de la validation IA par document.
  const [camposReales, setCamposReales] = useState<Record<number, [string, string][]>>({});
  const [alertasReales, setAlertasReales] = useState<Record<number, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docPendienteRef = useRef<number | null>(null);

  // Sans prop serveur (anciennes routes) : config locale du gestor si présente.
  useEffect(() => {
    if (!serviciosProp) setServicios(loadServicios().filter((s) => s.active));
  }, [serviciosProp]);

  const tramite = servicios.find((t) => t.id === tramiteId);
  const requiredDocs = tramite?.docs ?? [];
  const allValidated = requiredDocs.length > 0 && requiredDocs.every((_, i) => docs[i]?.status === "validado");
  const anticipo = tramite?.anticipo ?? 0;
  const resto = tramite?.resto ?? 0;
  const conPago = anticipo > 0; // le gestor a configuré un paiement à l'onboarding
  const PASO_PAGO = 3;
  const PASO_LISTO = 4;

  const stepLabels = ["Trámite", "Tus datos", "Documentos", ...(conPago ? ["Pago"] : [])];

  function upload(i: number) {
    if (token) {
      // Mode réel : choisir un fichier → /api/portal/documentos (Storage + IA).
      docPendienteRef.current = i;
      fileInputRef.current?.click();
      return;
    }
    // Mode démo : simulation (le 2º documento falla la 1ª vez).
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
    const label = requiredDocs[i];
    setDocs((d) => ({ ...d, [i]: { status: "analyzing", attempts: (d[i]?.attempts ?? 0) + 1 } }));
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("label", label);
      fd.append("file", file);
      const res = await fetch("/api/portal/documentos", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo validar el documento.");
      if (data.estado === "VALIDADO") {
        setCamposReales((m) => ({ ...m, [i]: (data.campos as { label: string; value: string }[]).slice(0, 6).map((c) => [c.label, c.value]) }));
        if (data.alertas?.length) setAlertasReales((m) => ({ ...m, [i]: data.alertas }));
        setDocs((d) => ({ ...d, [i]: { status: "validado", attempts: d[i]?.attempts ?? 1 } }));
      } else {
        setAlertasReales((m) => ({ ...m, [i]: data.alertas?.length ? data.alertas : ["El documento no se lee bien. Vuelve a subirlo."] }));
        setDocs((d) => ({ ...d, [i]: { status: "alerta", attempts: d[i]?.attempts ?? 1 } }));
      }
    } catch (err) {
      setAlertasReales((m) => ({ ...m, [i]: [err instanceof Error ? err.message : "Error al subir. Inténtalo de nuevo."] }));
      setDocs((d) => ({ ...d, [i]: { status: "alerta", attempts: d[i]?.attempts ?? 1 } }));
    } finally {
      docPendienteRef.current = null;
    }
  }

  // Le client confirme son trámite → l'expediente réel se met à jour côté gestor.
  function confirmarTramite() {
    if (token && tramiteId) {
      void fetch("/api/portal/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, clave: tramiteId }),
      }).catch(() => {});
    }
    setStep(1);
  }

  // Paiement de l'anticipo → /api/pagos génère la factura côté gestor.
  async function pagar() {
    setPagando(true);
    setPagoError(null);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referencia: referencia ?? REFERENCIA_DEMO, momento: "ANTICIPO" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo procesar el pago.");
      setFacturaNumero(data.numero);
      setStep(PASO_LISTO);
    } catch (err) {
      setPagoError(err instanceof Error ? err.message : "No se pudo procesar el pago.");
    } finally {
      setPagando(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50">
      {/* Barre supérieure (marque de la gestoría) */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{inicialesGestoria}</span>
            <span className="text-sm font-semibold text-slate-800">{nombreGestoria}</span>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            con <AprobaMark size={13} />
          </span>
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

        {/* ── Step 0 · Trámite ── */}
        {step === 0 && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hola {nombreCliente} 👋</h1>
            <p className="mt-2 text-slate-600">Tu gestoría te ayuda con tu trámite de extranjería. ¿Cuál necesitas?</p>
            <div className="mt-6 space-y-3">
              {servicios.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  Tu gestoría aún no ha configurado los servicios disponibles.
                </p>
              )}
              {servicios.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTramiteId(t.id)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${
                    tramiteId === t.id ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-slate-900">{t.label}</p>
                      <p className="shrink-0 text-sm font-bold text-slate-700">{eur(totalDe(t.anticipo + t.resto))}</p>
                    </div>
                    <p className="text-sm text-slate-500">{t.desc}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {t.anticipo > 0 && t.resto > 0
                        ? `${eur(totalDe(t.anticipo))} al empezar + ${eur(totalDe(t.resto))} al finalizar`
                        : t.anticipo > 0
                          ? "Pago único al empezar"
                          : "Pago al finalizar el trámite"}
                      {" · IVA incluido"}
                    </p>
                  </div>
                  <span className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${tramiteId === t.id ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>
                    {tramiteId === t.id && <Check className="h-3 w-3" />}
                  </span>
                </button>
              ))}
            </div>
            <button
              disabled={!tramiteId}
              onClick={confirmarTramite}
              className="mt-7 w-full rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Continuar
            </button>
          </div>
        )}

        {/* ── Step 1 · Datos ── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tus datos</h1>
            <p className="mt-2 text-slate-600">Con estos datos preparamos tus formularios oficiales. Rellénalos una sola vez.</p>
            <div className="mt-6 space-y-5">
              {GRUPOS.map((grupo) => (
                <div key={grupo}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{grupo}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {FICHA_CAMPOS.filter((f) => f.grupo === grupo).map((f) => (
                      <div key={f.k} className={f.w === "full" ? "sm:col-span-2" : ""}>
                        <label className="text-[13px] font-medium text-slate-600">{f.label}</label>
                        {f.tipo === "sexo" || f.tipo === "estadoCivil" ? (
                          <select
                            value={ficha[f.k] ?? ""}
                            onChange={(e) => setFicha((d) => ({ ...d, [f.k]: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                          >
                            {(f.tipo === "sexo" ? SEXOS : ESTADOS_CIVILES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        ) : (
                          <input
                            type={f.tipo === "date" ? "date" : "text"}
                            value={ficha[f.k] ?? ""}
                            onChange={(e) => setFicha((d) => ({ ...d, [f.k]: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 flex gap-3">
              <button onClick={() => setStep(0)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Atrás</button>
              <button
                disabled={guardandoDatos}
                onClick={async () => {
                  if (token) { setGuardandoDatos(true); await fetch("/api/portal/datos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ficha }) }).catch(() => {}); setGuardandoDatos(false); }
                  setStep(2);
                }}
                className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
              >
                {guardandoDatos ? "Guardando…" : "Continuar"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 · Documentos ── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tus documentos</h1>
            <p className="mt-2 text-slate-600">Haz una foto o sube cada documento. La IA comprueba al instante que sea legible y esté vigente.</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onArchivo} />

            <div className="mt-6 space-y-3">
              {requiredDocs.map((label, i) => {
                const st = docs[i]?.status ?? "pending";
                return (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${st === "validado" ? "bg-aproba-100 text-aproba-600" : st === "alerta" ? "bg-amber-100 text-amber-600" : "bg-cream-50 text-slate-400"}`}>
                          {st === "validado" ? <Check className="h-4 w-4" /> : st === "alerta" ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                          )}
                        </span>
                        <span className="text-sm font-medium text-slate-800">{label}</span>
                      </div>
                      {st === "pending" && (
                        <button onClick={() => upload(i)} className="rounded-lg bg-aproba-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aproba-700">Subir</button>
                      )}
                      {st === "analyzing" && <span className="text-xs font-medium text-amber-600">Analizando…</span>}
                      {st === "validado" && <span className="text-xs font-semibold text-aproba-700">Validado</span>}
                    </div>

                    {st === "analyzing" && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full w-2/3 animate-pulse rounded-full bg-aproba-500" />
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
                        {(alertasReales[i] ?? ["La foto está borrosa y no se lee bien. Vuelve a hacerla con buena luz."]).map((a) => (
                          <p key={a} className="mb-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{a}</p>
                        ))}
                        <button onClick={() => upload(i)} className="mt-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50">Volver a subir</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex gap-3">
              <button onClick={() => setStep(1)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Atrás</button>
              <button
                disabled={!allValidated}
                onClick={() => setStep(conPago ? PASO_PAGO : PASO_LISTO)}
                className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {allValidated ? (conPago ? "Continuar al pago" : "Enviar a mi gestoría") : "Sube todos los documentos"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 · Pago del anticipo ── */}
        {step === PASO_PAGO && tramite && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pago inicial</h1>
            <p className="mt-2 text-slate-600">Para iniciar tu trámite, tu gestoría solicita un pago al empezar. Recibirás la factura al instante.</p>

            {/* Résumé du paiement */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{tramite.label} — anticipo</span>
                <span className="font-medium text-slate-800">{eur(anticipo)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-slate-500">IVA (21 %)</span>
                <span className="font-medium text-slate-800">{eur(totalDe(anticipo) - anticipo)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="font-semibold text-slate-900">Total a pagar hoy</span>
                <span className="text-lg font-bold text-slate-900">{eur(totalDe(anticipo))}</span>
              </div>
              {resto > 0 && (
                <p className="mt-3 rounded-lg bg-cream-50 px-3 py-2 text-xs text-slate-500">
                  Quedará un pago de <span className="font-semibold text-slate-700">{eur(totalDe(resto))}</span> al finalizar el trámite. Te avisaremos.
                </p>
              )}
            </div>

            {/* Carte (démo) */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Tarjeta</p>
              <div className="space-y-3">
                <input defaultValue="4242 4242 4242 4242" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
                <div className="flex gap-3">
                  <input defaultValue="12/28" className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
                  <input defaultValue="123" className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-aproba-600 focus:ring-2 focus:ring-aproba-100" />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Pago seguro · demo
              </p>
            </div>

            {pagoError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pagoError}</p>}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(2)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Atrás</button>
              <button
                onClick={pagar}
                disabled={pagando}
                className="flex-1 rounded-lg bg-aproba-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-aproba-700 disabled:bg-slate-300"
              >
                {pagando ? "Procesando…" : `Pagar ${eur(totalDe(anticipo))}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4 · Listo ── */}
        {step === PASO_LISTO && (
          <div className="flex flex-col items-center pt-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-aproba-600">
              <Check className="h-10 w-10 text-white" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">¡Todo enviado!</h1>
            <p className="mt-3 max-w-xs leading-relaxed text-slate-600">
              Tu gestoría ya tiene tus datos y documentos validados. Se encarga del resto y te avisará en cada paso.
            </p>
            <div className="mt-8 w-full rounded-xl border border-slate-200 bg-white p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Trámite</span><span className="font-medium text-slate-800">{tramite?.label}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Documentos</span><span className="font-medium text-aproba-700">{requiredDocs.length} validados ✓</span></div>
                {facturaNumero && (
                  <div className="flex justify-between"><span className="text-slate-500">Pago inicial</span><span className="font-medium text-aproba-700">{eur(totalDe(anticipo))} ✓ · Factura {facturaNumero}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-500">Gestoría</span><span className="font-medium text-slate-800">{nombreGestoria}</span></div>
              </div>
            </div>
            {facturaNumero && (
              <p className="mt-4 max-w-xs text-xs text-slate-400">Hemos enviado la factura {facturaNumero} a tu email. El pago final se solicitará al terminar el trámite.</p>
            )}
            <p className="mt-6 flex items-center gap-1 text-xs text-slate-400">con <AprobaMark size={13} /> aproba</p>
          </div>
        )}
      </div>
    </div>
  );
}
