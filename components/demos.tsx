"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Animation synchronisée : à gauche ce que vit le client (téléphone),
// à droite ce que voit le gestor (dashboard). Un seul `step` pilote les deux.
// FLUIDITÉ (Matthias, 30/09/2026 : « excellente, la plus fluide possible ») :
//  · un seul chef d'orchestre (HowItWorks) : `step` + `sub`, la sous-phase de chaque document
//    (0 aide « i », 1 analyse IA, 2 validé), pour que le téléphone et le tableau de bord
//    avancent au même instant — plus de « Pendiente » d'un côté et « Validado » de l'autre ;
//  · rien ne « saute » : les cartes gardent leur hauteur (couches superposées qui se fondent) ou
//    s'ouvrent en douceur (grid-template-rows), et seuls transform/opacity bougent ailleurs ;
//  · le retour au début ne se rembobine jamais à la vue : le panneau du gestor se fond, les
//    états reviennent sans transition, puis il réapparaît ;
//  · elle ne tourne qu'à l'écran (commence au début quand on arrive), une courbe douce partout.
// Les écrans reproduisent fidèlement le vrai portail (client-portal.tsx) et le
// vrai détail expediente (app/app/expedientes/[id]/page.tsx) — actualizado 22/08 tras
// la reforma del ciclo: stepper de 4 fases + anillo de completitud, sin píldoras.
// 0 WhatsApp · 1 idioma+trámite · 2 datos · 3-6 documents un par un · 7 todo listo.

const STEPS = 8;
// Durée d'affichage (ms) par étape. L'étape « datos » est plus longue : la cliente
// remplit ses champs un à un. WhatsApp et « listo » respirent un peu plus aussi.
const DURATIONS = [2400, 3200, 2900, 2000, 2000, 2000, 2000, 3600];
// Sous-phases d'un document (étapes 3-6), en ms depuis le début de l'étape :
// 0 = l'aide « i » s'ouvre, 1 = la IA l'analyse (barre), 2 = validé (chips de datos).
const SUB_MS = [0, 700, 1450];
const SUAVE = "ease-[cubic-bezier(0.22,1,0.36,1)]";      // entrées : rapide puis se pose
const DESLIZ = "ease-[cubic-bezier(0.65,0,0.35,1)]";     // défilements : départ et arrivée doux
// Mesure avant peinture côté client (le défilement part du bon endroit), sans alerte au SSR.
const useMedida = typeof window !== "undefined" ? useLayoutEffect : useEffect;
type EstadoDoc = "pendiente" | "info" | "analizando" | "validado";

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
// `ayuda` = el texto «i» de cada documento en el portal real (lib/portal-i18n.ts, es).
const DOCS: { label: string; ayuda: string; campos: [string, string][] }[] = [
  { label: "Pasaporte", ayuda: "Página con tu foto y tus datos. Debe estar vigente y leerse con claridad.", campos: [["Nombre", "Julia Mendoza"], ["Nº", "AV284917"], ["Caducidad", "22/08/2029"]] },
  { label: "Certificado de empadronamiento", ayuda: "Certificado o volante de empadronamiento reciente (menos de 3 meses).", campos: [["Dirección", "C/ Sepúlveda 112"], ["Municipio", "Barcelona"]] },
  { label: "Contrato de trabajo", ayuda: "Contrato firmado por ti y la empresa, con fechas y salario.", campos: [["Empleador", "Bonavista SL"], ["Puesto", "Ayud. cocina"]] },
  { label: "Antecedentes penales", ayuda: "Certificado de antecedentes penales de tu país de origen, traducido si procede.", campos: [["Resultado", "Sin antecedentes"], ["País", "Colombia"]] },
];
const FILES = ["pasaporte.jpg", "empadronamiento.jpg", "contrato.pdf", "antecedentes.pdf"];

// Formulaire datos : groupe Identidad du vrai portail, avec NOM UNIQUE « Apellidos ».
const DATOS = [
  { label: "Nombre", value: "Julia" },
  { label: "Apellidos", value: "Mendoza Restrepo" },
  { label: "Nacionalidad", value: "Colombia" },
  { label: "NIE", value: "Y0284917K" },
  { label: "Pasaporte", value: "AV284917" },
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

// Fases del ciclo real (BOARD_PHASES/FASES, reforma 22/08): el detalle ya no lleva
// píldora de estado — lleva el stepper de 4 fases y la carta de completitud (anillo %
// + Información/Documentos/Formularios), como la ficha de verdad.
const FASES = ["Preparación", "Preparado"];
// Fase activa (flujo v4): en Preparación hasta que los formularios están generados (paso 7),
// momento en que el expediente pasa a «Preparado» — igual que faseDe(). La completitud es la
// media de 3 partes (lib/progreso.ts): Información (ficha completa en el paso 2), Documentos
// (validados/4, en directo) y Formularios (generados al final): se calcula en Dashboard.

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

function Phone({ step, docActual, estadoDoc }: { step: number; docActual: number; estadoDoc: (i: number) => EstadoDoc }) {
  return (
    <div className="relative mx-auto w-[260px]">
      {/* isolate + translateZ(0): en Safari, los hijos con transform (las Screen que
          entran deslizándose) se SALEN de un overflow-hidden redondeado si el marco no
          es su propio contexto de composición — «la animación se sale del móvil»
          (lo vio Matthias). Chrome clippea igual con o sin esto. */}
      <div className="relative isolate aspect-[9/18.5] overflow-hidden rounded-[2.3rem] border-[7px] border-slate-900 bg-cream-50 shadow-2xl [transform:translateZ(0)]">
        <div className="relative z-20 flex h-6 items-center justify-center bg-white">
          <div className="h-3.5 w-16 rounded-full bg-slate-900" />
        </div>

        <div className="relative h-[calc(100%-1.5rem)]">
          {/* 0 · WhatsApp */}
          <Screen active={step === 0}>
            <div className="flex h-full flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 bg-[#075E54] px-3 text-white">
              <div className="h-6 w-6 rounded-full bg-white/20" />
              <span className="text-[13px] font-medium">Gestoría Vallès</span>
            </div>
            <div className="flex-1 space-y-2 bg-[#ECE5DD] p-3">
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
            <DocumentosScroll cur={Math.max(0, docActual)} activo={step >= 3 && step <= 6} estadoDoc={estadoDoc} />
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
    <div className={`absolute inset-0 overflow-hidden bg-cream-50 transition-[opacity,transform] duration-500 will-change-[opacity,transform] ${SUAVE} ${active ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0"}`}>
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
      // Se vacía cuando la pantalla ya se ha ido (fundido de 500 ms): nunca a la vista.
      const t = window.setTimeout(() => setProg({ field: 0, chars: 0 }), 600);
      return () => window.clearTimeout(t);
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
      <p className="text-[14px] font-bold tracking-tight text-slate-900">Tus datos</p>
      <p className="mt-0.5 text-[9px] text-slate-500">Con estos datos preparamos tus formularios oficiales.</p>
      <p className="mb-1.5 mt-2.5 text-[7.5px] font-semibold uppercase tracking-wide text-slate-400">Identidad</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DATOS.map((f, i) => {
          const done = i < prog.field;
          const typing = i === prog.field;
          const shown = done ? f.value : typing ? f.value.slice(0, prog.chars) : "";
          const ancho = f.label === "Apellidos" ? "col-span-2" : "";
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
      // Igual que la ficha: se deselecciona cuando la pantalla ya no se ve.
      const t = window.setTimeout(() => { setPicked(false); setTapping(false); }, 600);
      return () => window.clearTimeout(t);
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

      <p className="mt-3 text-[14px] font-bold tracking-tight text-slate-900">Hola Julia 👋</p>
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

// La lista de documentos puede crecer más que la pantalla del móvil: el «scroll» lo
// hace la animación (suave, hacia la carta activa), nunca el contenido desbordando.
function DocumentosScroll({ cur, activo, estadoDoc }: { cur: number; activo: boolean; estadoDoc: (i: number) => EstadoDoc }) {
  // Translación CSS (scrollTo suave no funciona sobre overflow:hidden): la carta
  // activa queda siempre a la vista y nada puede salirse del marco (clamp + clip).
  const [desp, setDesp] = useState(0);
  const winRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  useMedida(() => {
    if (!activo) { setDesp(0); return; }
    const win = winRef.current, inner = innerRef.current;
    if (!win || !inner) return;
    const carta = inner.querySelectorAll("[data-doc]")[cur] as HTMLElement | undefined;
    const pos = carta ? carta.getBoundingClientRect().top - inner.getBoundingClientRect().top : 0;
    setDesp(Math.max(0, Math.min(pos - 132, inner.scrollHeight - win.clientHeight)));
  }, [cur, activo]);
  return (
    <div ref={winRef} className="relative h-[calc(100%-70px)] overflow-hidden">
      <div ref={innerRef} className={`relative transition-transform duration-[900ms] will-change-transform ${DESLIZ}`} style={{ transform: `translateY(-${desp}px)` }}>
        <Documentos cur={cur} estadoDoc={estadoDoc} />
      </div>
    </div>
  );
}

// Capas superpuestas en la misma celda: lo que cambia se funde, el tamaño no se mueve.
const PILA = "grid [&>*]:col-start-1 [&>*]:row-start-1";
const capa = (on: boolean, extra = "") => `transition-[opacity,background-color,border-color,color] duration-300 ${extra} ${on ? "opacity-100" : "pointer-events-none opacity-0"}`;

// Step 2 du vrai portail : cartes de documents (icône "i", estados, chips de datos extraídos).
// Chaque carte : en-tête fixe (icône et état en fondu) + un détail qui s'ouvre en douceur
// (grid-template-rows 0fr → 1fr) et dont les trois contenus (aide, analyse, datos) se fondent
// l'un dans l'autre sans changer la hauteur.
function Documentos({ cur, estadoDoc }: { cur: number; estadoDoc: (i: number) => EstadoDoc }) {
  return (
    <div className="px-3 pb-3 pt-1">
      <p className="text-[14px] font-bold tracking-tight text-slate-900">Documentos</p>
      <p className="mt-0.5 text-[9px] text-slate-500">Sube cada documento. La IA comprueba al instante que sea legible y esté vigente.</p>
      <div className="mt-2 space-y-1.5">
        {DOCS.map((d, i) => {
          const e = estadoDoc(i);
          const validado = e === "validado";
          const activo = e === "info" || e === "analizando";
          const detalle = e !== "pendiente";
          return (
            <div key={d.label} data-doc className={`rounded-xl border bg-white p-2 transition-colors duration-500 ${activo ? "border-amber-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`${PILA} h-6 w-6 shrink-0`}>
                    <span className={capa(!validado, `flex items-center justify-center rounded-md ${activo ? "bg-amber-100 text-amber-600" : "bg-cream-50 text-slate-400"}`)}><DocIcon className="h-3 w-3" /></span>
                    <span className={capa(validado, "flex items-center justify-center rounded-md bg-aproba-100 text-aproba-600")}><Check className="h-3 w-3" /></span>
                  </span>
                  <span className="truncate text-[9px] font-medium text-slate-800">{d.label}</span>
                  {/* Icône info "i" du vrai portail */}
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[7px] font-bold transition-colors duration-300 ${e === "info" ? "border-aproba-600 bg-aproba-600 text-white" : "border-slate-300 text-slate-400"}`}>i</span>
                </div>
                <span className={`${PILA} shrink-0 justify-items-end text-[8px]`}>
                  <span className={capa(e === "pendiente", "rounded-lg bg-aproba-600 px-2 py-0.5 font-semibold text-white")}>Subir</span>
                  <span className={capa(activo, "py-0.5 font-medium text-amber-600")}>Analizando…</span>
                  <span className={capa(validado, "py-0.5 font-semibold text-aproba-700")}>Validado</span>
                </span>
              </div>

              <div className={`grid transition-[grid-template-rows,opacity] duration-500 ${SUAVE} ${detalle ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="min-h-0 overflow-hidden">
                  <div className={`${PILA} pt-1.5`}>
                    {/* Infobulle "¿Qué es esto?" */}
                    <p className={capa(e === "info", "rounded-md bg-cream-50 px-2 py-1 text-[7.5px] leading-relaxed text-slate-600")}>{d.ayuda}</p>
                    {/* Analyse IA : fichier + barre qui se remplit */}
                    <div className={capa(e === "analizando", "px-0.5 py-0.5")}>
                      <div className="flex items-center gap-1.5 text-[8px] text-slate-500">
                        <span className="h-4 w-4 rounded bg-slate-200" />
                        <span className="truncate">{FILES[i]}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div key={e === "analizando" ? `a${cur}` : "reposo"} className={`h-full origin-left rounded-full bg-aproba-500 ${e === "analizando" ? "animate-progreso" : "scale-x-0"}`} />
                      </div>
                    </div>
                    {/* Chips de datos extraídos par IA (cartes validées) */}
                    <div className={capa(validado, "rounded-md bg-cream-50 px-2 py-1")}>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {d.campos.map(([k, v]) => (
                          <span key={k} className="text-[7.5px]"><span className="text-slate-400">{k}: </span><span className="font-mono text-slate-700">{v}</span></span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────── Dashboard (côté gestor) ───────────────────────
// Reproduit le vrai détail expediente (app/app/expedientes/[id]/page.tsx).

function Dashboard({ step, validados, estadoDoc, historialVisible, fundido, rebobinando }: {
  step: number; validados: number; estadoDoc: (i: number) => EstadoDoc; historialVisible: (i: number) => boolean; fundido: boolean; rebobinando: boolean;
}) {
  const formsListos = step >= 7;
  const fase = formsListos ? 1 : 0;
  const docsCount = DOCS.length;
  // Completitud = media de Información, Documentos y Formularios (lib/progreso.ts), en directo.
  const comp = Math.round(((step >= 2 ? 100 : 0) + (validados / docsCount) * 100 + (formsListos ? 100 : 0)) / 3);

  // Desplazamiento narrativo del marco (el contenido mide más que el marco de 600 px): pasos 0-2
  // arriba (cabecera + carta de completitud), 3-6 sobre los documentos, 7 al fondo (Generado
  // automáticamente + historial). La maqueta ya no cambia de alto en ningún paso (capas que se
  // funden en vez de bloques que aparecen): la posición medida es la definitiva.
  // ⚠️ TRANSLACIÓN CSS, no scrollTo: scrollTo({behavior:"smooth"}) es un no-op sobre
  // overflow:hidden (probado — el scroll directo funciona, el suave no se mueve).
  const [desp, setDesp] = useState(0);
  const winRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLParagraphElement>(null);
  useMedida(() => {
    const win = winRef.current, inner = innerRef.current;
    if (!win || !inner) return;
    // Posición por DIFERENCIA de rects (no offsetTop: devolvía valores fantasma según
    // el offsetParent): restar el top del contenido anula la translación en curso y da
    // la posición real de la sección dentro del contenido.
    const posDe = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().top - inner.getBoundingClientRect().top : 0);
    let top = 0;
    if (step >= 3 && step <= 6) top = posDe(docsRef.current) - 64;
    if (step >= 7) top = inner.scrollHeight;
    setDesp(Math.max(0, Math.min(top, inner.scrollHeight - win.clientHeight)));
  }, [step]);

  return (
    // rebobinando: vuelta al principio con el panel fundido → sin transiciones (nadie la ve).
    <div className={`isolate h-[600px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-cream-50 shadow-card [transform:translateZ(0)] ${rebobinando ? "[&_*]:!transition-none [&_*]:!animate-none" : ""}`}>
      {/* Barre navigateur */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-aproba-500" />
        <span className="ml-3 font-mono text-[11px] text-slate-400">app.aproba-software.com/app/expedientes/exp-42</span>
      </div>

      <div ref={winRef} className={`relative h-[calc(100%-2.5rem)] overflow-hidden transition-opacity duration-[400ms] ease-out ${fundido ? "opacity-0" : "opacity-100"}`}>
      {/* relative: las posiciones se miden contra ESTE div, que es el que se traslada. */}
      <div ref={innerRef} className={`relative transition-transform duration-[900ms] will-change-transform ${DESLIZ}`} style={{ transform: `translateY(-${desp}px)` }}>
      <div className="p-4">
        {/* En-tête expediente : referencia + nom + STEPPER de fases (la píldora de
            estado ya no existe en el producto — reforma del 22/08). */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="font-mono text-[11px] text-slate-400">EXP-2026-0042</p>
            <p className="mt-0.5 text-lg font-bold tracking-tightest text-slate-900">Julia Mendoza</p>
            <p className="text-xs text-slate-500">Arraigo social · Colombia</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 border-t border-slate-100 pt-2.5 sm:grid-cols-4">
            {FASES.map((f, i) => (
              <div key={f} className={`flex items-center justify-center gap-1 truncate rounded-md border px-1 py-1 text-[8.5px] font-semibold transition-colors duration-500 ${i < fase ? "border-transparent bg-aproba-50/60 text-aproba-700" : i === fase ? "border-aproba-200 bg-aproba-50 text-aproba-800" : "border-transparent bg-slate-50 text-slate-400"}`}>
                {i < fase ? <Check className="h-2 w-2 shrink-0" /> : <span className="shrink-0">{i + 1}.</span>}
                <span className="truncate">{f}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
            <span><span className="text-slate-400">Asignado a </span><span className="font-medium text-slate-700">Marc R.</span></span>
            <span><span className="text-slate-400">Creado </span><span className="font-medium text-slate-700">11 jun 2026</span></span>
          </div>
        </div>

        {/* Carta de completitud (ValidarExpediente real): anillo con el % dentro, las
            tres partes con su coca y el botón del momento. El % crece EN DIRECTO. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-slate-100" />
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round" stroke="currentColor" className={`text-aproba-500 transition-[stroke-dashoffset] duration-700 ${SUAVE}`} strokeDasharray={2 * Math.PI * 15} strokeDashoffset={2 * Math.PI * 15 * (1 - comp / 100)} />
            </svg>
            <span className="absolute text-[8px] font-bold tabular-nums text-slate-600">{comp}%</span>
          </span>
          {([["Información", step >= 2], ["Documentos", validados === docsCount], ["Formularios", formsListos]] as const).map(([l, on]) => (
            <span key={l} className={`inline-flex items-center gap-1 text-[10px] transition-colors duration-500 ${on ? "font-medium text-aproba-700" : "text-slate-400"}`}>
              <span className={`${PILA} h-3 w-3`}>
                <span className={capa(!on, "rounded-full border-2 border-slate-200")} />
                <span className={capa(on, "flex items-center justify-center rounded-full bg-aproba-600 text-white")}><Check className="h-2 w-2" /></span>
              </span>
              {l}
            </span>
          ))}
          <span className={`${PILA} justify-items-center text-[9px] font-semibold`}>
            <span className={capa(!formsListos, "rounded-md border border-aproba-300 px-2 py-1 text-aproba-700")}>Marcar como preparado</span>
            <span className={capa(formsListos, "rounded-md border border-aproba-600 bg-aproba-600 px-2 py-1 text-white")}>Archivar</span>
          </span>
        </div>

        {/* Documentos — cartes avec bouton Descargar + datos extraídos por IA. Mismo alto en
            los tres estados: el hueco de los datos existe siempre (esqueleto que late mientras
            la IA lee) y los datos aparecen encima, fundiéndose. */}
        <p ref={docsRef} className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Documentos ({docsCount})</p>
        <div className="space-y-1.5">
          {DOCS.map((d, i) => {
            const e = estadoDoc(i);
            const ok = e === "validado";
            const leyendo = e === "analizando";
            return (
              <div key={d.label} className={`rounded-xl border bg-white p-2.5 transition-colors duration-500 ${leyendo ? "border-amber-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`${PILA} h-6 w-6 shrink-0`}>
                      <span className={capa(!ok, `flex items-center justify-center rounded-md ${leyendo ? "bg-amber-50 text-amber-500" : "bg-cream-50 text-slate-400"}`)}><DocIcon className="h-3 w-3" /></span>
                      <span className={capa(ok, "flex items-center justify-center rounded-md bg-aproba-100 text-aproba-600")}><Check className="h-3 w-3" /></span>
                    </span>
                    <span className={`truncate text-[11px] font-medium transition-colors duration-500 ${ok ? "text-slate-900" : "text-slate-400"}`}>{d.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* En móvil no cabe con el nombre: solo desde sm (su hueco, reservado, no mueve nada). */}
                    <span className={capa(ok, "hidden items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 sm:inline-flex")}>
                      <DownloadIcon className="h-2.5 w-2.5" /> Descargar
                    </span>
                    <span className={`${PILA} justify-items-end text-[9px] font-semibold`}>
                      <span className={capa(!ok && !leyendo, "rounded-full bg-slate-100 px-2 py-0.5 text-slate-500")}>Pendiente</span>
                      <span className={capa(leyendo, "rounded-full bg-amber-50 px-2 py-0.5 text-amber-700")}>Analizando…</span>
                      <span className={capa(ok, "rounded-full bg-aproba-100 px-2 py-0.5 text-aproba-700")}>Validado</span>
                    </span>
                  </div>
                </div>
                {/* Datos extraídos por IA (o su esqueleto) */}
                <div className={`${PILA} mt-2`}>
                  <div className={capa(!ok, "rounded-lg bg-cream-50 px-2.5 py-1.5")}>
                    <p className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-slate-300">Datos extraídos por IA</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 py-0.5">
                      {d.campos.map(([k, v]) => (
                        <span key={k} className={`h-2 rounded-full bg-slate-200/80 ${leyendo ? "animate-pulse" : ""}`} style={{ width: `${Math.round((k.length + v.length) * 4.2)}px` }} />
                      ))}
                    </div>
                  </div>
                  <div className={capa(ok, "rounded-lg bg-cream-50 px-2.5 py-1.5")}>
                    <p className="mb-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Datos extraídos por IA</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {d.campos.map(([k, v]) => (
                        <span key={k} className="text-[9px]"><span className="text-slate-400">{k}: </span><span className="font-mono text-slate-700">{v}</span></span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* «Generado automáticamente» — EX-10, 790-012, Factura. Siempre en su sitio: antes del
            paso 7, su silueta en punteado; al generarse, las piezas de verdad aparecen encima. */}
        <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Generado automáticamente</p>
        <div className={PILA}>
          <div className={capa(!formsListos, "flex flex-wrap gap-1.5")}>
            {["EX-10 PDF", "790-012 PDF", "Factura 2026-0048 · 350,00 €"].map((f) => (
              <span key={f} className="rounded-lg border border-dashed border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-300">{f}</span>
            ))}
          </div>
          <div className={`flex flex-wrap gap-1.5 transition-[opacity,transform] duration-500 ${SUAVE} ${formsListos ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}>
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
            <li key={a} className={`flex items-center gap-2 text-[10px] transition-[opacity,transform] duration-500 ${SUAVE} ${historialVisible(i) ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aproba-500" />
              <span className="truncate text-slate-600">{a}</span>
            </li>
          ))}
        </ol>
      </div>
      </div>
      </div>
    </div>
  );
}

// ─────────────────────── Section complète ───────────────────────

export function HowItWorks() {
  const [step, setStep] = useState(0);
  const [sub, setSub] = useState(0);                // sous-phase du document en cours (étapes 3-6)
  const [enVista, setEnVista] = useState(false);    // ne tourne qu'à l'écran
  const [fundido, setFundido] = useState(false);    // panneau du gestor fondu avant un retour en arrière
  const [rebobinando, setRebobinando] = useState(false);
  const seccion = useRef<HTMLElement>(null);
  const stepRef = useRef(0);
  stepRef.current = step;
  const timers = useRef<number[]>([]);   // temporizadores del fundido (irA)

  // À l'écran seulement : hors écran rien ne tourne, et on la découvre depuis le début.
  useEffect(() => {
    const el = seccion.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setEnVista(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Aller à une étape. Vers l'avant : directement. Vers l'arrière (fin de boucle, ou un point
  // cliqué) : le panneau du gestor se fond, les états reviennent SANS transition, il réapparaît.
  const irA = useCallback((destino: number) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const despues = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
    if (destino >= stepRef.current) { setSub(0); setStep(destino); return; }
    setFundido(true);
    despues(420, () => {
      setRebobinando(true);
      setSub(0);
      setStep(destino);
      despues(90, () => { setRebobinando(false); setFundido(false); });
    });
  }, []);

  // Horloge : la sous-phase de chaque document (aide → analyse → validé), puis l'étape suivante.
  useEffect(() => {
    if (!enVista || fundido) return;
    const ids: number[] = [];
    if (step >= 3 && step <= 6) SUB_MS.forEach((ms, i) => { if (i > 0) ids.push(window.setTimeout(() => setSub(i), ms)); });
    ids.push(window.setTimeout(() => irA((step + 1) % STEPS), DURATIONS[step]));
    return () => ids.forEach((t) => window.clearTimeout(t));
  }, [step, enVista, fundido, irA]);
  useEffect(() => {
    const t = timers;
    return () => t.current.forEach((id) => window.clearTimeout(id));
  }, []);

  // Les faits, calculés une seule fois pour les deux écrans.
  const docActual = step >= 3 && step <= 6 ? step - 3 : -1;
  const validados = step < 3 ? 0 : step >= 7 ? DOCS.length : docActual + (sub >= 2 ? 1 : 0);
  const estadoDoc = (i: number): EstadoDoc =>
    i < validados ? "validado" : i === docActual ? (sub === 0 ? "info" : "analizando") : "pendiente";
  // Le tableau de bord ne voit un document qu'une fois envoyé (pas pendant l'aide « i »).
  const estadoGestor = (i: number): EstadoDoc => { const e = estadoDoc(i); return e === "info" ? "pendiente" : e; };
  // « Subió: … » quand le document part vraiment (analyse), le reste à son étape.
  const historialVisible = (i: number) => (i >= 3 && i <= 6 ? step > i || (step === i && sub >= 1) : step >= i);

  return (
    <section ref={seccion} className="scroll-mt-20 border-y border-slate-200 bg-white py-24 motion-reduce:[&_*]:!transition-none">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Cómo funciona</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Tu cliente sube. Tú ya lo tienes validado.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Un enlace por WhatsApp de un lado, tu expediente listo del otro.</p>
        </div>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2">
          <div className="order-2 min-w-0 lg:order-1">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ve tu cliente</p>
            <Phone step={step} docActual={docActual} estadoDoc={estadoDoc} />
          </div>
          <div className="order-1 min-w-0 lg:order-2">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">Lo que ves tú</p>
            <Dashboard step={step} validados={validados} estadoDoc={estadoGestor} historialVisible={historialVisible} fundido={fundido} rebobinando={rebobinando} />
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl text-center">
          {/* La frase cambia en fundido (clave = paso), no de golpe. */}
          <p className="flex min-h-[3.75rem] items-center justify-center text-lg font-medium text-slate-700">
            <span key={step} className="animate-fadein">{CAPTIONS[step]}</span>
          </p>
          <div className="mt-2 flex items-center justify-center">
            {/* Zona táctil de 40×≥24 px por punto (Lighthouse target-size); el punto visible sigue siendo discreto. */}
            {Array.from({ length: STEPS }).map((_, i) => (
              <button
                key={i}
                onClick={() => irA(i)}
                aria-label={`Paso ${i + 1}`}
                className="flex h-10 min-w-6 items-center justify-center px-1.5"
              >
                <span className={`h-2 rounded-full transition-[width,background-color] duration-300 ${SUAVE} ${i === step ? "w-8 bg-aproba-600" : "w-2 bg-slate-300 hover:bg-slate-400"}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
