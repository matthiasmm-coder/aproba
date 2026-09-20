import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { faqDePagina, PRECIOS, FRASE_DEFINICION } from "@/lib/paginas";
import { TODAS_LAS_PAGINAS, getPaginaPublica } from "@/lib/paginas-indice";
import { ARTICULOS } from "@/lib/articulos";
import { ArticuloCuerpo } from "@/components/articulo-cuerpo";
import { fechaLarga } from "@/lib/articulos";

const BASE = "https://aproba-software.com";

// PÁGINAS DE CATEGORÍA (/software-de-extranjeria, /precios, /para/*, /despegue,
// /que-es-aproba). Viven en el grupo (sitio), con la misma cabecera y el mismo pie que
// las páginas «beneficio explicado»: **la portada no cambia** — ni un enlace, ni una
// pestaña, ni un menú nuevo (regla de Matthias, 20/09/2026). Quien llega aquí viene de
// un buscador, no de la landing.
export async function metadataDePagina(ruta: string): Promise<Metadata> {
  const p = getPaginaPublica(ruta);
  if (!p) return { title: "Página no encontrada" };
  return {
    title: { absolute: p.titulo }, // ≤ 65 caracteres, sin el sufijo del layout raíz
    description: p.descripcion,
    alternates: { canonical: p.ruta },
    openGraph: { type: "website", url: p.ruta, siteName: "Aproba", locale: "es_ES", title: p.titulo, description: p.descripcion, images: [{ url: "/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: p.titulo, description: p.descripcion, images: ["/og.png"] },
  };
}

const limpiar = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

export function PaginaPublicaVista({ ruta }: { ruta: string }) {
  const p = getPaginaPublica(ruta);
  if (!p) notFound();
  const faq = faqDePagina(p);
  // «Seguir leyendo»: páginas de categoría, trámites, artículos (por su slug) y los dos índices.
  const relacionadas = (p.relacionadas ?? [])
    .map((r) => {
      if (r === "/articulos") return { ruta: r, h1: "Artículos sobre extranjería para despachos", descripcion: "Plazos, tasas, notificaciones y renovaciones, con las fuentes oficiales." };
      if (r === "/tramites") return { ruta: r, h1: "Los trámites, uno a uno", descripcion: "Qué pide Aproba al cliente, qué modelos y qué tasa genera en cada trámite." };
      if (r.startsWith("/articulos/")) { const a = ARTICULOS.find((x) => `/articulos/${x.slug}` === r); return a ? { ruta: r, h1: a.titulo, descripcion: a.descripcion } : undefined; }
      return getPaginaPublica(r);
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  // Datos estructurados: WebPage + migas + FAQ; en /precios, la aplicación con sus ofertas.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": `${BASE}${p.ruta}`, url: `${BASE}${p.ruta}`, name: p.titulo, description: p.descripcion,
        inLanguage: "es-ES", dateModified: p.actualizado,
        isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, name: "Aproba", url: BASE },
        about: { "@type": "SoftwareApplication", "@id": `${BASE}/#software`, name: "Aproba", applicationCategory: "BusinessApplication", description: FRASE_DEFINICION },
        publisher: { "@type": "Organization", "@id": `${BASE}/#org`, name: "Aproba", url: BASE },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
          ...p.migas.map((m, i) => ({ "@type": "ListItem", position: i + 2, name: m.nombre, item: `${BASE}${m.ruta}` })),
        ],
      },
      ...(faq.length ? [{ "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: limpiar(f.a) } })) }] : []),
      ...(p.ruta === "/precios" ? [{
        "@type": "SoftwareApplication", "@id": `${BASE}/#software`, name: "Aproba",
        applicationCategory: "BusinessApplication", operatingSystem: "Web", description: FRASE_DEFINICION, url: BASE,
        offers: [
          { "@type": "Offer", name: "Starter", price: String(PRECIOS.starter.mes), priceCurrency: "EUR", url: `${BASE}/precios`, description: `${PRECIOS.starter.expedientes} expedientes al mes, ${PRECIOS.starter.usuarios} usuario` },
          { "@type": "Offer", name: "Pro", price: String(PRECIOS.pro.mes), priceCurrency: "EUR", url: `${BASE}/precios`, description: `${PRECIOS.pro.expedientes} expedientes al mes, ${PRECIOS.pro.usuarios} usuarios` },
          { "@type": "Offer", name: "Business", price: String(PRECIOS.business.mes), priceCurrency: "EUR", url: `${BASE}/precios`, description: "Expedientes y usuarios ilimitados" },
        ],
      }] : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Migas de pan" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-800">Inicio</Link>
        {p.migas.map((m) => (
          <span key={m.ruta}><span className="mx-1.5">/</span><Link href={m.ruta} className="hover:text-slate-800">{m.nombre}</Link></span>
        ))}
      </nav>

      <article className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-aproba-700">{p.etiqueta}</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">{p.h1}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-600">{p.entradilla}</p>
        <p className="mt-2 text-xs text-slate-500">Actualizado el {fechaLarga(p.actualizado)}</p>
        <hr className="my-8 border-slate-200" />
        <ArticuloCuerpo bloques={p.bloques} />
      </article>

      {p.cta && (
        <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-lg font-bold tracking-tightest text-slate-900">{p.cta.titulo}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{p.cta.texto}</p>
          <Link href="/signup?modo=prueba" className="mt-5 inline-block rounded-lg bg-aproba-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700">
            Prueba {PRECIOS.pruebaDias} días gratis
          </Link>
        </div>
      )}

      {relacionadas.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Seguir leyendo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {relacionadas.map((r) => (
              <Link key={r.ruta} href={r.ruta} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300">
                <p className="font-semibold text-slate-900">{r.h1}</p>
                <p className="mt-1 text-sm text-slate-500">{r.descripcion}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export const rutasPublicas = () => TODAS_LAS_PAGINAS.map((p) => p.ruta);
