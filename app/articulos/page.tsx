import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listaArticulos, imagenDe, minutosDeLectura, fechaLarga } from "@/lib/articulos";

export const metadata: Metadata = {
  title: "Artículos sobre extranjería para despachos",
  description:
    "Plazos, volúmenes oficiales y práctica del despacho en trámites de extranjería en España. Artículos para gestorías y abogados, con las fuentes y las fechas.",
  alternates: { canonical: "/articulos" },
  openGraph: {
    type: "website",
    url: "/articulos",
    title: "Artículos sobre extranjería para despachos · Aproba",
    description: "Plazos, volúmenes oficiales y práctica del despacho en trámites de extranjería en España.",
  },
};

export default function ArticulosIndex() {
  const articulos = listaArticulos();
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Artículos</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Lo que pasa en extranjería visto desde el trabajo real de un despacho: plazos que cambian,
        volúmenes que se acumulan y errores que cuestan semanas. Con las cifras oficiales y su fecha,
        para que puedas comprobarlas.
      </p>

      <div className="mt-10 space-y-4">
        {articulos.map((a) => (
          <article key={a.slug} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-aproba-300 hover:shadow-card">
            <Link href={`/articulos/${a.slug}`} aria-hidden tabIndex={-1} className="block">
              <Image
                src={imagenDe(a)}
                alt=""
                width={1536}
                height={1024}
                sizes="(max-width: 768px) 100vw, 768px"
                className="aspect-[2/1] w-full border-b border-slate-100 object-cover"
              />
            </Link>
            <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="rounded-full bg-aproba-50 px-2 py-0.5 font-semibold text-aproba-700">{a.tema}</span>
              <time dateTime={a.actualizado ?? a.fecha}>{fechaLarga(a.actualizado ?? a.fecha)}</time>
              <span>·</span>
              <span>{minutosDeLectura(a)} min de lectura</span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tightest text-slate-900">
              <Link href={`/articulos/${a.slug}`} className="transition hover:text-aproba-700">{a.titulo}</Link>
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{a.entradilla}</p>
            <Link href={`/articulos/${a.slug}`} className="mt-3 inline-block text-sm font-semibold text-aproba-700 hover:underline">
              Leer el artículo →
            </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-lg font-bold tracking-tightest text-slate-900">Aproba, para gestorías y abogados de extranjería</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          La IA valida los documentos, genera los formularios oficiales y vigila cada renovación.
        </p>
        <Link
          href="/signup?modo=prueba"
          className="mt-5 inline-block rounded-lg bg-aproba-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700"
        >
          Prueba 1 mes gratis
        </Link>
      </div>
    </>
  );
}
