import type { Metadata } from "next";
import Link from "next/link";
import { listaArticulos, imagenDe, minutosDeLectura, fechaLarga, textoPlano } from "@/lib/articulos";
import { ArticulosLista, type ArticuloIndice } from "@/components/articulos-lista";

// Cada página del índice es SU propia canónica (26/09/2026). Antes, ?p=2 y ?p=3 apuntaban
// a la página 1: para Google eran duplicados y sus enlaces pesaban poco, y 7 de los 12
// artículos solo se listan ahí.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ p?: string }> }): Promise<Metadata> {
  const { p } = await searchParams;
  // Misma paginación que components/articulos-lista (5 por página), acotada: ?p=99 enseña
  // la última página, así que su canónica es la de la última página.
  const total = Math.max(1, Math.ceil(listaArticulos().length / 5));
  const pagina = Math.min(Math.max(1, parseInt(p ?? "1", 10) || 1), total);
  const ruta = pagina > 1 ? `/articulos?p=${pagina}` : "/articulos";
  const sufijo = pagina > 1 ? ` · página ${pagina}` : "";
  return {
    title: `Artículos sobre extranjería para despachos${sufijo}`,
    description:
      "Plazos, volúmenes oficiales y práctica del despacho en trámites de extranjería en España. Artículos para gestorías y abogados, con las fuentes y las fechas.",
    alternates: { canonical: ruta },
    openGraph: {
      type: "website",
      url: ruta,
      title: "Artículos sobre extranjería para despachos · Aproba",
      description: "Plazos, volúmenes oficiales y práctica del despacho en trámites de extranjería en España.",
    },
  };
}

// Índice paginado (5 por página, del más reciente al más antiguo) con buscador. La
// página viene en ?p=N para que cada página tenga su URL; el buscador es local.
export default async function ArticulosIndex({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const pagina = Math.max(1, parseInt(p ?? "1", 10) || 1);
  const articulos: ArticuloIndice[] = listaArticulos().map((a) => ({
    slug: a.slug,
    titulo: a.titulo,
    entradilla: a.entradilla,
    descripcion: a.descripcion,
    tema: a.tema,
    fechaISO: a.actualizado ?? a.fecha,
    fechaLarga: fechaLarga(a.actualizado ?? a.fecha),
    minutos: minutosDeLectura(a),
    imagen: imagenDe(a),
    texto: textoPlano(a),
  }));
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tightest text-slate-900 sm:text-4xl">Artículos</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Plazos, volúmenes y errores de extranjería, vistos desde el trabajo real de un despacho. Con las cifras oficiales y su fecha.
      </p>

      <ArticulosLista articulos={articulos} pagina={pagina} />

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-lg font-bold tracking-tightest text-slate-900">Aproba, para gestorías y abogados de extranjería</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          La IA valida los documentos, genera los formularios oficiales y vigila cada renovación.
        </p>
        <Link
          href="/signup?modo=prueba"
          className="mt-5 inline-block rounded-lg bg-aproba-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700"
        >
          Prueba 15 días gratis
        </Link>
      </div>
    </>
  );
}
