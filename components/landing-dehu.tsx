import { Reveal } from "@/components/reveal";

// DEHú EN LA PORTADA (Matthias, 29/09/2026 ; version épurée le même soir : « trop chargé »).
// Solo lo que funciona HOY (commit 33b20b4, en producción desde el 28/09):
//  • la dirección de Aproba puesta en la DEHú convierte cada aviso en una tarjeta con su cuenta
//    atrás de 10 días naturales para abrirla (art. 43.2 Ley 39/2015);
//  • el PDF de la notificación lo lee la IA y Aproba propone su expediente; un requerimiento
//    pasa a la campana con su plazo.
// El modo automático (Gran Destinatario / LEMA) está programado pero INACTIVO: no se anuncia.
// Una sola tarjeta de maqueta, un solo color de acento, datos ficticios de la demo.

const PUNTOS = [
  "Cada aviso, con su cuenta atrás de 10 días",
  "La IA lee la notificación y la vincula al expediente",
  "Cada requerimiento, con su plazo en tu campana",
];

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aproba-600 text-white">
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
}

function Maqueta() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-aproba-200/40 blur-3xl" />
      <div className="relative rounded-3xl bg-white p-6 shadow-float ring-1 ring-slate-900/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Notificación DEHú</p>
          <span className="rounded-full bg-aproba-50 px-2.5 py-0.5 text-xs font-semibold text-aproba-700">Requerimiento</span>
        </div>
        <p className="mt-3 text-lg font-semibold leading-snug tracking-tight text-slate-900">Oficina de Extranjería de Barcelona</p>
        <p className="mt-1 text-sm text-slate-500">Leída por la IA · vinculada a <span className="whitespace-nowrap font-mono text-slate-700">EXP-2026-0142</span></p>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-500">Plazo de respuesta</span>
            <span className="font-mono font-semibold text-slate-900">Quedan 7 días</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[30%] rounded-full bg-gradient-to-r from-aproba-500 to-aproba-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingDehu() {
  return (
    <section id="dehu" className="scroll-mt-20 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Novedad · DEHú</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">La DEHú, dentro de cada expediente</h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-slate-600">Requerimientos, resoluciones y citas llegan donde trabajas, con su plazo a la vista.</p>
          <ul className="mt-8 space-y-4">
            {PUNTOS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px] text-slate-700"><Check />{p}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <Maqueta />
        </Reveal>
      </div>
    </section>
  );
}
