import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ARTICULOS, getArticulo, imagenDe, listaArticulos, minutosDeLectura, fechaLarga } from "@/lib/articulos";
import { ArticuloCuerpo } from "@/components/articulo-cuerpo";

const BASE = "https://aproba-software.com";

// Generación estática: los artículos no dependen de la petición, así que se sirven como
// HTML fijo (lo que quieren tanto el buscador como el lector).
export function generateStaticParams() {
  return ARTICULOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticulo(slug);
  if (!a) return { title: "Artículo no encontrado" };
  return {
    title: a.titulo,
    description: a.descripcion,
    alternates: { canonical: `/articulos/${a.slug}` },
    openGraph: {
      type: "article",
      url: `/articulos/${a.slug}`,
      title: a.titulo,
      description: a.descripcion,
      publishedTime: a.fecha,
      modifiedTime: a.actualizado ?? a.fecha,
      images: [{ url: imagenDe(a), width: 1536, height: 1024, alt: a.imagenAlt }],
    },
    twitter: { card: "summary_large_image", title: a.titulo, description: a.descripcion, images: [imagenDe(a)] },
  };
}

export default async function ArticuloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getArticulo(slug);
  if (!a) notFound();

  const otros = listaArticulos().filter((x) => x.slug !== a.slug).slice(0, 2);

  // Datos estructurados: Article + migas. Es lo que permite al buscador entender que
  // esto es un artículo con fecha y autor, y no una página de producto más.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: a.titulo,
        description: a.descripcion,
        image: [`${BASE}${imagenDe(a)}`],
        datePublished: a.fecha,
        dateModified: a.actualizado ?? a.fecha,
        inLanguage: "es-ES",
        mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/articulos/${a.slug}` },
        author: { "@type": "Organization", name: "Aproba", url: BASE },
        publisher: { "@type": "Organization", name: "Aproba", url: BASE },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
          { "@type": "ListItem", position: 2, name: "Artículos", item: `${BASE}/articulos` },
          { "@type": "ListItem", position: 3, name: a.titulo, item: `${BASE}/articulos/${a.slug}` },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Migas de pan" className="text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-600">Inicio</Link>
        <span className="mx-1.5">/</span>
        <Link href="/articulos" className="hover:text-slate-600">Artículos</Link>
      </nav>

      <article className="mt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="rounded-full bg-aproba-50 px-2 py-0.5 font-semibold text-aproba-700">{a.tema}</span>
          <time dateTime={a.fecha}>{fechaLarga(a.fecha)}</time>
          <span>·</span>
          <span>{minutosDeLectura(a)} min de lectura</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">{a.titulo}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">{a.entradilla}</p>
        {a.actualizado && (
          <p className="mt-2 text-xs text-slate-400">Actualizado el {fechaLarga(a.actualizado)}</p>
        )}

        {/* priority: es el elemento grande de la mitad superior — cargarla tarde
            penaliza el LCP, que es justo lo que mide el buscador. */}
        <Image
          src={imagenDe(a)}
          alt={a.imagenAlt}
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="mt-8 w-full rounded-2xl border border-slate-200"
        />

        <hr className="my-8 border-slate-200" />

        <ArticuloCuerpo bloques={a.bloques} />
      </article>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-lg font-bold tracking-tightest text-slate-900">Deja de perseguir documentos</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          Aproba valida los documentos con IA, genera los formularios oficiales y avisa de cada
          renovación antes de que venza. Para gestorías y abogados de extranjería.
        </p>
        <Link
          href="/signup?modo=prueba"
          className="mt-5 inline-block rounded-lg bg-aproba-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700"
        >
          Prueba 1 mes gratis
        </Link>
      </div>

      {otros.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Seguir leyendo</h2>
          <div className="mt-3 space-y-3">
            {otros.map((o) => (
              <Link
                key={o.slug}
                href={`/articulos/${o.slug}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300"
              >
                <p className="font-semibold text-slate-900">{o.titulo}</p>
                <p className="mt-1 text-sm text-slate-500">{o.descripcion}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
