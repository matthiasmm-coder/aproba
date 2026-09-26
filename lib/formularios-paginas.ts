import type { Bloque } from "@/lib/articulos";
import type { PaginaPublica } from "@/lib/paginas";
import { TRAMITES, rutaTramite, type Tramite } from "@/lib/tramites-paginas";

// PÁGINAS DE MODELO OFICIAL (/formularios/<slug>, 20/09/2026): una por cada impreso que
// Aproba rellena — 27 modelos EX y los 3 MI de la Ley 14/2013.
//
// ⚠️ REGLAS:
//  · `nombre` es COPIA de FORM_LABEL (lib/ex-forms.ts) y el código debe existir en FORMS:
//    el test lib/formularios-paginas.test.ts lo comprueba. Si un modelo desaparece del
//    producto, su página deja de compilar el test.
//  · Los trámites de cada modelo se DERIVAN de lib/tramites-paginas: no se teclean.
//  · `queEs` describe el impreso, no el derecho: nada de requisitos, plazos ni bases
//    legales inventadas. Lo jurídico vive en los artículos, con sus fuentes.
//  · Lo que Aproba NO rellena se dice en todas: la casilla «Representante legal» de la
//    sección 1 (que es el padre/madre/tutor del extranjero, no el despacho) y el
//    «Domicilio a efectos de notificaciones», que decide quién recibe las notificaciones.

export type ModeloOficial = {
  code: string;
  slug: string;
  nombre: string;       // === FORM_LABEL[code]
  queEs: string;        // qué es el impreso, en una o dos frases
  nota?: string;        // particularidad real del modelo en Aproba
  menor?: boolean;      // el impreso tiene bloque de padre/madre/tutor
  corto?: string;       // variante del nombre para el <title> cuando el oficial no cabe
};

const M = (code: string, nombre: string, queEs: string, extra: Partial<ModeloOficial> = {}): ModeloOficial =>
  ({ code, slug: code.toLowerCase(), nombre, queEs, ...extra });

export const MODELOS: ModeloOficial[] = [
  M("EX-00", "Estancia de larga duración (estudios…)", "Solicitud de autorización de estancia y de su prórroga para estudios, movilidad de alumnos, prácticas no laborales o servicios de voluntariado.", { corto: "Estancia de larga duración" }),
  M("EX-01", "Residencia no lucrativa", "Solicitud de autorización de residencia temporal no lucrativa: residir en España sin trabajar, acreditando medios propios."),
  M("EX-02", "Reagrupación familiar", "Solicitud de autorización de residencia temporal por reagrupación familiar, que presenta el reagrupante por cada familiar."),
  M("EX-03", "Residencia y trabajo (cuenta ajena)", "Solicitud de autorización de residencia temporal y trabajo por cuenta ajena.", { corto: "Residencia y trabajo por cuenta ajena" }),
  M("EX-04", "Residencia para prácticas", "Solicitud de autorización de residencia temporal y trabajo para formación, prácticas o servicios de voluntariado."),
  M("EX-06", "Residencia y trabajo de temporada", "Solicitud de autorización de residencia temporal y trabajo de temporada o por campaña."),
  M("EX-07", "Residencia y trabajo por cuenta propia", "Solicitud de autorización de residencia temporal y trabajo por cuenta propia."),
  M("EX-09", "Residencia con excepción de trabajo", "Solicitud de autorización de residencia temporal con excepción de la autorización de trabajo."),
  M("EX-10", "Arraigo (clásico)", "Solicitud de autorización de residencia temporal por circunstancias excepcionales: el modelo con el que se vinieron pidiendo los arraigos antes del Reglamento de 2024."),
  M("EX-11", "Larga duración", "Solicitud de autorización de residencia de larga duración o de larga duración-UE, y su renovación."),
  M("EX-13", "Autorización de regreso", "Solicitud de autorización de regreso: permite salir de España y volver mientras se resuelve o se renueva la tarjeta.", { nota: "Es el modelo que más se pide a última hora, cuando el cliente ya tiene el billete. En Aproba sale del mismo expediente de la renovación, sin volver a teclear sus datos." }),
  M("EX-15", "NIE y certificados", "Solicitud de Número de Identidad de Extranjero (NIE) y de certificados: de residencia, de no residencia y de concordancia."),
  M("EX-17", "TIE", "Solicitud de Tarjeta de Identidad de Extranjero: la tarjeta física que documenta una autorización ya concedida, su renovación o su duplicado."),
  M("EX-16", "Cédula de inscripción / título de viaje", "Solicitud de cédula de inscripción o de título de viaje, para quien no puede ser documentado por las autoridades de ningún país.", { corto: "Cédula de inscripción o título de viaje" }),
  M("EX-18", "Registro/Residencia ciudadano UE", "Solicitud de inscripción en el Registro Central de Extranjeros del propio ciudadano de la Unión, del EEE o de Suiza.", { corto: "Registro de ciudadano de la UE" }),
  M("EX-19", "Tarjeta de familiar de ciudadano UE", "Solicitud de tarjeta de residencia de familiar de ciudadano de la Unión (RD 240/2007), y su renovación."),
  M("EX-20", "Documento art. 50 TUE (Reino Unido)", "Solicitud del documento de residencia previsto en el artículo 18.4 del Acuerdo de Retirada, para nacionales del Reino Unido."),
  M("EX-21", "Familiar de británico art. 50 TUE", "Solicitud del documento de residencia del Acuerdo de Retirada para el familiar de un nacional del Reino Unido."),
  M("EX-22", "Trabajador fronterizo del Reino Unido", "Solicitud del documento de trabajador fronterizo previsto en el Acuerdo de Retirada."),
  M("EX-23", "Tarjeta Acuerdo de Retirada (Brexit)", "Solicitud de la tarjeta de residencia del Acuerdo de Retirada, con la que se documentan británicos y familiares protegidos por el Acuerdo.", { corto: "Tarjeta del Acuerdo de Retirada" }),
  M("EX-24", "Familiar de persona española", "Solicitud de tarjeta de residencia de familiar de ciudadano español, al amparo del régimen comunitario."),
  M("EX-25", "Menores (residencia / desplazamiento)", "Solicitud referida a menores: residencia de hijos de residente legal y desplazamiento temporal de menores extranjeros.", { menor: true, corto: "Menores: residencia y desplazamiento" }),
  M("EX-26", "Modificación de autorización", "Solicitud de modificación de la situación: cambiar el tipo de autorización de residencia o de trabajo sin salir de España."),
  M("EX-28", "Disposición transitoria 2ª (RD 1155/2024)", "Solicitud al amparo de la disposición transitoria segunda del Reglamento de 2024, para las situaciones que venían del reglamento anterior.", { corto: "Disposición transitoria 2ª del RD 1155/2024" }),
  M("EX-29", "Prórroga de estancia de corta duración", "Solicitud de prórroga de estancia de corta duración, sin visado o con visado de estancia."),
  M("EX-31", "Arraigo (RD 1155/2024)", "Solicitud de residencia por arraigo conforme al Reglamento de 2024, que reordenó los arraigos en social, sociolaboral, familiar, socioformativo y de segunda oportunidad.", { menor: true }),
  M("EX-32", "Arraigo DA 21ª (RD 1155/2024)", "Solicitud de residencia por arraigo al amparo de la disposición adicional vigesimoprimera del Reglamento de 2024.", { menor: true }),
  M("MI-T", "Movilidad internacional · titular (Ley 14/2013)", "Solicitud del titular en el circuito de la Ley de Emprendedores: inversores, emprendedores, profesionales altamente cualificados, investigadores, traslados intraempresariales y teletrabajadores internacionales.", { corto: "Movilidad internacional · titular" }),
  M("MI-TIE", "Movilidad internacional · TIE (Ley 14/2013)", "Solicitud de la tarjeta de identidad del titular de una autorización de la Ley 14/2013.", { corto: "Movilidad internacional · TIE" }),
  M("MI-F", "Movilidad internacional · familiar (Ley 14/2013)", "Solicitud referida a los familiares del titular de una autorización de la Ley 14/2013.", { corto: "Movilidad internacional · familiar" }),
];

export const rutaModelo = (m: Pick<ModeloOficial, "slug">) => `/formularios/${m.slug}`;
export const getModelo = (slug: string) => MODELOS.find((m) => m.slug === slug);
export const tramitesDelModelo = (code: string): Tramite[] => TRAMITES.filter((t) => t.formularios.some((f) => f.code === code));

const A_REPRESENTANTE = { ruta: "/articulos/representante-formulario-ex-quien-va-en-cada-casilla", titulo: "Representante en el formulario EX: quién va en cada casilla" };
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

// Otros modelos (26/09/2026): los dos vecinos del listado y los que comparten trámite.
// Cada ficha recibe así enlaces de sus hermanas, no solo del índice /formularios (que
// era su único enlace y las dejaba en «Descubierta: sin indexar»). Vecinos primero, en
// círculo (el último enlaza al primero): así cada ficha recibe al menos dos enlaces.
export function otrosModelos(m: ModeloOficial): ModeloOficial[] {
  const n = MODELOS.length;
  const i = MODELOS.findIndex((x) => x.code === m.code);
  const vecinos = [MODELOS[(i - 1 + n) % n], MODELOS[(i + 1) % n]].map((x) => x.code);
  const hermanos = tramitesDelModelo(m.code).flatMap((t) => t.formularios.map((f) => f.code));
  return [...new Set([...vecinos, ...hermanos])]
    .filter((c) => c !== m.code)
    .map((c) => MODELOS.find((x) => x.code === c))
    .filter((x): x is ModeloOficial => Boolean(x))
    .slice(0, 6);
}

export function paginaDeModelo(m: ModeloOficial): PaginaPublica {
  const ts = tramitesDelModelo(m.code);
  const tasas = [...new Set(ts.flatMap((t) => t.tasas))];
  const esMI = m.code.startsWith("MI-");
  const bloques: Bloque[] = [
    { t: "datos", items: [
      { valor: m.code, etiqueta: "modelo oficial, rellenado con la ficha del cliente" },
      { valor: ts.length ? String(ts.length) : "—", etiqueta: ts.length === 1 ? "trámite del catálogo lo usa" : ts.length ? "trámites del catálogo lo usan" : "no está atado a un servicio por defecto" },
      { valor: tasas.length ? tasas.join(" · ") : "—", etiqueta: tasas.length ? "tasa del trámite" : "sin tasa asociada por defecto" },
      { valor: "Sí", etiqueta: "editable antes de imprimir, con la página 2 rellenada" },
    ] },
    { t: "p", texto: `**${m.code} — ${m.nombre}.** ${m.queEs}` },
    { t: "p", texto: ts.length
      ? `En Aproba sale del expediente: cuando el trámite es ${lista(ts.map((t) => `[${t.nombre.toLowerCase()}](${rutaTramite(t)})`))}, el ${m.code} aparece entre los modelos a generar con los datos ya validados del cliente.`
      : `En Aproba se elige desde el **selector de modelos** del expediente: no está atado a ningún servicio del catálogo por defecto, así que lo generas para el trámite que hayas configurado en Ajustes. Los datos salen igual de la ficha del cliente.` },
    { t: "h2", texto: "Qué rellena Aproba en este impreso" },
    { t: "ul", items: [
      "**Los datos del extranjero**, leídos de sus documentos validados: nombre y apellidos, documento, fecha y lugar de nacimiento, nacionalidad, domicilio y teléfono.",
      `**La página 2** — lugar, fecha y firmante — sobre el propio PDF, que es donde muchos despachos acaban escribiendo a mano.`,
      "**El bloque del despacho que presenta** («datos del representante a efectos de presentación de la solicitud»), con los datos de tu despacho y de la persona que firma.",
      ...(m.menor ? ["**El bloque de padre, madre o tutor**, cuando el solicitante es menor: es la casilla «representante legal» que el propio impreso reserva para él."] : []),
      ...(esMI ? ["**El circuito de la Ley 14/2013**: este modelo se presenta en la sede del Ministerio de Inclusión ante la Unidad de Grandes Empresas, no en la Oficina de Extranjería."] : []),
    ] },
    { t: "h2", texto: "Lo que Aproba deja en blanco a propósito" },
    { t: "p", texto: `Dos casillas no se rellenan solas, y es una decisión, no un olvido. La **«Representante legal, en su caso»** de la sección 1 es la del representante legal **del extranjero** — el padre, la madre o el tutor de un menor —, no la del despacho: ponerse ahí es un error corriente. Y el **«Domicilio a efectos de notificaciones»** decide quién recibe las notificaciones del expediente, con los plazos que eso arrastra: esa la decides tú, caso por caso. Está contado en [${A_REPRESENTANTE.titulo}](${A_REPRESENTANTE.ruta}).` },
    { t: "nota", titulo: "Quién presenta", texto: "Aproba rellena el impreso; la presentación la hace el profesional, con su certificado o su convenio. El modelo sale editable: se corrige antes de imprimir o de subirlo." },
    { t: "h2", texto: "Otros modelos" },
    { t: "ul", items: otrosModelos(m).map((o) => `[${o.code} · ${o.corto ?? o.nombre}](${rutaModelo(o)})`) },
    { t: "faq", items: [
      { q: `¿El ${m.code} sale rellenado o hay que teclearlo?`, a: "Sale rellenado con los datos que la IA leyó de los documentos del cliente y con los de tu despacho. Es editable: cualquier campo se corrige antes de imprimir." },
      ...(ts.length ? [{ q: `¿En qué trámite lo usa Aproba?`, a: `En ${lista(ts.map((t) => t.nombre.toLowerCase()))}. Si tu despacho lo usa en otro, lo añades desde el selector de modelos del expediente.` }] : [{ q: "¿Por qué no aparece solo en mi expediente?", a: "Porque no está asociado a ningún servicio del catálogo por defecto. Lo eliges en el selector de modelos del expediente, y si tu despacho lo usa a menudo, creas el servicio correspondiente en Ajustes." }]),
      ...(tasas.length ? [{ q: "¿Qué tasa lo acompaña?", a: `La ${lista(tasas)}, que Aproba también genera con los datos del cliente.` }] : []),
    ] },
  ];
  // El <title> lleva el nombre oficial entero; `corto` solo existe donde no cabía.
  const nombreCorto = m.corto ?? m.nombre;
  return {
    ruta: rutaModelo(m),
    titulo: `${m.code} · ${nombreCorto} | Aproba`,
    descripcion: `${m.code} — ${m.nombre}: qué es el impreso, en qué trámite lo usa un despacho y qué rellena Aproba con los datos validados del cliente.`.slice(0, 160),
    etiqueta: "Modelo oficial",
    h1: `Modelo ${m.code}: ${m.nombre}`,
    entradilla: `${m.queEs} Aquí, qué rellena Aproba en él, qué deja en blanco a propósito y en qué trámite encaja.`,
    actualizado: "2026-09-26",
    migas: [{ nombre: "Formularios", ruta: "/formularios" }, { nombre: m.code, ruta: rutaModelo(m) }],
    bloques,
    cta: { titulo: `Genera un ${m.code} con datos reales`, texto: "15 días gratis, sin tarjeta: la cuenta de prueba trae un expediente de ejemplo con sus documentos ya validados." },
    relacionadas: [...ts.map(rutaTramite), A_REPRESENTANTE.ruta, "/formularios", "/software-de-extranjeria"].slice(0, 4),
  };
}

export const PAGINAS_MODELOS: PaginaPublica[] = MODELOS.map(paginaDeModelo);
