import Link from "next/link";
import { Reveal } from "@/components/reveal";

// MIGRACIÓN DE DATOS EN LA PORTADA (Matthias, 29/09/2026 : « sujet essentiel », sustituye a
// «El día y la noche» ; version épurée le même soir : « trop chargé »). Solo lo que existe HOY:
//  • el asistente de /app/importar (components/importar-datos.tsx): Excel, CSV, ODS o filas
//    pegadas, también la exportación de otro programa; la IA propone qué es cada columna y el
//    despacho confirma;
//  • lo que entra: clientes con su ficha, empresas, historial de trámites y de facturas,
//    caducidades → renovaciones vigiladas (el import NO crea expedientes en curso);
//  • la migración hecha por nosotros es el servicio Despegue (de pago, en #precios): aquí no se
//    promete «gratis». Las garantías (UE, DPA) viven en la sección siguiente, no se repiten.

const PASOS = [
  { t: "Tu archivo, tal cual", d: "Excel, CSV o la exportación de tu programa.", icono: "archivo" },
  { t: "La IA lo entiende", d: "Reconoce tus columnas y tú confirmas.", icono: "ia" },
  { t: "Todo dentro", d: "Clientes, historial y caducidades vigiladas.", icono: "listo" },
] as const;

function Icono({ n }: { n: (typeof PASOS)[number]["icono"] }) {
  const c = "h-6 w-6";
  if (n === "archivo") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>;
  if (n === "ia") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z" /></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
}

export function LandingMigracion() {
  return (
    <section id="migracion" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Migración de datos</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Empieza con todo tu despacho ya dentro</h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-slate-600">Trae tu cartera tal como la tienes, con tus columnas de siempre.</p>
        </div>

        <Reveal className="relative mt-16">
          {/* Hilo que une los tres pasos (escritorio) */}
          <div aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-7 hidden h-px bg-gradient-to-r from-aproba-200 via-aproba-400 to-aproba-200 md:block" />
          <ol className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
            {PASOS.map((p, i) => (
              <li key={p.t} className="text-center">
                <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${i === 2 ? "bg-aproba-600 text-white ring-aproba-600 shadow-float" : "bg-white text-aproba-600 ring-slate-200 shadow-card"}`}>
                  <Icono n={p.icono} />
                </span>
                <p className="mt-5 font-semibold text-slate-900">{p.t}</p>
                <p className="mx-auto mt-1.5 max-w-[15rem] text-[15px] leading-relaxed text-slate-500">{p.d}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <p className="mt-14 text-center text-[15px] text-slate-600">
          Hazlo tú en minutos o, si lo prefieres, te lo dejamos cargado.{" "}
          <Link href="#precios" className="whitespace-nowrap font-semibold text-aproba-700 transition hover:text-aproba-600">Ver el servicio Despegue →</Link>
        </p>
      </div>
    </section>
  );
}
