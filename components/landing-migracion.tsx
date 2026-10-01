import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { MigracionAnimada } from "@/components/migracion-animada";

// MIGRACIÓN DE DATOS + CONFIANZA EN LA PORTADA (Matthias, 29/09/2026 : « sujet essentiel »,
// sustituye a «El día y la noche» ; version épurée le même soir ; el 30/09, los tres pasos pasan
// a ser una animación del flujo — components/migracion-animada.tsx — y la sección «Confianza» se
// funde aquí, más ligera: una fila sin tarjetas). Solo lo que existe HOY:
//  • el asistente de /app/importar (components/importar-datos.tsx): Excel, CSV, ODS o filas
//    pegadas, también la exportación de otro programa; la IA propone qué es cada columna y el
//    despacho confirma;
//  • lo que entra: clientes con su ficha, empresas, historial de trámites y de facturas,
//    caducidades → renovaciones vigiladas (el import NO crea expedientes en curso);
//  • la migración hecha por nosotros es GRATIS para todos y se hace en 48 horas (Matthias,
//    01/10/2026: « la migration est offerte et réalisée en 48H », para todos los planes); ya no
//    forma parte de Despegue (components/servicios-implantacion.tsx), así que la frase no enlaza;
//  • las garantías llegan de app/page.tsx (GARANTIAS, con la página de cada una).

type Garantia = { titulo: string; desc: string; icon: string; href: string };

function GarantiaIcon({ name }: { name: string }) {
  const c = "mt-0.5 h-5 w-5 shrink-0 text-aproba-600";
  if (name === "shield") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m8.5 12 2.5 2.5L15.5 10" /></svg>;
  if (name === "eu") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="9" /><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9s1.4-6.4 3.9-9Z" /></svg>;
  if (name === "lock") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M16 17l5-5-5-5M21 12H9" /></svg>;
}

export function LandingMigracion({ garantias }: { garantias: Garantia[] }) {
  return (
    <section id="migracion" className="scroll-mt-20 border-t border-slate-200 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Migración de datos</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Empieza con todo tu despacho ya dentro</h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-slate-600">Trae tu cartera tal como la tienes, con tus columnas de siempre.</p>
        </div>

        <Reveal className="mt-14">
          <MigracionAnimada />
        </Reveal>

        <p className="mt-12 text-balance text-center text-[15px] text-slate-600">
          <span className="font-semibold text-slate-900">Te migramos los datos gratis y en 48 horas:</span>{" "}
          nos envías tu archivo y te lo dejamos todo cargado.
        </p>

        {/* Confianza: la pregunta que sigue a «trae tus datos». Una fila, sin tarjetas. */}
        <div className="mt-20">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-300" />
            <h3 className="text-center text-xs font-bold uppercase tracking-widest text-aproba-700">Tus datos, tratados como se debe</h3>
            <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-300" />
          </div>
          <ul className="mx-auto mt-10 grid max-w-md grid-cols-1 gap-x-8 gap-y-7 sm:max-w-none sm:grid-cols-2 lg:grid-cols-4">
            {garantias.map((g, i) => (
              <li key={g.titulo}>
                <Reveal delay={i * 80}>
                  <Link href={g.href} title="Qué garantiza y cómo se comprueba" className="group flex items-start gap-3">
                    <GarantiaIcon name={g.icon} />
                    <span>
                      <span className="block font-semibold text-slate-900 transition group-hover:text-aproba-700">{g.titulo}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-slate-500">{g.desc}</span>
                    </span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-center text-sm text-slate-500">
            Todo por escrito: <Link href="/legal/terminos" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">Términos</Link>,{" "}
            <Link href="/legal/privacidad" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">Privacidad</Link> y{" "}
            <Link href="/legal/dpa" className="font-medium text-aproba-700 underline underline-offset-2 hover:text-aproba-600">DPA</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
