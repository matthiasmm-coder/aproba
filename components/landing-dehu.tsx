import { Reveal } from "@/components/reveal";

// DEHú EN LA PORTADA (Matthias, 29/09/2026: «il faut que le DEHú apparaisse sur la landing»).
// Solo lo que funciona HOY (commit 33b20b4, en producción desde el 28/09):
//  • la dirección de Aproba puesta en la DEHú (Mis datos de contacto) convierte cada aviso en
//    una tarjeta con su cuenta atrás de 10 días naturales para abrirla (art. 43.2 Ley 39/2015);
//  • el PDF o ZIP de la notificación lo lee la IA (organismo, acto, plazo) y Aproba propone su
//    expediente: el gestor confirma con un clic; un requerimiento pasa a la campana con su plazo.
// El modo automático (Gran Destinatario / LEMA, b936144) está programado pero INACTIVO hasta el
// alta en la DEHú: aquí no se anuncia. La maqueta usa datos ficticios de la demo.

const PUNTOS = [
  { t: "El aviso te llega solo", d: "Pon tu dirección de Aproba en la DEHú: cada aviso aparece con su cuenta atrás de 10 días para abrirla." },
  { t: "La IA lee la notificación", d: "Subes el PDF: organismo, tipo de acto y plazo, extraídos y propuestos en su expediente." },
  { t: "Cada plazo, a la vista", d: "Un requerimiento entra en tu campana de alertas con su fecha límite." },
];

function Check() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

function Campana() {
  return <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}

// Maqueta: el aviso recibido por email (detrás) y la notificación ya leída y vinculada (delante).
function MaquetaDehu() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md pt-10 lg:pt-6">
      <div className="absolute right-0 top-0 w-[94%] rotate-[2.5deg] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-card sm:w-[84%]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-800">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>
            Aviso de la DEHú
          </p>
          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">7 días para abrirla</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Nueva notificación disponible para tu cliente</p>
      </div>

      <div className="relative mt-16 rounded-2xl border border-slate-200 bg-white p-5 shadow-float">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notificación DEHú</p>
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">Requerimiento</span>
        </div>
        <p className="mt-1 font-semibold leading-snug text-slate-900">Oficina de Extranjería de Barcelona</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-[11px] text-slate-500">Titular</dt>
            <dd className="mt-0.5 break-words font-medium text-slate-800">Ioana Popescu</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-[11px] text-slate-500">Plazo</dt>
            <dd className="mt-0.5 font-medium text-slate-800">10 días hábiles</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-aproba-50 px-3 py-2.5 ring-1 ring-aproba-200">
          <p className="text-xs text-aproba-700">Vinculada a <span className="font-mono font-semibold">EXP-2026-0142</span></p>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-aproba-700"><Check /> Leída por la IA</span>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500"><span className="mt-px shrink-0"><Campana /></span><span>Vence el <span className="font-mono font-semibold text-slate-700">13/10</span> · en tu campana de alertas</span></p>
      </div>
    </div>
  );
}

export function LandingDehu() {
  return (
    <section id="dehu" className="scroll-mt-20 pb-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] bg-white p-5 shadow-float ring-1 ring-slate-900/[0.06] sm:p-12">
            <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-aproba-100/70 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-aproba-50 blur-3xl" />
            <div className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-aproba-50 py-1 pl-1 pr-3 text-xs font-semibold text-aproba-700 ring-1 ring-aproba-200">
                  <span className="rounded-full bg-aproba-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Nuevo</span>
                  Notificaciones DEHú
                </p>
                <h2 className="mt-5 text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">La DEHú, dentro de cada expediente</h2>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">Requerimientos, resoluciones y citas llegan donde trabajas: leídos, vinculados y con su plazo a la vista.</p>
                <ol className="mt-8 space-y-5">
                  {PUNTOS.map((p, i) => (
                    <li key={p.t} className="flex gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aproba-500 to-aproba-700 font-mono text-sm font-semibold text-white shadow-sm">{i + 1}</span>
                      <div>
                        <p className="font-semibold text-slate-900">{p.t}</p>
                        <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{p.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <MaquetaDehu />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
