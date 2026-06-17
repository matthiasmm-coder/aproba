"use client";

import { useEffect, useState } from "react";

// Animation synchronisée : à gauche ce que vit le client (téléphone),
// à droite ce que voit le gestor (dashboard). Un seul `step` pilote les deux.
// Les écrans reproduisent fidèlement le vrai portail (client-portal.tsx) et le
// vrai détail expediente (app/app/expedientes/[id]/page.tsx).
// 0 WhatsApp · 1 idioma+trámite · 2 datos · 3-6 documents un par un · 7 todo listo.

const STEPS = 8;
// Durée d'affichage (ms) par étape. L'étape « datos » est plus longue : la cliente
// remplit ses champs un à un. WhatsApp et « listo » respirent un peu plus aussi.
const DURATIONS = [2200, 3000, 2800, 1600, 1600, 1600, 1600, 2600];

const CAPTIONS = [
  "Le envías un enlace por WhatsApp. Sin apps que instalar, sin explicaciones.",
  "Elige su idioma y su trámite — precio y pago claros desde el primer toque.",
  "Tu cliente rellena sus propios datos, una sola vez. Tú no tecleas nada.",
  "Sube sus documentos desde el móvil, uno tras otro.",
  "La IA los lee y valida al instante, extrayendo los datos según los suben.",
  "Detecta borrosos o caducados antes de que lleguen a ti.",
  "Todo validado, sin que tú toques nada.",
  "Formularios EX-10 y 790-012 + factura, generados solos. Tú solo presentas.",
];

// Trámites = vrais services actifs de DEFAULT_SERVICIOS (lib/servicios.ts), prix réels.
// Total = anticipo + resto. Affiché via eur(totalDe(...)) → "350,00 € · IVA incluido".
const TRAMITES = [
  { id: "arraigo_social", label: "Arraigo social", desc: "Residencia por arraigo", total: "350,00 €", split: "150,00 € al empezar + 200,00 € al finalizar" },
  { id: "renovacion_tie", label: "Renovación de TIE", desc: "Renovar tu tarjeta de residencia", total: "180,00 €", split: "80,00 € al empezar + 100,00 € al finalizar" },
  { id: "reagrupacion", label: "Reagrupación familiar", desc: "Traer a tu familia", total: "420,00 €", split: "200,00 € al empezar + 220,00 € al finalizar" },
  { id: "nacionalidad", label: "Nacionalidad española", desc: "Solicitar la nacionalidad", total: "600,00 €", split: "300,00 € al empezar + 300,00 € al finalizar" },
];

// Documents requis pour Arraigo social (DEFAULT_SERVICIOS) + chips de datos extraídos
// (mêmes valeurs que EXTRACTED dans client-portal.tsx / extraction IA du détail expediente).
const DOCS: { label: string; campos: [string, string][] }[] = [
  { label: "Pasaporte", campos: [["Nombre", "Julia Mendoza"], ["Nº", "AV284917"], ["Caducidad", "22/08/2029"]] },
  { label: "Certificado de empadronamiento", campos: [["Dirección", "C/ Sepúlveda 112"], ["Municipio", "Barcelona"]] },
  { label: "Contrato de trabajo", campos: [["Empleador", "Bonavista SL"], ["Puesto", "Ayud. cocina"]] },
  { label: "Antecedentes penales", campos: [["Resultado", "Sin antecedentes"], ["País", "Colombia"]] },
];
const FILES = ["pasaporte.jpg", "empadronamiento.jpg", "contrato.pdf", "antecedentes.pdf"];

// Formulaire datos : groupe Identidad du vrai portail, avec NOM UNIQUE « Apellidos ».
const DATOS = [
  { label: "Nombre", value: "Julia" },
  { label: "Apellidos", value: "Mendoza Restrepo" },
  { label: "Nacionalidad", value: "Colombia" },
  { label: "NIE / Pasaporte", value: "AV284917" },
];

const HISTORIAL = [
  "Enlace enviado a Julia M.",
  "Eligió: Arraigo social · Colombia",
  "Completó su ficha de datos",
  "Subió: Pasaporte",
  "Subió: Certificado de empadronamiento",
  "Subió: Contrato de trabajo",
  "Subió: Antecedentes penales",
  "IA validó 4/4 · EX-10 + 790-012 listos",
];

// ESTADO_META (lib/types.ts) — réutilisé tel quel pour le badge d'état du dashboard.
const ESTADO_META = {
  BORRADOR: { label: "Borrador", pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  DOCS_PENDIENTES: { label: "Docs pendientes", pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  DOCS_VALIDADOS: { label: "Docs validados", pill: "bg-aproba-100 text-aproba-700", dot: "bg-aproba-500" },
  FORM_GENERADO: { label: "Formularios listos", pill: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
} as const;

// État de l'expediente côté gestor, étape par étape (suit le workflow réel).
const ESTADO_POR_STEP: (keyof typeof ESTADO_META)[] = [
  "BORRADOR", "BORRADOR", "DOCS_PENDIENTES", "DOCS_PENDIENTES",
  "DOCS_PENDIENTES", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO",
];

function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function DocIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
    </svg>
  );
}

// ─────────────────────── Téléphone (côté client) ───────────────────────

function Phone({ step }: { step: number }) {
  const cur = Math.max(0, Math.min(step - 3, DOCS.length - 1)); // doc en cours de subida (steps 3-6)
  return (
    <div className="relative mx-auto w-[260px]">
      <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2.3rem] border-[7px] border-slate-900 bg-cream-50 shadow-2xl">
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
                Hola Julia 👋 Para tu trámite, abre tu expediente seguro aquí:
                <div className="mt-2 rounded-md border border-aproba-200 bg-aproba-50 p-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-aproba-600 text-[13px] font-extrabold text-white">α</span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-aproba-700">Tu expediente · Gestoría Vallès</p>
                      <p className="truncate text-[10px] text-slate-400">aproba.app/j/x7k2</p>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-right text-[9px] text-slate-400">10:24 ✓✓</p>
              </div>
              <TapPulse />
            </div>
          </Screen>

          {/* 1 · Idioma + selección de trámite (Step 0 du vrai portail) */}
          <Screen active={step === 1}>
            <PortalHeader />
            <PortalStepper current={0} />
            <TramiteSelector active={step === 1} />
          </Screen>

          {/* 2 · Datos — la cliente rellena su ficha campo a campo (Step 1 du vrai portail) */}
          <Screen active={step === 2}>
            <PortalHeader />
            <PortalStepper current={1} />
            <DatosForm active={step === 2} />
          </Screen>

          {/* 3-6 · Documentos (Step 2 du vrai portail) — un par un, icône "i" + estados + chips IA */}
          <Screen active={step >= 3 && step <= 6}>
            <PortalHeader />
            <PortalStepper current={2} />
            <Documentos cur={cur} />
          </Screen>

          {/* 7 · ¡Todo enviado! (Step 4 du vrai portail) */}
          <Screen active={step === 7}>
            <PortalHeader />
            <div className="flex flex-col items-center px-5 pt-9 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-aproba-600">
                <Check className="h-8 w-8 text-white" />
              </div>
              <p className="mt-4 text-[16px] font-bold tracking-tight text-slate-900">¡Todo enviado!</p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">Tu gestoría ya tiene tus datos y documentos validados. Se encarga del resto.</p>
              <div className="mt-5 w-full rounded-xl border border-slate-200 bg-white p-3 text-left">
                <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">Resumen</p>
                <div className="mt-1.5 space-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-500">Trámite</span><span className="font-medium text-slate-800">Arraigo social</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Documentos</span><span className="font-medium text-aproba-700">4 validados ✓</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Gestoría</span><span className="font-medium text-slate-800">Gestoría Vallès</span></div>
                </div>
              </div>
            </div>
          </Screen>
        </div>
      </div>
    </div>
  );
}

function Screen({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-cream-50 transition-all duration-500 ${active ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-3"}`}>
      {children}
    </div>
  );
}

// En-tête du portail réel : "{iniciales gestoría} · {gestoría} · con α".
function PortalHeader() {
  return (
    <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-white/90 px-3">
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-900 text-[8px] font-bold text-white">GV</span>
        <span className="text-[11px] font-semibold text-slate-800">Gestoría Vallès</span>
      </div>
      <span className="flex items-center gap-1 text-[8px] text-slate-400">con <span className="flex h-3 w-3 items-center justify-center rounded-[3px] bg-aproba-600 text-[7px] font-extrabold text-white">α</span></span>
    </div>
  );
}

// Stepper du vrai portail : barres + libellés Trámite / Tus datos / Documentos / Pago.
function PortalStepper({ current }: { current: number }) {
  const labels = ["Trámite", "Tus datos", "Documentos", "Pago"];
  return (
    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={`h-1 rounded-full transition-colors duration-300 ${i <= current ? "bg-aproba-600" : "bg-slate-200"}`} />
          <p className={`mt-1 text-[7.5px] font-medium ${i <= current ? "text-aproba-700" : "text-slate-400"}`}>{l}</p>
        </div>
      ))}
    </div>
  );
}

// Formulaire datos qui se remplit tout seul, champ par champ, en mode saisie.
// Groupe « Identidad » du vrai portail, avec NOM UNIQUE « Apellidos » (+ hint).
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

  return (
    <div className="px-3 pb-3 pt-1">
      <h1 className="text-[14px] font-bold tracking-tight text-slate-900">Tus datos</h1>
      <p className="mt-0.5 text-[9px] text-slate-500">Con estos datos preparamos tus formularios oficiales.</p>
      <p className="mb-1.5 mt-2.5 text-[7.5px] font-semibold uppercase tracking-wide text-slate-400">Identidad</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DATOS.map((f, i) => {
          const done = i < prog.field;
          const typing = i === prog.field;
          const shown = done ? f.value : typing ? f.value.slice(0, prog.chars) : "";
          const ancho = f.label === "Apellidos" || f.label === "NIE / Pasaporte" ? "col-span-2" : "";
          return (
            <div key={f.label} className={ancho}>
              <p className="mb-0.5 text-[8px] font-medium text-slate-600">{f.label}<span className="text-red-500"> *</span></p>
              <div className={`flex h-[24px] items-center gap-1 rounded-md border bg-white px-2 text-[10px] text-slate-800 transition-colors duration-200 ${typing ? "border-aproba-600 ring-2 ring-aproba-100" : done ? "border-slate-300" : "border-amber-300 bg-amber-50/40"}`}>
                <span className="truncate">{shown}</span>
                {typing && <span className="h-3 w-px animate-pulse bg-aproba-600" />}
              </div>
              {f.label === "Apellidos" && <p className="mt-0.5 text-[7px] text-slate-400">Si tienes dos apellidos, sepáralos por un espacio.</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-semibold text-slate-700">Atrás</span>
        <span className="flex-1 rounded-lg bg-aproba-600 py-1.5 text-center text-[10px] font-semibold text-white">Continuar</span>
      </div>
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

// Step 0 du vrai portail : sélecteur de langue (liste déroulante) + cartes de trámite.
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
    const t1 = window.setTimeout(() => setTapping(true), 800);
    const t2 = window.setTimeout(() => {
      setPicked(true);
      setTapping(false);
    }, 1250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Sélecteur de langue — liste déroulante "Elige tu idioma" (fidèle au portail réel) */}
      <p className="mb-1 text-[8px] font-medium text-slate-500">Elige tu idioma</p>
      <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[11px] text-slate-800">
        <span>🇪🇸 Español</span>
        <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </div>

      <h1 className="mt-3 text-[14px] font-bold tracking-tight text-slate-900">Hola Julia 👋</h1>
      <p className="mt-0.5 text-[9px] text-slate-500">Tu gestoría te ayuda con tu trámite. ¿Cuál necesitas?</p>

      <div className="mt-2 space-y-1.5">
        {TRAMITES.map((t, i) => {
          const selected = picked && i === 0;
          return (
            <div
              key={t.id}
              className={`relative flex items-center justify-between rounded-xl border-2 p-2 transition-all duration-300 ${selected ? "border-aproba-600 bg-aproba-50" : "border-slate-200 bg-white"}`}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-[11px] font-semibold text-slate-900">{t.label}</p>
                  <p className="shrink-0 text-[10px] font-bold text-slate-700">{t.total}</p>
                </div>
                <p className="truncate text-[8px] text-slate-500">{t.desc}</p>
                <p className="mt-0.5 truncate text-[7.5px] text-slate-400">{t.split} · IVA incluido</p>
              </div>
              <span className={`ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300"}`}>
                {selected && <Check className="h-2.5 w-2.5" />}
              </span>

              {/* le doigt de la cliente toque le 1er service */}
              {i === 0 && tapping && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="relative flex h-9 w-9">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aproba-400/40" />
                    <span className="relative inline-flex h-9 w-9 rounded-full bg-aproba-500/50" />
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className={`mt-2.5 rounded-lg py-1.5 text-center text-[10px] font-semibold text-white transition-colors duration-300 ${picked ? "bg-aproba-600" : "bg-slate-200 text-slate-400"}`}>Continuar</div>
    </div>
  );
}

// Step 2 du vrai portail : cartes de documents (icône "i", estados, chips de datos extraídos).
function Documentos({ cur }: { cur: number }) {
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => {
    // L'infobulle "i" s'ouvre brièvement sur le doc en cours pour montrer l'aide.
    setInfoOpen(false);
    const t = window.setTimeout(() => setInfoOpen(true), 450);
    const t2 = window.setTimeout(() => setInfoOpen(false), 1150);
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
  }, [cur]);

  return (
    <div className="px-3 pb-3 pt-1">
      <h1 className="text-[14px] font-bold tracking-tight text-slate-900">Documentos</h1>
      <p className="mt-0.5 text-[9px] text-slate-500">Sube cada documento. La IA comprueba al instante que sea legible y esté vigente.</p>
      <div className="mt-2 space-y-1.5">
        {DOCS.map((d, i) => {
          const validado = i < cur;
          const analizando = i === cur;
          const esInfo = analizando && infoOpen;
          return (
            <div key={d.label} className="rounded-xl border border-slate-200 bg-white p-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${validado ? "bg-aproba-100 text-aproba-600" : analizando ? "bg-amber-100 text-amber-600" : "bg-cream-50 text-slate-400"}`}>
                    {validado ? <Check className="h-3 w-3" /> : <DocIcon className="h-3 w-3" />}
                  </span>
                  <span className="truncate text-[9px] font-medium text-slate-800">{d.label}</span>
                  {/* Icône info "i" du vrai portail */}
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[7px] font-bold ${esInfo ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300 text-slate-400"}`}>i</span>
                </div>
                {validado ? (
                  <span className="shrink-0 text-[8px] font-semibold text-aproba-700">Validado</span>
                ) : analizando ? (
                  <span className="shrink-0 text-[8px] font-medium text-amber-600">Analizando…</span>
                ) : (
                  <span className="shrink-0 rounded-lg bg-aproba-600 px-2 py-0.5 text-[8px] font-semibold text-white">Subir</span>
                )}
              </div>

              {/* Infobulle "¿Qué es esto?" */}
              {esInfo && (
                <p className="mt-1.5 rounded-md bg-cream-50 px-2 py-1 text-[7.5px] leading-relaxed text-slate-600">
                  Página con tu foto y tus datos. Debe estar vigente y leerse con claridad.
                </p>
              )}

              {/* Barre de progression pendant l'analyse IA */}
              {analizando && !esInfo && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-1.5 text-[8px] text-slate-500">
                    <span className="h-4 w-4 rounded bg-slate-200" />
                    <span className="truncate">{FILES[cur]}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-aproba-500" />
                  </div>
                </div>
              )}

              {/* Chips de datos extraídos par IA (cartes validées) */}
              {validado && (
                <div className="mt-1.5 rounded-md bg-cream-50 px-2 py-1">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {d.campos.map(([k, v]) => (
                      <span key={k} className="text-[7.5px]"><span className="text-slate-400">{k}: </span><span className="font-mono text-slate-700">{v}</span></span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────── Dashboard (côté gestor) ───────────────────────
// Reproduit le vrai détail expediente (app/app/expedientes/[id]/page.tsx).

function Dashboard({ step }: { step: number }) {
  const docValidated = (i: number) => i < step - 3; // cascade : un doc validé par étape
  const estado = ESTADO_META[ESTADO_POR_STEP[step]];
  const formsListos = step >= 7;
  const docsCount = DOCS.length;
  return (
    <div className="h-[600px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-cream-50 shadow-card">
      {/* Barre navigateur */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-aproba-500" />
        <span className="ml-3 font-mono text-[11px] text-slate-400">app.aproba-software.com/app/expedientes/exp-42</span>
      </div>

      <div className="p-4">
        {/* En-tête expediente : referencia mono + nom + badge d'état (ESTADO_META) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[11px] text-slate-400">EXP-2026-0042</p>
              <p className="mt-0.5 text-lg font-bold tracking-tightest text-slate-900">Julia Mendoza</p>
              <p className="text-xs text-slate-500">Arraigo social · Colombia</p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-500 ${estado.pill}`}>{estado.label}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2.5 text-[11px]">
            <span><span className="text-slate-400">Asignado a </span><span className="font-medium text-slate-700">Marc R.</span></span>
            <span><span className="text-slate-400">Creado </span><span className="font-medium text-slate-700">11 jun 2026</span></span>
          </div>
        </div>

        {/* Documentos — cartes avec bouton Descargar + datos extraídos por IA */}
        <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Documentos ({docsCount})</p>
        <div className="space-y-1.5">
          {DOCS.map((d, i) => {
            const ok = docValidated(i);
            return (
              <div key={d.label} className="rounded-xl border border-slate-200 bg-white p-2.5 transition-all duration-500" style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-500 ${ok ? "bg-aproba-100 text-aproba-600" : "bg-cream-50 text-slate-400"}`}>
                      {ok ? <Check className="h-3 w-3" /> : <DocIcon className="h-3 w-3" />}
                    </span>
                    <span className={`truncate text-[11px] font-medium ${ok ? "text-slate-900" : "text-slate-400"}`}>{d.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {ok && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                        <DownloadIcon className="h-2.5 w-2.5" /> Descargar
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold transition-colors duration-500 ${ok ? "bg-aproba-100 text-aproba-700" : "bg-slate-100 text-slate-500"}`}>{ok ? "Validado" : "Pendiente"}</span>
                  </div>
                </div>
                {/* Datos extraídos por IA */}
                {ok && (
                  <div className="mt-2 rounded-lg bg-cream-50 px-2.5 py-1.5">
                    <p className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Datos extraídos por IA</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {d.campos.map(([k, v]) => (
                        <span key={k} className="text-[9px]"><span className="text-slate-400">{k}: </span><span className="font-mono text-slate-700">{v}</span></span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Section "Generado automáticamente" — EX-10, 790-012, Factura (apparaît à l'étape finale) */}
        <div className={`overflow-hidden transition-all duration-500 ${formsListos ? "mt-4 max-h-28 opacity-100" : "mt-0 max-h-0 opacity-0"}`}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Generado automáticamente</p>
          <div className="flex flex-wrap gap-1.5">
            {["EX-10", "790-012"].map((f) => (
              <span key={f} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                <DocIcon className="h-3 w-3 text-aproba-600" /> {f} <span className="text-[9px] text-aproba-700">PDF</span>
              </span>
            ))}
            <span className="flex items-center gap-1 rounded-lg border border-aproba-200 bg-aproba-50 px-2.5 py-1 text-[11px] font-medium text-aproba-700">
              Factura 2026-0048 · 350,00 €
            </span>
          </div>
        </div>

        {/* Historial (timeline du vrai détail expediente) */}
        <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Historial</p>
        <ol className="space-y-1">
          {HISTORIAL.map((a, i) => (
            <li key={a} className={`flex items-center gap-2 text-[10px] transition-all duration-500 ${step >= i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aproba-500" />
              <span className="truncate text-slate-600">{a}</span>
            </li>
          ))}
        </ol>
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

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2">
          <div className="order-2 min-w-0 lg:order-1">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ve tu cliente</p>
            <Phone step={step} />
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ves tú</p>
            <Dashboard step={step} />
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl text-center">
          <p className="flex min-h-[3.75rem] items-center justify-center text-lg font-medium text-slate-700 transition-all duration-300">{CAPTIONS[step]}</p>
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
