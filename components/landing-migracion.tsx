import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { MigracionAnimada } from "@/components/migracion-animada";

// MIGRACIÓN DE DATOS EN LA PORTADA (Matthias, 29/09/2026 : « sujet essentiel », sustituye a
// «El día y la noche» ; version épurée le même soir : « trop chargé » ; el 30/09, los tres pasos
// pasan a ser una animación del flujo: components/migracion-animada.tsx). Solo lo que existe HOY:
//  • el asistente de /app/importar (components/importar-datos.tsx): Excel, CSV, ODS o filas
//    pegadas, también la exportación de otro programa; la IA propone qué es cada columna y el
//    despacho confirma;
//  • lo que entra: clientes con su ficha, empresas, historial de trámites y de facturas,
//    caducidades → renovaciones vigiladas (el import NO crea expedientes en curso);
//  • la migración hecha por nosotros es el servicio Despegue (de pago, en #precios): aquí no se
//    promete «gratis». Las garantías (UE, DPA) viven en la sección siguiente, no se repiten.

export function LandingMigracion() {
  return (
    <section id="migracion" className="scroll-mt-20 border-y border-slate-200 bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-aproba-700">Migración de datos</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Empieza con todo tu despacho ya dentro</h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-slate-600">Trae tu cartera tal como la tienes, con tus columnas de siempre.</p>
        </div>

        <Reveal className="mt-14">
          <MigracionAnimada />
        </Reveal>

        <p className="mt-12 text-center text-[15px] text-slate-600">
          Hazlo tú en minutos o, si lo prefieres, te lo dejamos cargado.{" "}
          <Link href="#precios" className="whitespace-nowrap font-semibold text-aproba-700 transition hover:text-aproba-600">Ver el servicio Despegue →</Link>
        </p>
      </div>
    </section>
  );
}
