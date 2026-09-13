import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArticuloCuerpo } from "@/components/articulo-cuerpo";
import { fechaLarga } from "@/lib/articulos";
import { BENEFICIOS, GRUPO_LABEL, beneficiosDe, getBeneficio, rutaDe, type Grupo } from "@/lib/beneficios";

const BASE = "https://aproba-software.com";

// Una página por tarjeta de la portada: «Qué significa», «Cómo podemos afirmarlo», «Lo
// que no incluye», preguntas y, al final, las demás tarjetas del mismo grupo (enlazado
// interno). Estática: se genera en build desde lib/beneficios.
export function paramsDe(grupo: Grupo) {
  return beneficiosDe(grupo).map((b) => ({ slug: b.slug }));
}

export async function metadataDe(grupo: Grupo, params: Promise<{ slug: string }>): Promise<Metadata> {
  const { slug } = await params;
  const b = getBeneficio(grupo, slug);
  if (!b) return { title: "Página no encontrada" };
  const ruta = rutaDe(b);
  return {
    title: { absolute: b.titulo },
    description: b.descripcion,
    alternates: { canonical: ruta },
    openGraph: { type: "article", url: ruta, siteName: "Aproba", locale: "es_ES", title: b.titulo, description: b.descripcion, modifiedTime: b.actualizado, images: [b.captura ? { url: `/beneficios/${b.slug}.jpg`, width: b.captura.w, height: b.captura.h, alt: b.captura.alt } : { url: "/og.png", width: 1200, height: 630, alt: "Aproba — automatiza tus expedientes de extranjería" }] },
    twitter: { card: "summary_large_image", title: b.titulo, description: b.descripcion, images: [b.captura ? `/beneficios/${b.slug}.jpg` : "/og.png"] },
  };
}

const GRUPO_TITULO: Record<Grupo, string> = { funciones: "Las demás funciones", cifras: "Las demás cifras de la portada", garantias: "Las demás garantías" };

export async function PaginaBeneficio({ grupo, params }: { grupo: Grupo; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = getBeneficio(grupo, slug);
  if (!b) notFound();
  const ruta = rutaDe(b);
  const otras = BENEFICIOS.filter((x) => x.grupo === grupo && x.slug !== b.slug);
  const limpiar = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "FAQPage", mainEntity: b.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: limpiar(f.a) } })) },
      { "@type": "WebPage", "@id": `${BASE}${ruta}`, url: `${BASE}${ruta}`, name: b.titulo, description: b.descripcion, inLanguage: "es-ES", dateModified: b.actualizado, publisher: { "@type": "Organization", name: "Aproba", url: BASE }, ...(b.captura ? { primaryImageOfPage: { "@type": "ImageObject", url: `${BASE}/beneficios/${b.slug}.jpg`, width: b.captura.w, height: b.captura.h } } : {}) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
        { "@type": "ListItem", position: 2, name: b.tarjeta, item: `${BASE}${ruta}` },
      ] },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Migas de pan" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-800">Inicio</Link>
        <span className="mx-1.5">/</span>
        <span>{GRUPO_LABEL[grupo]}</span>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{b.tarjeta}</span>
      </nav>

      <article className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-aproba-700">{GRUPO_LABEL[grupo]} · en la portada: «{b.tarjeta}»</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">{b.h1}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">{b.entradilla}</p>
        <p className="mt-2 text-xs text-slate-500">Actualizado el {fechaLarga(b.actualizado)}</p>

        {/* Captura real de Aproba (cuenta demo): una por página, priority porque es el
            elemento grande de la mitad superior (LCP). */}
        {b.captura && (
          <figure className="mt-8">
            <Image
              src={`/beneficios/${b.slug}.jpg`}
              alt={b.captura.alt}
              width={b.captura.w}
              height={b.captura.h}
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full rounded-2xl border border-slate-200 bg-white"
            />
            <figcaption className="mt-2 text-xs leading-relaxed text-slate-600">{b.captura.pie}</figcaption>
          </figure>
        )}

        <hr className="my-8 border-slate-200" />

        <ArticuloCuerpo bloques={[{ t: "h2", texto: "Qué significa" }, ...b.significa, { t: "h2", texto: "Cómo podemos afirmarlo" }, ...b.afirmamos, ...(b.limites ? [{ t: "h2" as const, texto: "Lo que no incluye" }, ...b.limites] : []), { t: "faq", items: b.faq }]} />

        {b.fuentes && b.fuentes.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Documentos citados</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {b.fuentes.map((f) => (
                <li key={f.url}><a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-aproba-700 underline decoration-aproba-300 underline-offset-2 hover:text-aproba-800">{f.nombre}</a></li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-lg font-bold tracking-tightest text-slate-900">Compruébalo con un expediente real</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">15 días gratis, sin tarjeta. Entras con un expediente de ejemplo ya resuelto para ver todo esto funcionando.</p>
        <Link href="/signup?modo=prueba" className="mt-5 inline-block rounded-lg bg-aproba-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">Prueba 15 días gratis</Link>
      </div>

      {otras.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{GRUPO_TITULO[grupo]}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {otras.map((o) => (
              <Link key={o.slug} href={rutaDe(o)} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300">
                <p className="font-semibold text-slate-900">{o.tarjeta}</p>
                <p className="mt-1 text-sm text-slate-500">{o.descripcion}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
