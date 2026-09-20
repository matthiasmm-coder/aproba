import type { Metadata } from "next";
import Link from "next/link";
import { TRAMITES, rutaTramite } from "@/lib/tramites-paginas";

const BASE = "https://aproba-software.com";
const TITULO = "Trámites de extranjería con Aproba: documentos, modelos y tasas";
const DESCRIPCION = "Los once trámites del catálogo, uno a uno: qué documentos pide Aproba al cliente, qué modelos EX rellena, qué tasa genera y ante quién se presenta.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/tramites" },
  openGraph: { type: "website", url: "/tramites", siteName: "Aproba", locale: "es_ES", title: TITULO, description: DESCRIPCION, images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

// Índice de trámites: una tarjeta por página, con lo que la distingue (modelos y tasa).
export default function TramitesIndice() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${BASE}/tramites`, url: `${BASE}/tramites`, name: TITULO, description: DESCRIPCION, inLanguage: "es-ES",
        isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, name: "Aproba", url: BASE },
        hasPart: TRAMITES.map((t) => ({ "@type": "WebPage", "@id": `${BASE}${rutaTramite(t)}`, url: `${BASE}${rutaTramite(t)}`, name: t.titulo })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
        { "@type": "ListItem", position: 2, name: "Trámites", item: `${BASE}/tramites` },
      ] },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Migas de pan" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-800">Inicio</Link><span className="mx-1.5">/</span><span className="text-slate-700">Trámites</span>
      </nav>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-aproba-700">Trámites</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">Los trámites, uno a uno</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-600">Para cada trámite del catálogo: qué pide Aproba al cliente, qué modelos oficiales rellena, qué tasa genera y ante quién se presenta. Escrito para el despacho, con los plazos del Reglamento donde los hay.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {TRAMITES.map((t) => (
          <Link key={t.slug} href={rutaTramite(t)} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300">
            <p className="font-semibold text-slate-900">{t.nombre}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t.formularios.length ? t.formularios.map((f) => f.code).join(", ") : "Sin modelo EX"}
              {t.tasas.length ? ` · tasa ${t.tasas.join(", ")}` : ""}
              {t.plazo ? ` · ${t.plazo.meses}, silencio ${t.plazo.silencio.toLowerCase()}` : ""}
            </p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-slate-500">¿Tu despacho ofrece un trámite que no está aquí? El catálogo es tuyo: en Ajustes creas el servicio con su lista de documentos y sus tarifas, y el portal lo pide igual.</p>
    </>
  );
}
