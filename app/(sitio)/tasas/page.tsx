import type { Metadata } from "next";
import Link from "next/link";
import { TASAS_PAGINAS, rutaTasa, tramitesDeTasa } from "@/lib/tasas-paginas";

const BASE = "https://aproba-software.com";
const TITULO = "Tasas 790 de extranjería: las cinco que genera Aproba";
const DESCRIPCION = "790-012, 790-052, 790-062, 790-026 y 790-006 generadas con los datos del cliente sobre el impreso oficial. Y por qué la 790-038 no se genera.";

export const metadata: Metadata = {
  title: { absolute: TITULO }, description: DESCRIPCION,
  alternates: { canonical: "/tasas" },
  openGraph: { type: "website", url: "/tasas", siteName: "Aproba", locale: "es_ES", title: TITULO, description: DESCRIPCION, images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export default function TasasIndice() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${BASE}/tasas`, url: `${BASE}/tasas`, name: TITULO, description: DESCRIPCION, inLanguage: "es-ES",
        isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, name: "Aproba", url: BASE },
        hasPart: TASAS_PAGINAS.map((t) => ({ "@type": "WebPage", "@id": `${BASE}${rutaTasa(t)}`, url: `${BASE}${rutaTasa(t)}`, name: `${t.code} — ${t.titulo}` })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
        { "@type": "ListItem", position: 2, name: "Tasas", item: `${BASE}/tasas` },
      ] },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Migas de pan" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-800">Inicio</Link><span className="mx-1.5">/</span><span className="text-slate-700">Tasas</span>
      </nav>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-aproba-700">Tasas oficiales</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">Las tasas 790, con los datos ya puestos</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-600">Cinco modelos 790 salen del expediente con los datos que la IA ya leyó de los documentos del cliente, sobre el impreso oficial de cada Sede. En el expediente aparece la que corresponde al trámite; las demás no estorban.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {TASAS_PAGINAS.map((t) => {
          const ts = tramitesDeTasa(t.code);
          return (
            <Link key={t.code} href={rutaTasa(t)} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300">
              <p className="font-semibold text-slate-900">{t.code} <span className="font-normal text-slate-600">· {t.organismo}</span></p>
              <p className="mt-1 text-sm text-slate-500">{ts.length ? ts.map((x) => x.nombre).join(" · ") : "Se añade desde el selector del expediente"}</p>
            </Link>
          );
        })}
      </div>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <p className="font-semibold text-slate-900">La que no: la 790-038</p>
        <p className="mt-2 text-sm text-slate-600">La tasa de la Ley 14/2013 (movilidad internacional) no se genera desde Aproba: su impreso solo se obtiene identificándose con certificado digital o Cl@ve en la sede del Ministerio. Antes que producir algo que no sea el impreso válido, lo dejamos fuera y lo decimos. El resto del trámite —documentos y los tres modelos MI— sí sale de Aproba: está en <Link href="/tramites/movilidad-internacional" className="font-medium text-aproba-700 hover:underline">movilidad internacional</Link>.</p>
      </div>
    </>
  );
}
