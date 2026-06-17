import Link from "next/link";
import { AprobaLogo, AprobaMark } from "@/components/logo";
import { HowItWorks } from "@/components/demos";
import { HeroAnimation } from "@/components/hero-animation";
import { Reveal } from "@/components/reveal";

const PAINS = [
  "Documentos borrosos que llegan por WhatsApp y hay que pedir tres veces.",
  "Rellenar los EX a mano, campo por campo, en cada expediente.",
  "Clientes que llaman cada semana para saber cómo va lo suyo.",
  "Un error administrativo y el expediente vuelve rechazado.",
];

const STATS = [
  { n: "4 h → 30 min", l: "por expediente", icon: "time" },
  { n: "−70 %", l: "errores administrativos", icon: "shield" },
  { n: "4 formularios", l: "generados en un clic", icon: "file" },
  { n: "0 apps", l: "que instalar tu cliente", icon: "phone" },
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
      return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></svg>);
  }
}

const MODULOS = [
  { titulo: "Validación de documentos con IA", desc: "Tus clientes suben fotos desde el móvil. Aproba detecta el tipo, extrae los datos y avisa si algo está borroso, caducado o incompleto.", icon: "scan" },
  { titulo: "Formularios EX y 790-012 automáticos", desc: "A partir de los documentos validados, Aproba rellena los EX-15, EX-17, EX-18, EX-19 y la tasa 790-012. Sin copiar datos a mano.", icon: "doc" },
  { titulo: "Seguimiento de expedientes", desc: "Un tablero claro: qué falta, qué está validado, qué se ha presentado. Tu equipo y tú, siempre al día.", icon: "board" },
  { titulo: "Avisos automáticos al cliente", desc: "El cliente recibe un mensaje en cada paso: documento aceptado, cita fijada, expediente presentado. Menos llamadas, más tiempo.", icon: "bell" },
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
  "El cliente lo completa en su idioma (5 idiomas)",
  "La IA detecta caducados o ilegibles antes de presentar",
];

const PLANES = [
  { nombre: "Starter", precio: "49", para: "Autónomo · hasta 25 expedientes/mes", features: ["Tus clientes rellenan sus datos y suben documentos online", "Validación IA de documentos", "Formularios EX + 790-012", "1 usuario", "Soporte por email"], destacado: false },
  { nombre: "Pro", precio: "99", para: "Equipo · 25-100 expedientes/mes", features: ["Todo lo de Starter", "Hasta 5 usuarios", "Avisos automáticos al cliente", "Portal del cliente con tu marca", "Soporte prioritario"], destacado: true },
  { nombre: "Business", precio: "199", para: "+100 expedientes/mes o multi-oficina", features: ["Todo lo de Pro", "Usuarios ilimitados", "Facturación integrada", "Multi-oficina", "Onboarding dedicado"], destacado: false },
];

const FAQ = [
  { q: "¿Es seguro? ¿Qué pasa con los datos de mis clientes?", a: "Sí. Los datos viajan cifrados, se alojan en servidores de la UE y nunca se usan para entrenar modelos de IA. Aproba cumple el RGPD y firmamos el contrato de encargado de tratamiento (DPA)." },
  { q: "¿Tengo que cambiar mi forma de trabajar?", a: "No. Aproba se ocupa de la parte pesada —recoger documentos y rellenar formularios—. Tú sigues presentando en la sede electrónica como siempre, pero con todo listo y validado." },
  { q: "¿Reemplaza a mi equipo?", a: "Al contrario. Les quita el trabajo repetitivo (pedir documentos, teclear los EX) para que dediquen su tiempo a lo que aporta valor: el cliente y la estrategia del caso." },
  { q: "Ya uso A3 o Holded. ¿Me sirve igual?", a: "Sí. Aproba es específico de extranjería y convive con tu programa de contabilidad. Puedes exportar a Excel cuando quieras." },
  { q: "¿Cuánto tardo en configurarlo?", a: "Diez minutos. Sin instalaciones ni informático. Creas tu cuenta, invitas a tu equipo y empiezas a enviar enlaces hoy mismo." },
];

// Avis placeholder — à remplacer par de vrais témoignages dès les premiers clients.
const REVIEWS = [
  { quote: "Antes tardaba una tarde entera en montar un arraigo. Ahora el cliente sube todo desde el móvil y yo solo reviso y presento.", name: "Marta Ribas", role: "Gestoría Vallès", city: "Barcelona", initials: "MR" },
  { quote: "Las fotos borrosas eran mi pesadilla. Aproba las detecta al instante y pide al cliente que las repita. Se acabaron los rechazos.", name: "Diego Fuentes", role: "Asesoría Fuentes", city: "Madrid", initials: "DF" },
  { quote: "Generar los EX y la 790-012 en un clic me ahorra horas cada semana, y sin errores de transcripción.", name: "Nuria Camps", role: "Gestió Camps", city: "Girona", initials: "NC" },
  { quote: "Mis clientes reciben un aviso en cada paso y han dejado de llamar cada dos días. El despacho está mucho más tranquilo.", name: "Óscar Pérez", role: "Despacho Pérez & Asoc.", city: "Valencia", initials: "OP" },
  { quote: "Llevo tres oficinas y por fin veo todos los expedientes en un mismo tablero. La diferencia es brutal.", name: "Lucía Romero", role: "Grupo Romero Gestión", city: "Sevilla", initials: "LR" },
  { quote: "Como abogada de extranjería, el cumplimiento del RGPD era innegociable. Aproba lo cumple y me firma el DPA sin problema.", name: "Iria Castro", role: "Castro Abogados", city: "A Coruña", initials: "IC" },
];

function Stars() {
  return (
    <div className="flex gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.2 6.8.6-5.1 4.5 1.5 6.7L12 17.8 5.9 20.5l1.5-6.7-5.1-4.5 6.8-.6z" /></svg>
      ))}
    </div>
  );
}

function ReviewCard({ r }: { r: (typeof REVIEWS)[number] }) {
  return (
    <figure className="flex w-[340px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <Stars />
      <blockquote className="mt-4 flex-1 leading-relaxed text-slate-700">“{r.quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-aproba-100 text-sm font-semibold text-aproba-700">{r.initials}</span>
        <div>
          <p className="text-sm font-semibold text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-500">{r.role} · {r.city}</p>
        </div>
      </figcaption>
    </figure>
  );
}

function Icon({ name }: { name: string }) {
  const c = "w-6 h-6 text-aproba-600";
  if (name === "scan") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>;
  if (name === "doc") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>;
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
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900">
              Entrar
            </Link>
            <Link href="/signup" className="rounded-lg bg-aproba-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700 sm:px-4">
              Empieza gratis
            </Link>
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
          <div className="min-w-0 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-aproba-100 px-3 py-1 text-xs font-semibold text-aproba-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aproba-600" /> Para gestorías y abogados de extranjería
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.04] tracking-tightest text-slate-900 md:text-6xl">
              Automatiza tus expedientes de extranjería.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
              La IA valida los documentos, genera los formularios oficiales y sigue cada expediente.
              Lo que te llevaba 4 horas, en 30 minutos.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link href="/signup" className="w-full rounded-lg bg-aproba-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700 sm:w-auto">
                Empieza gratis 14 días
              </Link>
              <a href="#como-funciona" className="w-full rounded-lg border border-slate-300 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 sm:w-auto">
                Ver cómo funciona
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">Sin tarjeta · Configúralo en 10 minutos</p>
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
                  <p className="whitespace-nowrap text-3xl font-bold tracking-tightest">{s.n}</p>
                  <p className="mt-1.5 text-sm font-medium text-aproba-100">{s.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona — animation */}
      <HowItWorks />

      {/* Funciones / módulos */}
      <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Todo el expediente, en un sitio</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Desde que el cliente sube el primer documento hasta la presentación en sede electrónica.</p>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {MODULOS.map((m, i) => (
            <Reveal key={m.titulo} delay={i * 90}>
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
            <div className="rounded-2xl border border-slate-200 bg-cream-50 p-7">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sin Aproba</h3>
              <ul className="mt-5 space-y-3 text-slate-600">
                {SIN.map((s) => (
                  <li key={s} className="flex items-start gap-3"><Tick ok={false} />{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-aproba-600 bg-white p-7 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-aproba-700">Con Aproba</h3>
              <ul className="mt-5 space-y-3 text-slate-700">
                {CON.map((s) => (
                  <li key={s} className="flex items-start gap-3"><Tick ok={true} />{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Avis clients — défilement (marquee) */}
      <section className="overflow-hidden py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Gestorías que ya no vuelven atrás</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Lo que dicen quienes ya gestionan sus expedientes con Aproba.</p>
        </div>
        <div className="group relative mt-12 flex overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-cream-50 to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-cream-50 to-transparent sm:w-24" />
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            <div className="flex shrink-0 gap-5 px-2.5">{REVIEWS.map((r, i) => <ReviewCard key={`a${i}`} r={r} />)}</div>
            <div className="flex shrink-0 gap-5 px-2.5" aria-hidden="true">{REVIEWS.map((r, i) => <ReviewCard key={`b${i}`} r={r} />)}</div>
          </div>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tightest text-slate-900">Precios por volumen, no por profesión</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Empieza gratis 14 días. Sin permanencia.</p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {PLANES.map((p) => (
              <div key={p.nombre} className={`relative rounded-2xl border p-7 ${p.destacado ? "border-aproba-600 bg-cream-50 shadow-card" : "border-slate-200 bg-white"}`}>
                {p.destacado && <span className="absolute -top-3 left-7 rounded-full bg-aproba-600 px-3 py-1 text-xs font-semibold text-white">Más popular</span>}
                <h3 className="text-lg font-semibold text-slate-900">{p.nombre}</h3>
                <p className="mt-1 text-sm text-slate-500">{p.para}</p>
                <p className="mt-5"><span className="text-4xl font-bold tracking-tightest text-slate-900">{p.precio}€</span><span className="text-slate-500">/mes</span></p>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  {p.features.map((f) => (<li key={f} className="flex items-start gap-2"><Tick ok={true} />{f}</li>))}
                </ul>
                <Link href="/signup" className={`mt-7 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${p.destacado ? "bg-aproba-600 text-white hover:bg-aproba-700" : "border border-slate-300 text-slate-700 hover:border-slate-400"}`}>Empezar</Link>
              </div>
            ))}
          </div>
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
                <p className="mt-3 leading-relaxed text-slate-600">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-slate-200 bg-aproba-600">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tightest text-white">¿Listo para dejar el papeleo?</h2>
          <p className="mx-auto mt-3 max-w-lg text-aproba-100">Únete a las gestorías que ya validan documentos en segundos, no en horas.</p>
          <Link href="/signup" className="mt-8 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-aproba-700 shadow-sm transition hover:bg-aproba-50">
            Empieza gratis 14 días
          </Link>
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
    </div>
  );
}
