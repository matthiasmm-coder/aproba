import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { AprobaMark } from "@/components/logo";

// MIGRACIÓN DE DATOS EN LA PORTADA (Matthias, 29/09/2026: «sujet essentiel»; sustituye a
// «El día y la noche»). Solo lo que existe HOY:
//  • el asistente de /app/importar (components/importar-datos.tsx): Excel, CSV, ODS o filas
//    pegadas, también la exportación de MN Program o Sudespacho; la IA propone qué es cada
//    columna y el despacho confirma;
//  • lo que entra: clientes con su ficha, empresas y sus trabajadores, historial de trámites y
//    de facturas, caducidades → renovaciones vigiladas (el import NO crea expedientes en curso);
//  • la migración hecha por nosotros es el servicio Despegue (de pago, en #precios): aquí no
//    se promete «gratis». DPA art. 28 firmado antes de recibir ningún archivo (web/MIGRACION.md).

const ORIGENES = ["Excel", "CSV", "Google Sheets", "Tu programa actual"];

// Cómo lee la IA las columnas: ejemplos reales del mapeo del asistente (datos ficticios).
const MAPEO = [
  { col: "Nombre y apellidos", campo: "Cliente" },
  { col: "Nº pasaporte", campo: "Pasaporte" },
  { col: "Empresa", campo: "Empresa" },
  { col: "Caduca TIE", campo: "Renovación" },
];

const LLEGA = [
  "Clientes con su ficha: NIE, pasaporte y contacto",
  "Empresas y sus trabajadores",
  "Historial de trámites y de facturas",
  "Caducidades vigiladas desde el primer día",
];

const OPCIONES = [
  { t: "Hazlo tú, en minutos", d: "Sube tu archivo desde Aproba: la IA reconoce tus columnas y tú confirmas antes de importar.", cta: null },
  { t: "O lo hacemos por ti", d: "Firmamos el contrato de encargado del tratamiento, nos envías tu archivo y te lo dejamos cargado.", cta: { label: "Ver el servicio Despegue", href: "#precios" } },
];

function Check() {
  return <svg className="mt-0.5 h-4 w-4 shrink-0 text-aproba-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}

function Flecha({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center justify-center ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-aproba-200 bg-white text-aproba-600 shadow-card">
        <svg className="h-5 w-5 rotate-90 lg:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </div>
  );
}

export function LandingMigracion() {
  return (
    <section id="migracion" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Migración de datos</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Empieza con todo tu despacho ya dentro</h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-slate-600">Trae tu cartera tal como la tienes: la IA entiende tus columnas y carga tus clientes, empresas, historial y caducidades.</p>
        </div>

        {/* El recorrido de los datos: de donde están hoy → la IA los lee → dentro de Aproba */}
        <Reveal className="mt-14">
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1fr_auto_1.15fr_auto_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-cream-50 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tus datos hoy</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ORIGENES.map((o) => (
                  <span key={o} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm">
                    <svg aria-hidden="true" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
                    {o}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">Con tus columnas de siempre, sin plantilla obligatoria.</p>
            </div>

            <Flecha />

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-aproba-600 to-aproba-700 p-6 text-white shadow-float">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"><AprobaMark size={22} /></span>
                <p className="font-semibold">La IA reconoce tus columnas</p>
              </div>
              <ul className="relative mt-5 space-y-2" aria-label="Ejemplos de columnas reconocidas">
                {MAPEO.map((m) => (
                  <li key={m.col} className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15">
                    <span className="truncate font-mono text-[13px] text-white/85">{m.col}</span>
                    <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-aproba-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-aproba-700">{m.campo}</span>
                  </li>
                ))}
              </ul>
              <p className="relative mt-4 text-sm text-white/80">Tú revisas y confirmas antes de importar.</p>
            </div>

            <Flecha />

            <div className="rounded-2xl border border-aproba-200 bg-aproba-50/60 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-aproba-700">En Aproba</p>
              <ul className="mt-4 space-y-3">
                {LLEGA.map((l) => (
                  <li key={l} className="flex items-start gap-2.5 text-[15px] leading-snug text-slate-700"><Check />{l}</li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        {/* Dos caminos */}
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          {OPCIONES.map((o, i) => (
            <Reveal key={o.t} delay={i * 90} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <p className="font-semibold text-slate-900">{o.t}</p>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{o.d}</p>
                {o.cta && (
                  <Link href={o.cta.href} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-aproba-700 transition hover:text-aproba-600">
                    {o.cta.label}
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-balance text-center text-sm text-slate-500">
          Datos alojados en la UE · Contrato de encargado del tratamiento (art. 28 RGPD) · Exportas o borras tus datos cuando quieras.
        </p>
      </div>
    </section>
  );
}
