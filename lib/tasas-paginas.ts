import type { Bloque } from "@/lib/articulos";
import type { PaginaPublica } from "@/lib/paginas";
import { TRAMITES, rutaTramite, type Tramite } from "@/lib/tramites-paginas";

// PÁGINAS DE TASA (/tasas/<código>, 20/09/2026): una por cada modelo 790 que Aproba
// genera, más la explicación de la única que NO genera (790-038).
//
// ⚠️ Lo que se afirma del MECANISMO sale del código que lo hace:
//  · 790-012 (Policía) y 790-052 / 790-062 (Delegaciones): la Sede no publica un PDF
//    descargable, hay sesión y CAPTCHA. Aproba conduce el generador oficial y enseña el
//    captcha al gestor, que lo teclea; el PDF que vuelve es el oficial, con código de
//    barras. Ver app/api/tasa790/descargar, lib/tasa790052.ts y lib/tasa790062.ts.
//  · 790-026 y 790-006 (Justicia): la Sede sirve el PDF directamente, con nº de
//    justificante único y SIN captcha; Aproba baja un ejemplar fresco y lo rellena.
//  · 790-038 (Ley 14/2013): su impreso exige certificado o Cl@ve en la sede del
//    Ministerio. Aproba NO la genera y lo dice.

export type TasaOficial = {
  code: string;
  slug: string;
  organismo: string;
  titulo: string;        // nombre oficial de la tasa
  para: string;          // para el h1: «Tasa 790-012: …»
  queEs: string;
  mecanismo: "captcha" | "directo";
  nota?: string;
};

export const TASAS_PAGINAS: TasaOficial[] = [
  {
    code: "790-012", slug: "790-012", organismo: "Policía Nacional",
    titulo: "Tasa por tramitación de documentos a ciudadanos extranjeros",
    para: "la tasa de la Policía",
    queEs: "Es la tasa de la Policía: la que acompaña al NIE, a la tarjeta de identidad de extranjero (TIE) y sus renovaciones, a los certificados de residencia y no residencia, a la autorización de regreso y a la documentación del régimen comunitario y del Acuerdo de Retirada.",
    mecanismo: "captcha",
  },
  {
    code: "790-052", slug: "790-052", organismo: "Delegaciones y Subdelegaciones del Gobierno",
    titulo: "Tramitación de autorizaciones de residencia y otra documentación a ciudadanos extranjeros",
    para: "la tasa de las autorizaciones de residencia",
    queEs: "Es la tasa de las Oficinas de Extranjería: autorizaciones iniciales de residencia, renovaciones, arraigos, reagrupación familiar, estudios, familiares de español y larga duración. Todo lo que no es de Policía ni de Justicia.",
    mecanismo: "captcha",
  },
  {
    code: "790-062", slug: "790-062", organismo: "Delegaciones y Subdelegaciones del Gobierno",
    titulo: "Tramitación de autorizaciones de trabajo a ciudadanos extranjeros",
    para: "la tasa de las autorizaciones de trabajo",
    queEs: "Es la otra mitad de la 052: la 052 paga la residencia y la 062 el trabajo — autorizaciones iniciales por cuenta ajena o propia, sus renovaciones, temporada y transfronterizos.",
    mecanismo: "captcha",
    nota: "En una autorización de residencia **y** trabajo por cuenta ajena se pagan las dos: la 052 la abona el trabajador y la 062, quien contrata. En el expediente se añaden ambas desde el selector de tasas.",
  },
  {
    code: "790-026", slug: "790-026", organismo: "Ministerio de Justicia",
    titulo: "Tasa por la solicitud de nacionalidad española por residencia",
    para: "la tasa de la nacionalidad española",
    queEs: "Es la tasa de la nacionalidad por residencia, que se tramita ante Justicia y no ante Extranjería.",
    mecanismo: "directo",
  },
  {
    code: "790-006", slug: "790-006", organismo: "Ministerio de Justicia",
    titulo: "Tasa por la expedición del certificado de antecedentes penales",
    para: "la tasa de los antecedentes penales",
    queEs: "Es la tasa del certificado de antecedentes penales, el documento que acompaña a media extranjería: arraigos, nacionalidad y buena parte de las renovaciones.",
    mecanismo: "directo",
    nota: "Hasta que Aproba la generó, este era el momento en que había que salir de la aplicación para volver a teclear los mismos datos en otra sede.",
  },
];

export const rutaTasa = (t: Pick<TasaOficial, "slug">) => `/tasas/${t.slug}`;
export const getTasaPagina = (slug: string) => TASAS_PAGINAS.find((t) => t.slug === slug);
export const tramitesDeTasa = (code: string): Tramite[] => TRAMITES.filter((t) => t.tasas.includes(code));

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

export function paginaDeTasa(t: TasaOficial): PaginaPublica {
  const ts = tramitesDeTasa(t.code);
  const bloques: Bloque[] = [
    { t: "datos", items: [
      { valor: t.code, etiqueta: "modelo oficial, generado con los datos del cliente" },
      { valor: t.organismo.includes("Justicia") ? "Justicia" : t.organismo.includes("Policía") ? "Policía" : "Extranjería", etiqueta: "organismo que la recauda" },
      { valor: ts.length ? String(ts.length) : "—", etiqueta: ts.length === 1 ? "trámite del catálogo la lleva" : ts.length ? "trámites del catálogo la llevan" : "se añade desde el selector" },
      { valor: t.mecanismo === "captcha" ? "Con captcha" : "Sin captcha", etiqueta: t.mecanismo === "captcha" ? "la Sede pide código de seguridad" : "la Sede sirve el PDF directamente" },
    ] },
    { t: "p", texto: `**${t.code} — ${t.titulo}** (${t.organismo}). ${t.queEs}` },
    ...(ts.length ? [{ t: "p", texto: `En el catálogo de Aproba la llevan ${lista(ts.map((x) => `[${x.nombre.toLowerCase()}](${rutaTramite(x)}))`.replace("))", ")")))}: al abrir el expediente, la tasa que toca sale sola y las demás no estorban.` } as Bloque] : []),
    { t: "h2", texto: "Cómo la genera Aproba" },
    ...(t.mecanismo === "captcha"
      ? [
          { t: "p", texto: `La Sede no publica un PDF descargable de la ${t.code}: hay que pasar por su generador, con sesión y **código de seguridad**. Aproba abre esa sesión, rellena todos los campos con los datos del expediente y te enseña el captcha de la Sede; lo tecleas tú y vuelve el **PDF oficial con su código de barras**, listo para pagar en el banco o por la pasarela.` } as Bloque,
          { t: "nota", titulo: "Por qué el captcha lo tecleas tú", texto: "Porque es lo correcto: el código de seguridad existe para que sea una persona quien pida el documento. Aproba hace el resto — la sesión, los campos, la provincia, el epígrafe — y deja el único paso que debe ser humano en tus manos." } as Bloque,
        ]
      : [
          { t: "p", texto: `La Sede de Justicia sirve el impreso **directamente**, con un número de justificante único por descarga y sin código de seguridad. Aproba baja un ejemplar nuevo para cada cliente y lo rellena: así el número de justificante siempre es válido y no se reutiliza jamás.` } as Bloque,
        ]),
    { t: "esquema", titulo: `De la ficha del cliente al impreso de la ${t.code}`, nodos: [
      { titulo: "Ficha", texto: "Los datos ya están: los leyó la IA de los documentos validados." },
      { titulo: "Expediente", texto: `La ${t.code} sale entre las tasas del trámite; las demás no aparecen.` },
      { titulo: t.mecanismo === "captcha" ? "Captcha" : "Descarga", texto: t.mecanismo === "captcha" ? "Tecleas el código que enseña la Sede." : "Aproba baja un ejemplar fresco, con su número único." },
    ], destino: { titulo: "Impreso oficial", texto: "Con sus tres copias y su número de justificante, guardado en el expediente." } },
    ...(t.nota ? [{ t: "p", texto: t.nota } as Bloque] : []),
    { t: "h2", texto: "Lo que Aproba no hace" },
    { t: "ul", items: [
      "**No paga la tasa.** Genera el impreso; el pago lo hace el cliente o el despacho, en el banco o por la pasarela de la Sede.",
      "**No decide el importe por ti.** El importe y el epígrafe son los del propio generador oficial en el momento de emitirlo.",
      "**No presenta el expediente.** La presentación es un acto del profesional, con su certificado.",
    ] },
    { t: "faq", items: [
      { q: "¿El impreso es el oficial?", a: t.mecanismo === "captcha" ? "Sí: el que devuelve la propia Sede, con su código de barras y su número de justificante. Aproba no dibuja un impreso parecido." : "Sí: es el PDF que sirve la Sede de Justicia, descargado en el momento, con su número de justificante único." },
      { q: "¿Se puede añadir a un expediente que no la lleva por defecto?", a: "Sí. En el expediente hay un selector de tasas: sale la que corresponde al trámite y añades otra cuando el caso lo pide." },
      { q: "¿Queda guardada?", a: "Sí, en el expediente del cliente, junto a sus documentos y sus formularios." },
    ] },
  ];
  return {
    ruta: rutaTasa(t),
    titulo: `Tasa ${t.code} rellenada con los datos del cliente | Aproba`.slice(0, 65),
    descripcion: `${t.code} (${t.organismo}): qué trámites la llevan y cómo la genera Aproba con los datos ya validados del expediente, sobre el impreso oficial.`.slice(0, 160),
    etiqueta: "Tasa oficial",
    h1: `Tasa ${t.code}: ${t.para}`,
    entradilla: `${t.queEs} Aquí, qué trámites la llevan y cómo sale del expediente sin volver a teclear los datos del cliente.`,
    actualizado: "2026-09-20",
    migas: [{ nombre: "Tasas", ruta: "/tasas" }, { nombre: t.code, ruta: rutaTasa(t) }],
    bloques,
    cta: { titulo: `Genera una ${t.code} de prueba`, texto: "15 días gratis, sin tarjeta, con un expediente de ejemplo ya resuelto." },
    relacionadas: [...ts.map(rutaTramite).slice(0, 2), "/tasas", "/software-de-extranjeria"],
  };
}

export const PAGINAS_TASAS: PaginaPublica[] = TASAS_PAGINAS.map(paginaDeTasa);
