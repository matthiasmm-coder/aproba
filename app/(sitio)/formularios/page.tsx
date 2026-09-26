import type { Metadata } from "next";
import Link from "next/link";
import { MODELOS, OFICIALES, rutaModelo, tramitesDelModelo } from "@/lib/formularios-paginas";
import { fechaLarga, type Bloque } from "@/lib/articulos";
import { ArticuloCuerpo } from "@/components/articulo-cuerpo";

// «¿Cuáles son los modelos oficiales de extranjería?» (26/09/2026): Google la muestra en
// «Otras preguntas» bajo «software de extranjería». La página responde primero a eso, con
// lo que publica el Ministerio (OFICIALES), y después dice cuáles rellena Aproba (MODELOS).
const BASE = "https://aproba-software.com";
const TITULO = "Modelos oficiales de extranjería: los EX y MI, uno a uno";
const DESCRIPCION = `Cuáles son los modelos oficiales de extranjería: los ${OFICIALES.ex.length} EX y los ${OFICIALES.mi.length} MI de la Ley 14/2013, para qué trámite es cada uno y cuáles rellena Aproba.`;

const RESPUESTA = `Son los impresos que publica el Ministerio de Inclusión, Seguridad Social y Migraciones para iniciar cada procedimiento. Hay dos series: los ${OFICIALES.ex.length} modelos EX, para los trámites de la Ley Orgánica 4/2000, y los ${OFICIALES.mi.length} modelos MI de la Ley 14/2013 de emprendedores. Aparte quedan los de contratación en origen y unos modelos de comunicaciones que son orientativos.`;

const FAQ: { q: string; a: string }[] = [
  { q: "¿Cuáles son los modelos oficiales de extranjería?", a: RESPUESTA },
  {
    q: "¿Dónde se descargan los modelos EX y MI?",
    a: "En la web del Ministerio de Inclusión, Seguridad Social y Migraciones, apartado «Modelos de solicitud»: los EX están en «Modelos generales» y los MI, en «Apoyo a emprendedores». Todos están en PDF editable e imprimible, y el propio Ministerio avisa de que la descarga del editable no funciona en todos los navegadores.",
  },
  {
    q: "¿Qué modelo corresponde a cada trámite?",
    a: "Lo decide el trámite: el [EX-03](/formularios/ex-03) es la residencia y trabajo por cuenta ajena; el [EX-02](/formularios/ex-02), la reagrupación familiar; el [EX-31](/formularios/ex-31), los arraigos del Reglamento de 2024, y el [EX-17](/formularios/ex-17), la TIE.",
  },
  {
    q: "¿La tasa se paga en el mismo impreso?",
    a: "No. La tasa va aparte, con su modelo 790: la [790-052](/tasas/790-052) es la de las oficinas de extranjería (autorizaciones de residencia, renovaciones, arraigos), la [790-062](/tasas/790-062) paga la autorización de trabajo y la [790-012](/tasas/790-012) es la de la Policía (NIE, TIE, certificados). La nacionalidad se paga ante Justicia, con la [790-026](/tasas/790-026).",
  },
  {
    q: "¿Son obligatorios los modelos de comunicaciones?",
    a: "No. Además de los modelos de solicitud, el Ministerio publica modelos de comunicaciones, como la declaración de entrada en España o la de escolarización de los menores a cargo, y los presenta como orientativos, no obligatorios.",
  },
];

const limpiar = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

export const metadata: Metadata = {
  title: { absolute: TITULO }, description: DESCRIPCION,
  alternates: { canonical: "/formularios" },
  openGraph: { type: "website", url: "/formularios", siteName: "Aproba", locale: "es_ES", title: TITULO, description: DESCRIPCION, images: [{ url: "/og.png", width: 1200, height: 630 }] },
};

export default function FormulariosIndice() {
  const ex = MODELOS.filter((m) => m.code.startsWith("EX-"));
  const mi = MODELOS.filter((m) => m.code.startsWith("MI-"));
  // Lo que Aproba no rellena, calculado: si un día rellena el que falta, la frase cambia sola.
  const exFuera = OFICIALES.ex.filter((c) => !ex.some((m) => m.code === c));
  const miFuera = OFICIALES.mi.filter((c) => !mi.some((m) => m.code === c));
  const cuales = (hechos: number, total: number, fuera: string[], serie: string) =>
    !fuera.length ? `todos los ${serie}` : `${hechos} de los ${total} ${serie} (todos menos ${fuera.length === 1 ? "el" : "los"} ${fuera.join(", ")})`;
  const datos: Bloque = {
    t: "datos",
    items: [
      { valor: String(OFICIALES.ex.length), etiqueta: "modelos EX, del EX-00 al EX-32 (hay números sin usar), para la Ley Orgánica 4/2000" },
      { valor: String(OFICIALES.mi.length), etiqueta: `modelos MI de la Ley 14/2013: ${OFICIALES.mi.join(", ")}` },
      { valor: "790", etiqueta: "la tasa no va en el impreso: se paga aparte, con su propio modelo" },
      { valor: String(MODELOS.length), etiqueta: "modelos que rellena Aproba con los datos validados del cliente" },
    ],
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${BASE}/formularios`, url: `${BASE}/formularios`, name: TITULO, description: DESCRIPCION, inLanguage: "es-ES", dateModified: OFICIALES.consultado,
        isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, name: "Aproba", url: BASE },
        hasPart: MODELOS.map((m) => ({ "@type": "WebPage", "@id": `${BASE}${rutaModelo(m)}`, url: `${BASE}${rutaModelo(m)}`, name: `${m.code} — ${m.nombre}` })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE },
        { "@type": "ListItem", position: 2, name: "Formularios", item: `${BASE}/formularios` },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: limpiar(f.a) } })) },
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
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-slate-900 sm:text-4xl">Modelos oficiales de extranjería</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate-600">{RESPUESTA}</p>
      <p className="mt-2 text-xs text-slate-500">
        Fuente: <a href={OFICIALES.fuente} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700">Ministerio de Inclusión, Seguridad Social y Migraciones, «Modelos de solicitud»</a>, consultado el {fechaLarga(OFICIALES.consultado)}.
      </p>
      <ArticuloCuerpo bloques={[datos]} />
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-slate-400">Los que rellena Aproba</h2>
      <p className="mt-3 leading-relaxed text-slate-600">
        Aproba rellena {cuales(ex.length, OFICIALES.ex.length, exFuera, "EX")} y {cuales(mi.length, OFICIALES.mi.length, miFuera, "MI")}, con los datos validados del cliente sobre el impreso oficial vigente, editables antes de imprimir y con la página 2 (lugar, fecha y firmante) completada.
      </p>
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-slate-400">Modelos EX ({ex.length})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{ex.map(tarjeta)}</div>
      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-slate-400">Movilidad internacional · Ley 14/2013 ({mi.length})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{mi.map(tarjeta)}</div>
      <p className="mt-8 text-sm text-slate-500">Las tasas que acompañan a estos modelos están en <Link href="/tasas" className="font-medium text-aproba-700 hover:underline">las páginas de tasas</Link>, y el trámite completo, en <Link href="/tramites" className="font-medium text-aproba-700 hover:underline">trámites</Link>.</p>
      <ArticuloCuerpo bloques={[{ t: "faq", items: FAQ }]} />
    </>
  );
}
