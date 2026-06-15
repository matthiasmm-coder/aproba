"use client";

import { useEffect, useState } from "react";

// Animation synchronisée : à gauche ce que vit le client (téléphone),
// à droite ce que voit le gestor (dashboard). Un seul `step` pilote les deux.
// 0 WhatsApp · 1 datos del cliente · 2 trámite · 3-6 documents un par un · 7 todo listo.

const STEPS = 8;
// Durée d'affichage (ms) par étape. L'étape « datos » est plus longue : la cliente
// remplit ses champs un à un. WhatsApp et « listo » respirent un peu plus aussi.
const DURATIONS = [2200, 2800, 2400, 1500, 1500, 1500, 1500, 2400];

const CAPTIONS = [
  "Le envías un enlace por WhatsApp. Sin apps que instalar, sin explicaciones.",
  "Tu cliente rellena sus propios datos. Tú no tecleas nada.",
  "Elige su trámite en dos toques — en su propio idioma (5 idiomas).",
  "Sube sus documentos desde el móvil, uno tras otro.",
  "La IA los lee y valida al instante, según los suben.",
  "Detecta borrosos o caducados antes de que lleguen a ti.",
  "Todo validado, sin que tú toques nada.",
  "Formularios y factura, generados solos. Tú solo presentas.",
];

const TRAMITES = [
  { label: "Arraigo social", total: "350 €", pago: "150 € al firmar + 200 € al final" },
  { label: "Renovación TIE", total: "180 €", pago: "80 € al firmar + 100 € al final" },
  { label: "Reagrupación", total: "420 €", pago: "200 € al firmar + 220 € al final" },
  { label: "Nacionalidad", total: "600 €", pago: "300 € al firmar + 300 € al final" },
];
const DOCS = ["Pasaporte", "Empadronamiento", "Contrato de trabajo", "Antecedentes penales"];
const FILES = ["pasaporte.jpg", "empadronamiento.jpg", "contrato.pdf", "antecedentes.pdf"];
const DATOS = [
  { label: "Nombre", value: "Julia" },
  { label: "Apellidos", value: "Mendoza Restrepo" },
  { label: "Nacionalidad", value: "Colombia" },
  { label: "Nº de pasaporte", value: "AY0429317" },
];

const ACTIVIDAD = [
  "Enlace enviado a Julia M.",
  "Completó sus datos personales",
  "Eligió: Arraigo social",
  "Subió: Pasaporte",
  "Subió: Empadronamiento",
  "Subió: Contrato de trabajo",
  "Subió: Antecedentes penales",
  "IA validó 4/4 · EX-10 + 790-012 listos",
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function StatusBadge({ step }: { step: number }) {
  const map = [
    { t: "Enlace enviado", c: "bg-slate-100 text-slate-500" },
    { t: "Datos recibidos", c: "bg-blue-100 text-blue-700" },
    { t: "Trámite elegido", c: "bg-amber-100 text-amber-700" },
    { t: "Recibiendo docs", c: "bg-amber-100 text-amber-700" },
    { t: "Recibiendo docs", c: "bg-amber-100 text-amber-700" },
    { t: "Recibiendo docs", c: "bg-amber-100 text-amber-700" },
    { t: "Recibiendo docs", c: "bg-amber-100 text-amber-700" },
    { t: "Listo para presentar", c: "bg-blue-100 text-blue-700" },
  ];
  const s = map[step] ?? map[0];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.c}`}>{s.t}</span>;
}

// ─────────────────────── Téléphone (côté client) ───────────────────────

function Phone({ step }: { step: number }) {
  const cur = Math.max(0, Math.min(step - 3, DOCS.length - 1)); // doc en cours de subida (steps 3-6)
  return (
    <div className="relative mx-auto w-[260px]">
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2.3rem] border-[7px] border-slate-900 bg-white shadow-2xl">
        <div className="relative z-20 flex h-6 items-center justify-center bg-white">
          <div className="h-3.5 w-16 rounded-full bg-slate-900" />
        </div>

        <div className="relative h-[calc(100%-1.5rem)]">
          {/* 0 · WhatsApp */}
          <Screen active={step === 0}>
            <div className="flex h-9 items-center gap-2 bg-[#075E54] px-3 text-white">
              <div className="h-6 w-6 rounded-full bg-white/20" />
              <span className="text-[13px] font-medium">Gestoría Vallès</span>
            </div>
            <div className="space-y-2 bg-[#ECE5DD] p-3" style={{ minHeight: "100%" }}>
              <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white p-2.5 text-[12px] text-slate-700 shadow-sm">
                Hola Julia 👋 Para tu trámite, sube tus documentos desde aquí:
                <div className="mt-2 rounded-md border border-aproba-200 bg-aproba-50 p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-aproba-600">
                      <span className="text-[11px] font-bold text-white">a</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-aproba-700">Tu expediente · Aproba</p>
                      <p className="truncate text-[10px] text-slate-400">aproba.app/j/x7k2</p>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-right text-[9px] text-slate-400">10:24 ✓✓</p>
              </div>
              <TapPulse />
            </div>
          </Screen>

          {/* 1 · Datos personales — la cliente rellena sus campos uno a uno */}
          <Screen active={step === 1}>
            <PhoneHeader title="Tus datos" />
            <DatosForm active={step === 1} />
          </Screen>

          {/* 2 · Selección de servicio — la cliente pulsa su trámite (precio + pago por servicio) */}
          <Screen active={step === 2}>
            <PhoneHeader title="¿Qué trámite necesitas?" />
            <TramiteSelector active={step === 2} />
          </Screen>

          {/* 3-6 · Documentos qui se chargent un par un */}
          <Screen active={step >= 3 && step <= 6}>
            <PhoneHeader title="Arraigo social" />
            <div className="p-3">
              <p className="mb-2 text-[11px] text-slate-400">Sube estos documentos:</p>
              <div className="space-y-1.5">
                {DOCS.map((d, i) => {
                  const validado = i < cur;
                  const subiendo = i === cur;
                  return (
                    <div key={d} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors duration-300 ${validado ? "border-aproba-200 bg-aproba-50/40" : subiendo ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}>
                      <span className="flex items-center gap-1.5 text-slate-700">
                        {validado && (
                          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-aproba-100 text-aproba-600"><Check className="h-2.5 w-2.5" /></span>
                        )}
                        {d}
                      </span>
                      {validado ? <span className="text-[10px] font-semibold text-aproba-700">Validado</span> : subiendo ? <span className="text-[10px] font-semibold text-amber-600">Subiendo…</span> : <span className="text-slate-300">+</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-lg bg-cream-50 p-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="h-7 w-7 rounded bg-slate-200" />
                  {FILES[cur]}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-aproba-500" />
                </div>
                <p className="mt-1.5 text-[10px] text-aproba-700">Analizando con IA…</p>
              </div>
            </div>
          </Screen>

          {/* 7 · Listo */}
          <Screen active={step === 7}>
            <PhoneHeader title="Arraigo social" />
            <div className="flex flex-col items-center px-5 pt-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-aproba-600">
                <Check className="h-8 w-8 text-white" />
              </div>
              <p className="mt-4 text-[15px] font-bold text-slate-900">¡Todo enviado!</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Tu gestoría se encarga del resto. Te avisamos en cada paso.</p>
            </div>
          </Screen>
        </div>
      </div>
    </div>
  );
}

function Screen({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-white transition-all duration-500 ${active ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-3"}`}>
      {children}
    </div>
  );
}

function PhoneHeader({ title }: { title: string }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-slate-100 px-3 pt-1">
      <span className="text-[10px] font-bold text-aproba-600">aproba</span>
      <span className="text-[12px] font-medium text-slate-700">· {title}</span>
    </div>
  );
}

// Formulaire qui se remplit tout seul, champ par champ, en mode saisie.
function DatosForm({ active }: { active: boolean }) {
  const [prog, setProg] = useState({ field: 0, chars: 0 });

  useEffect(() => {
    if (!active) {
      setProg({ field: 0, chars: 0 });
      return;
    }
    setProg({ field: 0, chars: 0 });
    let field = 0;
    let chars = 0;
    let pause = 0;
    const id = window.setInterval(() => {
      if (field >= DATOS.length) return; // terminé
      if (pause > 0) {
        pause -= 1;
        return;
      }
      const len = DATOS[field].value.length;
      if (chars < len) {
        chars += 1;
        setProg({ field, chars });
      } else {
        field += 1;
        chars = 0;
        pause = 5; // petite pause entre deux champs
        setProg({ field, chars: 0 });
      }
    }, 42);
    return () => window.clearInterval(id);
  }, [active]);

  const completo = prog.field >= DATOS.length;

  return (
    <div className="space-y-2 p-3">
      <p className="text-[11px] text-slate-400">Completa tu información:</p>
      {DATOS.map((f, i) => {
        const done = i < prog.field;
        const typing = i === prog.field;
        const shown = done ? f.value : typing ? f.value.slice(0, prog.chars) : "";
        return (
          <div key={f.label}>
            <p className="mb-0.5 text-[9px] font-medium text-slate-400">{f.label}</p>
            <div className={`flex h-[26px] items-center gap-1 rounded-md border bg-white px-2 text-[11px] text-slate-700 transition-colors duration-200 ${typing ? "border-aproba-400 ring-2 ring-aproba-100" : "border-slate-200"}`}>
              <span className="truncate">{shown}</span>
              {typing && <span className="h-3.5 w-px animate-pulse bg-aproba-600" />}
              {done && <span className="ml-auto flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-aproba-600"><Check className="h-2.5 w-2.5" /></span>}
            </div>
          </div>
        );
      })}
      <div className={`mt-1 rounded-lg py-2 text-center text-[12px] font-semibold text-white transition-colors duration-300 ${completo ? "bg-aproba-600" : "bg-aproba-300"}`}>Continuar</div>
    </div>
  );
}

function TapPulse() {
  return (
    <div className="relative ml-6 mt-1 h-8 w-8">
      <span className="absolute inset-0 animate-ping rounded-full bg-aproba-400/40" />
      <span className="absolute inset-1.5 rounded-full bg-aproba-500/70" />
    </div>
  );
}

// Sélection du trámite : la cliente "toque" son service ; chaque carte affiche
// son prix total et ses conditions de paiement (anticipo + resto).
function TramiteSelector({ active }: { active: boolean }) {
  const [picked, setPicked] = useState(false);
  const [tapping, setTapping] = useState(false);

  useEffect(() => {
    if (!active) {
      setPicked(false);
      setTapping(false);
      return;
    }
    setPicked(false);
    setTapping(false);
    const t1 = window.setTimeout(() => setTapping(true), 650);
    const t2 = window.setTimeout(() => {
      setPicked(true);
      setTapping(false);
    }, 1050);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);

  return (
    <div className="space-y-2 p-3">
      {/* Sélecteur de langue (liste déroulante) — fidèle au portail réel */}
      <div className="mb-1.5">
        <p className="mb-1 text-[9px] font-medium text-slate-400">Elige tu idioma</p>
        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
          <span>🇪🇸 Español</span>
          <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </div>
      {TRAMITES.map((t, i) => {
        const selected = picked && i === 0;
        return (
          <div
            key={t.label}
            className={`relative rounded-xl border p-2.5 transition-all duration-300 ${selected ? "scale-[1.02] border-aproba-600 bg-aproba-50 shadow-sm ring-2 ring-aproba-100" : "border-slate-200 bg-white"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${selected ? "bg-aproba-600 text-white" : "bg-slate-200"}`}>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className={`truncate text-[12px] font-semibold ${selected ? "text-aproba-700" : "text-slate-800"}`}>{t.label}</span>
              </div>
              <span className={`shrink-0 text-[12px] font-bold ${selected ? "text-aproba-700" : "text-slate-700"}`}>{t.total}</span>
            </div>
            <p className="mt-1 text-[9px] text-slate-500">{t.pago}</p>

            {/* le doigt de la cliente toque le 1er service */}
            {i === 0 && tapping && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="relative flex h-10 w-10">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aproba-400/40" />
                  <span className="relative inline-flex h-10 w-10 rounded-full bg-aproba-500/50" />
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────── Dashboard (côté gestor) ───────────────────────

function Dashboard({ step }: { step: number }) {
  const docValidated = (i: number) => i < step - 3; // cascade : un doc validé par étape
  const subtitle = step >= 2 ? "Arraigo social · Colombia" : step >= 1 ? "Colombia · 34 años" : "Esperando sus datos…";
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-aproba-500" />
        <span className="ml-3 text-xs text-slate-400">app.aproba-software.com</span>
      </div>

      <div className="p-5">
        <div className={`rounded-xl border bg-white p-4 transition-all duration-500 ${step >= 1 ? "border-aproba-300 opacity-100" : "border-slate-200 opacity-40"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[11px] text-slate-400">EXP-2026-0042</p>
              <p className="font-semibold text-slate-900">Julia Mendoza</p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
            <StatusBadge step={step} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {DOCS.map((d, i) => {
              const ok = docValidated(i);
              return (
                <div key={d} className="flex items-center gap-1.5 rounded-md border border-slate-100 px-2 py-1 text-[11px] transition-all duration-500" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-500 ${ok ? "bg-aproba-100 text-aproba-600" : "bg-slate-100 text-slate-300"}`}>
                    {ok ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
                  </span>
                  <span className={ok ? "text-slate-700" : "text-slate-400"}>{d}</span>
                </div>
              );
            })}
          </div>

          <div className={`mt-3 overflow-hidden transition-all duration-500 ${step >= 7 ? "max-h-24 opacity-100" : "max-h-0 opacity-0"}`}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Generado automáticamente</p>
            <div className="flex flex-wrap gap-1.5">
              {["EX-10", "790-012"].map((f) => (
                <span key={f} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                  <Check className="h-3 w-3 text-aproba-600" /> {f}
                </span>
              ))}
              <span className="rounded-md bg-aproba-50 px-2 py-0.5 text-[11px] font-medium text-aproba-700">Factura 350 €</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actividad</p>
          <ol className="space-y-1.5">
            {ACTIVIDAD.map((a, i) => (
              <li key={a} className={`flex items-center gap-2 text-[11px] transition-all duration-500 ${step >= i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-aproba-500" />
                <span className="text-slate-600">{a}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Section complète ───────────────────────

export function HowItWorks() {
  const [step, setStep] = useState(0);

  // L'animation tourne en continu — ne s'arrête jamais (même au survol).
  // Un timeout ré-armé à chaque étape, avec une durée propre à l'étape.
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS), DURATIONS[step]);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <section id="como-funciona" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <span className="text-sm font-semibold text-aproba-700">Cómo funciona</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tightest text-slate-900">Tu cliente sube. Tú ya lo tienes validado.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Un enlace por WhatsApp de un lado, tu expediente listo del otro. En tiempo real.</p>
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ve tu cliente</p>
            <Phone step={step} />
          </div>
          <div className="order-1 lg:order-2">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ves tú</p>
            <Dashboard step={step} />
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl text-center">
          <p className="min-h-[3rem] text-lg font-medium text-slate-700 transition-all duration-300">{CAPTIONS[step]}</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: STEPS }).map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Paso ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${i === step ? "w-8 bg-aproba-600" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
