import Link from "next/link";
import { AprobaLogo, AprobaMark } from "@/components/logo";
import { HowItWorks } from "@/components/demos";
import { HeroAnimation } from "@/components/hero-animation";
import { Reveal } from "@/components/reveal";
import { ServiciosImplantacion } from "@/components/servicios-implantacion";
import { DemoButton, DemoModalHost } from "@/components/solicitar-demo";

const PAINS = [
  "Documentos borrosos que llegan por WhatsApp y hay que pedir tres veces.",
  "Rellenar los EX a mano, campo por campo, en cada expediente.",
  "Clientes que llaman cada semana para saber cómo va lo suyo.",
  "Un error administrativo y el expediente vuelve rechazado.",
];

const STATS = [
  { n: "4 h → 30 min", l: "por expediente", icon: "time" },
  { n: "−70 %", l: "errores administrativos", icon: "shield" },
  { n: "12", l: "formularios oficiales en un clic", icon: "file" },
  { n: "8", l: "idiomas para tus clientes, árabe incluido", icon: "globe" },
];

function StatIcon({ name }: { name: string }) {
  const cls = "h-6 w-6";
  switch (name) {
    case "time":
      return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case "shield":
      return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m8.5 12 2.5 2.5L15.5 10" /></svg>);
    case "file":
      return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15h6M9 11h3" /></svg>);
    default:
      return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>);
  }
}

const MODULOS = [
  { titulo: "Validación de documentos con IA", desc: "Tus clientes suben fotos desde el móvil, en su idioma. Aproba detecta el tipo, extrae los datos y avisa si algo está borroso, caducado o incompleto.", icon: "scan" },
  { titulo: "Formularios oficiales automáticos", desc: "Con los documentos validados, Aproba rellena el formulario oficial —12 modelos EX— y la tasa 790-012. Sin copiar datos a mano, sin errores de transcripción.", icon: "doc" },
  { titulo: "Revisión final «como Extranjería»", desc: "Antes de presentar, la IA repasa el expediente igual que lo haría el funcionario y te marca lo que provocaría un requerimiento. Y si llega uno, te redacta el escrito de subsanación.", icon: "eye" },
  { titulo: "Seguimiento de expedientes", desc: "Un tablero claro: qué falta, qué está validado, qué se ha presentado. Tu equipo y tú, siempre al día.", icon: "board" },
  { titulo: "Avisos automáticos al cliente", desc: "El cliente recibe un mensaje en cada paso: documento aceptado, cita fijada, expediente presentado. Menos llamadas, más tiempo.", icon: "bell" },
  { titulo: "Radar de renovaciones", desc: "Aproba vigila la caducidad de cada TIE y te avisa con meses de antelación. Un clic y la renovación está en marcha: ese cliente vuelve a ti, no a otro despacho.", icon: "radar" },
];

const SIN = [
  "Documentos por WhatsApp, email y papel, sin orden",
  "Formularios EX rellenados a mano, uno a uno",
  "Seguimiento en una hoja de Excel",
  "Llamadas constantes del cliente",
  "Clientes que no entienden los formularios en español",
  "Errores que descubres cuando ya está rechazado",
];

const CON = [
  "Un enlace: el cliente sube todo desde el móvil",
  "EX y 790-012 generados automáticamente",
  "Tablero con el estado de cada expediente",
  "Avisos automáticos en cada paso",
  "El cliente lo completa en su idioma (8 idiomas, árabe incluido)",
  "La IA detecta caducados o ilegibles antes de presentar",
];

const PLANES = [
  { nombre: "Starter", precio: "49", anual: "490", incluidos: "20", para: "Para autónomos", features: ["Tus clientes rellenan sus datos y suben documentos online", "Validación IA de documentos", "Formularios EX + 790-012 automáticos", "Avisos automáticos al cliente", "1 usuario · soporte por email"], destacado: false },
  { nombre: "Pro", precio: "99", anual: "990", incluidos: "50", para: "Para equipos en crecimiento", features: ["Todo lo de Starter", "Facturación integrada: facturas y suplidos automáticos", "Portal del cliente con tu marca", "Cobro por tarjeta opcional a tus clientes", "Hasta 5 usuarios"], destacado: true },
  { nombre: "Business", precio: "199", anual: "1.990", incluidos: "100", para: "Equipos grandes · multi-oficina", features: ["Todo lo de Pro", "Multi-oficina", "Usuarios ilimitados", "Soporte prioritario"], destacado: false },
];

const FAQ = [
  { q: "¿Cómo es la demo?", a: "Una videollamada de 20–30 minutos en la que recorremos Aproba con tus casos reales: subes un documento, ves cómo se validan los datos y cómo se genera el formulario oficial. Después tienes 1 mes de prueba gratis, sin tarjeta y sin permanencia." },
  { q: "¿Es seguro? ¿Qué pasa con los datos de mis clientes?", a: "Sí. Los datos viajan cifrados, se alojan en servidores de la UE y nunca se usan para entrenar modelos de IA. Aproba cumple el RGPD y firmamos el contrato de encargado de tratamiento (DPA)." },
  { q: "¿Tengo que cambiar mi forma de trabajar?", a: "No. Aproba se ocupa de la parte pesada —recoger documentos y rellenar formularios—. Tú sigues presentando en la sede electrónica como siempre, pero con todo listo y validado." },
  { q: "¿Reemplaza a mi equipo?", a: "Al contrario. Les quita el trabajo repetitivo (pedir documentos, teclear los EX) para que dediquen su tiempo a lo que aporta valor: el cliente y la estrategia del caso." },
  { q: "Ya uso A3 o Holded. ¿Me sirve igual?", a: "Sí. Aproba es específico de extranjería y convive con tu programa de contabilidad. Puedes exportar a Excel cuando quieras." },
  { q: "¿Cuánto tardo en configurarlo?", a: "Diez minutos. Sin instalaciones ni informático. Creas tu cuenta, invitas a tu equipo y empiezas a enviar enlaces hoy mismo." },
];

// Garantías FACTUALES (alineadas con /legal y la FAQ) — nada de testimonios
// inventados: reseñas ficticias = publicidad engañosa (RDL 24/2021) y un riesgo
// de credibilidad ante cualquier cliente que las googlee.
const GARANTIAS = [
  { titulo: "RGPD y DPA firmado", desc: "Cumplimos el RGPD y firmamos contigo el contrato de encargado de tratamiento, como con cualquier proveedor serio.", icon: "shield" },
  { titulo: "Datos alojados en la UE", desc: "Los expedientes de tus clientes viajan cifrados y se alojan en servidores de la Unión Europea.", icon: "eu" },
  { titulo: "Tus datos no entrenan IA", desc: "Los documentos de tus clientes nunca se usan para entrenar modelos de inteligencia artificial.", icon: "lock" },
  { titulo: "Sin permanencia", desc: "Mes a mes, exportas todo a Excel cuando quieras. Si Aproba no te ahorra tiempo, te vas sin ataduras.", icon: "door" },
];

function GarantiaIcon({ name }: { name: string }) {
  const c = "h-6 w-6 text-aproba-600";
  if (name === "shield") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m8.5 12 2.5 2.5L15.5 10" /></svg>;
  if (name === "eu") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="9" ry="9" /><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9s1.4-6.4 3.9-9Z" /></svg>;
  if (name === "lock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M16 17l5-5-5-5M21 12H9" /></svg>;
}

function Icon({ name }: { name: string }) {
  const c = "w-6 h-6 text-aproba-600";
  if (name === "scan") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>;
  if (name === "doc") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>;
  if (name === "eye") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
  if (name === "radar") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l5-5"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/></svg>;
  if (name === "board") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="18" rx="1"/><rect x="10" y="3" width="6" height="11" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>;
}

function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  ) : (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-cream-50">
      {/* Sin JS, los <Reveal> quedarían en opacity-0: forzamos visible */}
      <noscript>
        <style>{`.opacity-0{opacity:1!important}.translate-y-4{transform:none!important}`}</style>
      </noscript>
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-cream-50/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <AprobaLogo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#como-funciona" className="hover:text-slate-900">Cómo funciona</a>
            <a href="#funciones" className="hover:text-slate-900">Funciones</a>
            <a href="#precios" className="hover:text-slate-900">Precios</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3">
              Entrar
            </Link>
            <DemoButton className="px-3 py-2 sm:px-4" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* fond décoratif */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-72 w-72 rounded-full bg-aproba-200/30 blur-3xl" />
          <div className="absolute right-1/4 top-20 h-64 w-64 rounded-full bg-amber-100/40 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.4]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.07) 1px, transparent 0)",
              backgroundSize: "32px 32px",
              maskImage: "linear-gradient(to bottom, black, transparent 70%)",
              WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
            }}
          />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-14 pt-16 lg:grid-cols-2 lg:gap-8">
          {/* Texte */}
          <div className="hero-stagger min-w-0 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-aproba-100 px-3 py-1 text-xs font-semibold text-aproba-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aproba-600" /> Para gestorías y abogados de extranjería
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.04] tracking-tightest text-slate-900 md:text-6xl">
              Automatiza tus expedientes de{" "}
              <span className="relative inline-block whitespace-nowrap">
                extranjería.
                {/* Altura explícita y TODO el trazo por debajo de la caja de línea:
                    si el SVG sube hacia el texto, tacha el descendente de la «j». */}
                <svg className="underline-draw absolute left-0 top-full mt-0.5 h-2.5 w-full" viewBox="0 0 300 12" fill="none" aria-hidden="true" preserveAspectRatio="none">
                  <path d="M4 7c50-5 148-6 292-3" stroke="#10B083" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
              La IA valida los documentos, genera los formularios oficiales, revisa el expediente
              antes de presentarlo y vigila cada renovación. Lo que te llevaba 4 horas, en 30 minutos.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <DemoButton className="w-full px-6 py-3 sm:w-auto" />
              <a href="#como-funciona" className="group w-full rounded-lg border border-slate-300 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto">
                <span className="mr-1.5 inline-flex h-4 w-4 translate-y-[3px] items-center justify-center rounded-full bg-aproba-100 text-aproba-700 transition group-hover:bg-aproba-200">
                  <svg className="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
                Ver el vídeo (90 s)
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">Demo online de 20 min · después, 1 mes de prueba gratis sin tarjeta</p>
          </div>

          {/* Animation */}
          <div className="min-w-0 animate-fadein" style={{ animationDelay: "0.15s", animationFillMode: "both" }}>
            <HeroAnimation />
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tightest text-slate-900">¿Te suena esto?</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {PAINS.map((p, i) => (
            <Reveal key={p} delay={i * 80}>
              <div className="flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                <p className="text-slate-700">{p}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-xl text-center text-lg font-medium text-slate-700">
          Aproba se ocupa de todo eso. Tú te quedas con lo que importa: tus clientes.
        </p>
      </section>

      {/* Stats */}
      <section className="border-y border-aproba-700/40 bg-gradient-to-br from-aproba-600 to-aproba-700">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-white/15">
            {STATS.map((s, i) => (
              <Reveal key={s.l} delay={i * 90}>
                <div className="flex h-full flex-col items-center px-2 text-center text-white md:px-5">
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-inset ring-white/20">
                    <StatIcon name={s.icon} />
                  </span>
                  <p className="text-2xl font-bold tracking-tightest md:text-3xl">{s.n}</p>
                  <p className="mt-1.5 text-sm font-medium text-aproba-100">{s.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Vídeo demo */}
      <section id="como-funciona" className="scroll-mt-20 border-y border-slate-200 bg-cream-50 py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <span className="text-sm font-semibold text-aproba-700">En acción</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tightest text-slate-900">Ve Aproba en 90 segundos</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Del primer documento del cliente a la presentación del expediente, sin teclear un solo formulario.</p>
          <Reveal className="mt-10">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-float">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-cream-50 px-4 py-2.5">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-aproba-300" />
                </span>
                <span className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  app.aproba-software.com
                </span>
              </div>
              <video controls preload="metadata" playsInline poster="/demo-poster.jpg" className="h-auto w-full bg-black">
                <source src="/demo.mp4" type="video/mp4" />
                Tu navegador no admite la reproducción de vídeo.
              </video>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Cómo funciona — animation */}
      <HowItWorks />

      {/* Funciones / módulos */}
      <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Todo el expediente, en un sitio</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Desde que el cliente sube el primer documento hasta la presentación en sede electrónica.</p>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m, i) => (
            <Reveal key={m.titulo} delay={(i % 3) * 90}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-aproba-300 hover:shadow-float">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-aproba-50 transition-transform duration-300 group-hover:scale-110"><Icon name={m.icon} /></div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{m.titulo}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{m.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Antes / Con Aproba */}
      <section className="border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">El día y la noche</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Reveal>
            <div className="h-full rounded-2xl border border-slate-200 bg-cream-50 p-7">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sin Aproba</h3>
              <ul className="mt-5 space-y-3 text-slate-600">
                {SIN.map((s) => (
                  <li key={s} className="flex items-start gap-3"><Tick ok={false} />{s}</li>
                ))}
              </ul>
            </div>
            </Reveal>
            <Reveal delay={150}>
            <div className="h-full rounded-2xl border-2 border-aproba-600 bg-white p-7 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-aproba-700">Con Aproba</h3>
              <ul className="mt-5 space-y-3 text-slate-700">
                {CON.map((s) => (
                  <li key={s} className="flex items-start gap-3"><Tick ok={true} />{s}</li>
                ))}
              </ul>
            </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Confianza — garantías verificables, el argumento que de verdad pesa
          para un despacho que maneja pasaportes y datos sensibles */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Para despachos que se toman los datos en serio</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Tus expedientes contienen pasaportes, nóminas y datos sensibles. Los tratamos como se debe.</p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {GARANTIAS.map((g, i) => (
              <Reveal key={g.titulo} delay={i * 90}>
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-aproba-50"><GarantiaIcon name={g.icon} /></div>
                  <h3 className="mt-4 font-semibold text-slate-900">{g.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{g.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-slate-500">
            Todo por escrito: <Link href="/legal/terminos" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">Términos</Link>,{" "}
            <Link href="/legal/privacidad" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">Privacidad</Link> y{" "}
            <Link href="/legal/dpa" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">DPA</Link>.
          </p>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Precios por volumen, no por profesión</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Todos los planes empiezan con 1 mes de prueba gratis, sin permanencia. Precios sin IVA.</p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PLANES.map((p, i) => (
              <Reveal key={p.nombre} delay={i * 90}>
              <div className={`relative flex h-full flex-col rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 ${p.destacado ? "border-aproba-600 bg-cream-50 shadow-card hover:shadow-float" : "border-slate-200 bg-white hover:border-aproba-300 hover:shadow-card"}`}>
                {p.destacado && <span className="absolute -top-3 left-7 rounded-full bg-aproba-600 px-3 py-1 text-xs font-semibold text-white">Más popular</span>}
                <h3 className="text-lg font-semibold text-slate-900">{p.nombre}</h3>
                <p className="mt-1 text-sm text-slate-500">{p.para}</p>
                <p className="mt-5"><span className="text-4xl font-bold tracking-tightest text-slate-900">{p.precio}&nbsp;€</span><span className="text-slate-500">/mes + IVA</span></p>
                <p className="mt-1 text-xs text-slate-500">o {p.anual}&nbsp;€/año · 2 meses gratis</p>
                <p className="mt-3 rounded-lg bg-aproba-50 px-3 py-2 text-xs font-medium text-aproba-700">{p.incluidos} expedientes/mes incluidos · <span className="whitespace-nowrap">después 3 €/expediente</span></p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-600">
                  {p.features.map((f) => (<li key={f} className="flex items-start gap-2"><Tick ok={true} />{f}</li>))}
                </ul>
                <DemoButton variant={p.destacado ? "primary" : "outline"} className="mt-7 w-full px-4 py-2.5" />
              </div>
              </Reveal>
            ))}
          </div>

          <ServiciosImplantacion />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Preguntas frecuentes</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <details className="group rounded-xl border border-slate-200 bg-white p-5 [&_svg]:open:rotate-180">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-800">
                  {f.q}
                  <svg className="h-5 w-5 shrink-0 text-slate-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </summary>
                <p className="faq-body mt-3 leading-relaxed text-slate-600">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-slate-200 bg-aproba-600">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tightest text-white">¿Listo para dejar el papeleo?</h2>
          <p className="mx-auto mt-3 max-w-lg text-aproba-100">Ve Aproba con tus propios casos, en 20 minutos y sin compromiso.</p>
          <DemoButton variant="invert" className="mt-8 px-6 py-3" />
          <p className="mt-4 text-xs text-aproba-200">Te respondemos en menos de 24 h laborables</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-cream-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-slate-500 md:flex-row">
          <div className="flex items-center gap-2"><AprobaMark size={24} /><span>© 2026 Aproba</span></div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/legal/aviso-legal" className="hover:text-slate-700">Aviso legal</Link>
            <Link href="/legal/privacidad" className="hover:text-slate-700">Privacidad</Link>
            <Link href="/legal/cookies" className="hover:text-slate-700">Cookies</Link>
            <Link href="/legal/terminos" className="hover:text-slate-700">Términos</Link>
            <a href="mailto:hola@aproba-software.com" className="hover:text-slate-700">Contacto</a>
          </div>
        </div>
      </footer>

      <DemoModalHost />
    </div>
  );
}
