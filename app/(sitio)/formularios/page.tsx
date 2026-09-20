import type { Metadata } from "next";
import Link from "next/link";
import { MODELOS, rutaModelo, tramitesDelModelo } from "@/lib/formularios-paginas";

const BASE = "https://aproba-software.com";
const TITULO = "Formularios EX y MI que Aproba rellena: los 30 modelos";
const DESCRIPCION = "Los 27 modelos EX y los 3 modelos MI de la Ley 14/2013 que Aproba rellena con los datos validados del cliente, uno a uno y con su trámite.";

export const metadata: Metadata = {
  title: { absolute: TITULO }, description: DESCRIPCION,
  alternates: { canonical: "/formularios" },
  openGraph: { type: "website", url: "/formularios", siteName: "Aproba", locale: "es_ES", title: TITULO, description: DESCRIPCION, images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export default function FormulariosIndice() {
  const ex = MODELOS.filter((m) => m.code.startsWith("EX-"));
  const mi = MODELOS.filter((m) => m.code.startsWith("MI-"));
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${BASE}/formularios`, url: `${BASE}/formularios`, name: TITULO, description: DESCRIPCION, inLanguage: "es-ES",
        isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, name: "Aproba", url: BASE },
        hasPart: MODELOS.map((m) => ({ "@type": "WebPage", "@id": `${BASE}${rutaModelo(m)}`, url: `${BASE}${rutaModelo(m)}`, name: `${m.code} — ${m.nombre}` })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
        { "@type": "ListItem", position: 2, name: "Formularios", item: `${BASE}/formularios` },
      ] },
    ],
  };
  const tarjeta = (m: (typeof MODELOS)[number]) => {
    const ts = tramitesDelModelo(m.code);
    return (
      <Link key={m.code} href={rutaModelo(m)} className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-aproba-300">
        <p className="font-semibold text-slate-900">{m.code} <span className="font-normal text-slate-600">· {m.nombre}</span></p>
        <p className="mt-1 text-sm text-slate-500">{ts.length ? ts.map((t) => t.nombre).join(" · ") : "Se elige en el selector del expediente"}</p>
      </Link>
    );
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Migas de pan" className="text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-800">Inicio</Link><span className="mx-1.5">/</span><span className="text-slate-700">Formularios</span>
      </nav>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-aproba-700">Formularios oficiales</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">Los 30 modelos que Aproba rellena</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-600">Veintisiete modelos EX y los tres modelos MI de la Ley 14/2013, rellenados con los datos validados del cliente sobre el impreso oficial vigente, editables antes de imprimir y con la página 2 (lugar, fecha y firmante) completada.</p>
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-slate-400">Modelos EX ({ex.length})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{ex.map(tarjeta)}</div>
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-slate-400">Movilidad internacional · Ley 14/2013 ({mi.length})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{mi.map(tarjeta)}</div>
      <p className="mt-8 text-sm text-slate-500">Las tasas que acompañan a estos modelos están en <Link href="/tasas" className="font-medium text-aproba-700 hover:underline">las páginas de tasas</Link>, y el trámite completo, en <Link href="/tramites" className="font-medium text-aproba-700 hover:underline">trámites</Link>.</p>
    </>
  );
}
