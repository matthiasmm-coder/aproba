import type { Bloque } from "@/lib/articulos";
import type { PaginaPublica } from "@/lib/paginas";

// PÁGINAS DE TRÁMITE (/tramites/<slug>, 20/09/2026): una por servicio del catálogo por
// defecto (lib/servicios.ts). Escritas PARA EL DESPACHO — qué pide Aproba al cliente, qué
// modelos y qué tasa genera, cómo va el recorrido — no para el migrante.
//
// ⚠️ REGLAS:
//  · `docs`, `formularios` y `tasas` son COPIA de lo que hace el producto (DEFAULT_SERVICIOS,
//    SERVICIO_FORMS/TRAMITE_FORMS de lib/ex-forms.ts, SERVICIO_TASAS de lib/tasas.ts). El
//    test lib/tramites-paginas.test.ts falla si se separan: aquí no se inventa nada.
//  · Los plazos de resolución y su base legal vienen del artículo «Silencio administrativo
//    en extranjería» (RD 1155/2024), que lleva las fuentes. Los trámites sin fila en ese
//    artículo NO llevan plazo: mejor callar que estimar.
//  · Nada de lo que no exista hoy en el producto (ni WhatsApp de plataforma, ni VeriFactu).

export type Tramite = {
  slug: string;
  servicioId: string;      // clave en DEFAULT_SERVICIOS
  tipoEnum?: string;       // TipoTramite del enum, si lo tiene (para el repli de modelos/tasas)
  nombre: string;          // nombre corto («Arraigo social»)
  titulo: string;          // <title> ≤ 65
  descripcion: string;     // meta ≤ 160
  h1: string;
  entradilla: string;
  docs: string[];
  formularios: { code: string; nombre: string }[];
  tasas: string[];
  organismo: string;       // ante quién se presenta
  plazo?: { meses: string; silencio: "Positivo" | "Negativo"; base: string };
  produceTarjeta: boolean; // ¿acaba en una TIE con caducidad? → Renovaciones la vigila
  intro: string[];         // 2 párrafos
  particular: string[];    // lo específico de este trámite en Aproba (3-4)
  faq: { q: string; a: string }[];
  articulo?: { ruta: string; titulo: string };
  relacionados: string[];  // slugs de otros trámites
};

const ORG_POLICIA = "Comisaría de Policía (Oficina de Extranjería de la Policía Nacional), con cita";
const ORG_EXTRANJERIA = "Oficina de Extranjería de la Delegación o Subdelegación del Gobierno";
const ORG_JUSTICIA = "Ministerio de Justicia (Registro Civil), por vía telemática";
const ORG_UGE = "Unidad de Grandes Empresas del Ministerio de Inclusión (sede electrónica)";

const A_SILENCIO = { ruta: "/articulos/silencio-administrativo-extranjeria-plazos-2026", titulo: "Silencio administrativo en extranjería: el plazo de cada trámite" };
const A_RENOV = { ruta: "/articulos/renovaciones-2027-regularizacion-extraordinaria", titulo: "La ola de renovaciones de 2027: qué viene y cómo prepararla" };
const A_NACIONALIDAD = { ruta: "/articulos/nacionalidad-por-residencia-plazos-tasas-2026", titulo: "Nacionalidad por residencia en 2026: plazos, tasas y atascos" };
const A_ERRORES = { ruta: "/articulos/errores-documentales-retrasan-expediente-extranjeria", titulo: "Siete errores documentales que retrasan un expediente de extranjería" };
const A_REPRESENTANTE = { ruta: "/articulos/representante-formulario-ex-quien-va-en-cada-casilla", titulo: "Representante en el formulario EX: quién va en cada casilla" };

export const TRAMITES: Tramite[] = [
  {
    slug: "arraigo-social", servicioId: "arraigo_social", tipoEnum: "ARRAIGO_SOCIAL",
    nombre: "Arraigo social",
    titulo: "Arraigo social: documentos, EX-10 y tasa 790-052 | Aproba",
    descripcion: "El arraigo social con Aproba: los documentos que pide al cliente, los modelos EX-10, EX-31 y EX-32 rellenados, la tasa 790-052 y el plazo de resolución.",
    h1: "Arraigo social: cómo lo tramita un despacho con Aproba",
    entradilla: "El arraigo es el trámite de circunstancias excepcionales más frecuente en un despacho: muchos documentos, un cliente que suele hablar poco español y un expediente que no admite errores de forma. Esto es lo que Aproba hace en cada paso.",
    docs: ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo", "Antecedentes penales"],
    formularios: [{ code: "EX-10", nombre: "Arraigo (modelo clásico)" }, { code: "EX-31", nombre: "Arraigo (RD 1155/2024)" }, { code: "EX-32", nombre: "Arraigo DA 21.ª (RD 1155/2024)" }],
    tasas: ["790-052"], organismo: ORG_EXTRANJERIA,
    plazo: { meses: "3 meses", silencio: "Negativo", base: "RD 1155/2024, arts. 124-132" },
    produceTarjeta: true,
    intro: [
      "El **arraigo social** es una autorización de residencia por circunstancias excepcionales: se pide desde España, sin visado previo, acreditando permanencia y vínculos. Con el Reglamento de 2024 los arraigos se reordenaron (social, sociolaboral, familiar, socioformativo y de segunda oportunidad) y los modelos oficiales cambiaron con ellos.",
      "Para el despacho, el arraigo es sobre todo un problema de **documentos**: el empadronamiento histórico, el contrato, los antecedentes penales del país de origen legalizados y traducidos. Aproba no decide si el cliente cumple los requisitos — eso es tu trabajo —, pero se ocupa de que todo llegue, se lea y acabe en el impreso correcto.",
    ],
    particular: [
      "**Tres modelos, no uno.** Aproba genera el EX-10 clásico y los dos modelos del Reglamento de 2024 (EX-31 y EX-32, este último para la disposición adicional 21.ª). Eliges el que corresponde al supuesto y sale rellenado con la ficha del cliente.",
      "**Antecedentes penales en la lista.** Es el documento que más veces llega mal (sin legalizar, sin traducir, caducado). En el portal aparece como casilla propia, con su ayuda, y la IA lee la fecha de expedición.",
      "**Contrato de trabajo.** La IA reconoce el contrato como tal y lo coloca en su casilla; los datos del empleador quedan a mano para el formulario.",
      "**Si el arraigo se concede, empieza otra cuenta atrás.** La TIE que resulta tiene caducidad: Aproba la registra y te propone la renovación a tiempo desde la vista Renovaciones.",
    ],
    faq: [
      { q: "¿Qué modelo EX usa Aproba para el arraigo social?", a: "Los tres que existen hoy: EX-10 (modelo clásico), EX-31 (arraigo según el RD 1155/2024) y EX-32 (disposición adicional 21.ª). Salen rellenados con los datos validados del cliente y se pueden editar antes de imprimir." },
      { q: "¿Y la tasa?", a: "La 790-052 (autorizaciones de residencia), generada con los datos del cliente. Se paga antes de presentar; el justificante se adjunta al expediente." },
      { q: "¿Cuánto tarda la Administración en resolver?", a: "Tres meses desde la entrada en registro, con silencio negativo (RD 1155/2024, arts. 124-132). Los detalles y las excepciones están en el artículo sobre el silencio administrativo." },
    ],
    articulo: A_SILENCIO, relacionados: ["arraigo-laboral", "renovacion-tie", "reagrupacion-familiar"],
  },
  {
    slug: "arraigo-laboral", servicioId: "arraigo_laboral", tipoEnum: "ARRAIGO_LABORAL",
    nombre: "Arraigo laboral",
    titulo: "Arraigo laboral (sociolaboral): documentos y modelos EX | Aproba",
    descripcion: "El arraigo laboral —hoy sociolaboral en el RD 1155/2024— tramitado con Aproba: vida laboral, empadronamiento, antecedentes, modelos EX-10/31/32 y tasa 790-052.",
    h1: "Arraigo laboral: cómo lo tramita un despacho con Aproba",
    entradilla: "El arraigo laboral —arraigo sociolaboral desde el Reglamento de 2024— se apoya en la relación laboral previa. El documento clave es el informe de vida laboral, y la dificultad, demostrar lo que muchas veces no se declaró.",
    docs: ["Pasaporte", "Informe de vida laboral", "Certificado de empadronamiento", "Antecedentes penales"],
    formularios: [{ code: "EX-10", nombre: "Arraigo (modelo clásico)" }, { code: "EX-31", nombre: "Arraigo (RD 1155/2024)" }, { code: "EX-32", nombre: "Arraigo DA 21.ª (RD 1155/2024)" }],
    tasas: ["790-052"], organismo: ORG_EXTRANJERIA,
    plazo: { meses: "3 meses", silencio: "Negativo", base: "RD 1155/2024, arts. 124-132" },
    produceTarjeta: true,
    intro: [
      "El **arraigo laboral** — que el RD 1155/2024 recoge como **arraigo sociolaboral** — es la vía para quien acredita una relación de trabajo en España. En el catálogo de Aproba el servicio conserva el nombre con el que lo busca el cliente, «Arraigo laboral»; tú puedes renombrarlo en Ajustes.",
      "El expediente vive del **informe de vida laboral** y de la prueba de la relación (contratos, nóminas, resoluciones). Aproba pide lo básico por defecto y tú añades a la lista lo que exija el caso concreto: la lista del portal es tuya.",
    ],
    particular: [
      "**Vida laboral como casilla propia.** El informe de la Seguridad Social se reconoce al subirlo y queda en su sitio; si el cliente sube una captura ilegible, se le pide otra en su idioma.",
      "**Los mismos tres modelos que el arraigo social** (EX-10, EX-31, EX-32): el supuesto lo marcas tú al generar.",
      "**Documentos que no están en la lista por defecto** — contratos antiguos, nóminas, una resolución judicial — se añaden desde la ficha del expediente o el propio cliente los sube como «otros documentos»: nada se pierde por no tener casilla.",
    ],
    faq: [
      { q: "¿Aproba distingue el arraigo laboral del sociolaboral?", a: "El servicio se llama «Arraigo laboral» por defecto porque es como lo nombra el cliente. Los modelos son los del Reglamento vigente (EX-31 y EX-32) además del EX-10; el nombre del servicio lo cambias en Ajustes si prefieres el término del Reglamento." },
      { q: "¿Qué pasa si el cliente no tiene vida laboral?", a: "Aproba no valora los requisitos: te enseña qué ha subido y qué falta. Si el caso se sostiene con otras pruebas, las añades a la lista del expediente y el portal se las pide al cliente." },
      { q: "¿Plazo de resolución?", a: "Tres meses, silencio negativo, como el resto de arraigos (RD 1155/2024, arts. 124-132)." },
    ],
    articulo: A_SILENCIO, relacionados: ["arraigo-social", "modificacion-autorizacion", "renovacion-tie"],
  },
  {
    slug: "renovacion-tie", servicioId: "renovacion_tie", tipoEnum: "RENOVACION",
    nombre: "Renovación de TIE",
    titulo: "Renovación de TIE: EX-17, tasa 790-012 y aviso a tiempo | Aproba",
    descripcion: "Renovar la TIE con Aproba: caducidad vigilada, aviso al cliente en su idioma, EX-17 y EX-13 rellenados, tasa 790-012 y tres meses con silencio positivo.",
    h1: "Renovación de TIE: cómo la tramita un despacho con Aproba",
    entradilla: "La renovación es el trámite que más se repite y el que más se olvida: la ventana se abre dos meses antes de la caducidad y el cliente rara vez la tiene en la cabeza. Aproba la tiene por él.",
    docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"],
    formularios: [{ code: "EX-17", nombre: "Tarjeta de identidad de extranjero (TIE)" }, { code: "EX-13", nombre: "Autorización de regreso" }],
    tasas: ["790-012"], organismo: ORG_POLICIA,
    plazo: { meses: "3 meses", silencio: "Positivo", base: "RD 1155/2024, arts. 80-81" },
    produceTarjeta: true,
    intro: [
      "La **renovación de la TIE** empieza antes de que el cliente lo sepa: la solicitud se admite desde **dos meses antes** de la caducidad y hasta tres meses después, con posible sanción. En 2027 llegan además, todas a la vez, las renovaciones de la regularización extraordinaria de 2026.",
      "Aproba trata la renovación como lo que es: un expediente que nace de una fecha. Cada TIE validada deja su caducidad en la vista **Renovaciones**; cuando toca, propones la renovación con un clic y el cliente recibe el aviso en su idioma. Si acepta, el expediente pasa a «En curso» con los datos que ya tenía.",
    ],
    particular: [
      "**La fecha la lee la IA.** Al validar la TIE del cliente, la caducidad queda registrada sin teclearla: es lo que alimenta el radar de renovaciones.",
      "**Propuesta con un clic.** Desde Renovaciones eliges el servicio, y el cliente recibe el enlace para aceptar o rechazar; hasta que acepta, el expediente no ensucia tu lista de trabajo.",
      "**EX-17 y EX-13.** Además del modelo de la tarjeta, Aproba rellena la autorización de regreso para el cliente que tiene que viajar mientras la renovación se resuelve.",
      "**Silencio positivo.** Si la Administración no contesta en tres meses, la renovación se entiende concedida; el artículo enlazado explica el certificado de silencio.",
    ],
    faq: [
      { q: "¿Cómo sabe Aproba cuándo caduca la tarjeta?", a: "Porque la leyó al validar el documento. La fecha va a la ficha del cliente y a la vista Renovaciones, que separa lo ya caducado, lo urgente y lo que puede esperar." },
      { q: "¿El cliente puede aceptar la renovación desde el móvil?", a: "Sí. Recibe un email en su idioma con el servicio y el precio, y acepta o rechaza en su portal. Aceptar crea el expediente en «En curso» con sus datos ya cargados." },
      { q: "¿Qué tasa lleva?", a: "La 790-012 (Policía), generada con los datos del cliente." },
    ],
    articulo: A_RENOV, relacionados: ["residencia-larga-duracion", "modificacion-autorizacion", "arraigo-social"],
  },
  {
    slug: "reagrupacion-familiar", servicioId: "reagrupacion", tipoEnum: "REAGRUPACION",
    nombre: "Reagrupación familiar",
    titulo: "Reagrupación familiar: documentos, EX-02 y tasa 790-052 | Aproba",
    descripcion: "La reagrupación familiar tramitada con Aproba: vivienda, medios, libro de familia, el EX-02 rellenado con la ficha, la tasa 790-052 y el plazo de dos meses.",
    h1: "Reagrupación familiar: cómo la tramita un despacho con Aproba",
    entradilla: "La reagrupación junta dos expedientes en uno: el del reagrupante, que debe demostrar vivienda y medios, y el del familiar, que llegará después. Aproba lleva a la familia entera en un solo sitio.",
    docs: ["Pasaporte", "Libro de familia", "Justificante de vivienda", "Justificante de medios económicos"],
    formularios: [{ code: "EX-02", nombre: "Reagrupación familiar" }],
    tasas: ["790-052"], organismo: ORG_EXTRANJERIA,
    plazo: { meses: "2 meses", silencio: "Negativo", base: "RD 1155/2024, arts. 65-68" },
    produceTarjeta: true,
    intro: [
      "La **reagrupación familiar** permite al residente traer a su cónyuge, hijos o ascendientes. El expediente lo presenta el reagrupante en España; el familiar pide después el visado en el consulado y, al llegar, su tarjeta.",
      "Es el trámite donde Aproba usa la **familia** como unidad: los miembros comparten los documentos comunes (libro de familia, vivienda, medios) y cada uno tiene los suyos. Una sola factura, un solo portal, y cada familiar con su ficha.",
    ],
    particular: [
      "**Expediente familiar.** Creas la familia, añades a cada miembro y el portal pide a cada uno solo lo que le toca; lo común se sube una vez.",
      "**EX-02 por familiar.** El modelo se rellena para cada persona reagrupada con sus datos y los del reagrupante, incluida la casilla del representante si actúa el despacho.",
      "**Medios y vivienda como casillas.** El informe de vivienda y los justificantes de ingresos tienen su sitio; la IA los reconoce y te avisa si falta uno.",
      "**Precio por miembro.** Si tu tarifa es por persona, Aproba multiplica en el presupuesto, en la hoja de encargo y en la factura, sin cálculos a mano.",
    ],
    faq: [
      { q: "¿Se puede tramitar a varios familiares a la vez?", a: "Sí. Aproba tiene un expediente familiar: documentos compartidos, un miembro por ficha y un EX-02 por reagrupado." },
      { q: "¿Qué plazo tiene la Administración?", a: "Dos meses para la autorización inicial, con silencio negativo (RD 1155/2024, arts. 65-68)." },
      { q: "¿Y después de la concesión?", a: "El familiar pide el visado en el consulado y, al entrar, su TIE. Esa tarjeta tendrá caducidad, y Aproba la vigilará como cualquier otra." },
    ],
    articulo: A_REPRESENTANTE, relacionados: ["renovacion-tie", "familiar-ciudadano-ue", "arraigo-social"],
  },
  {
    slug: "nacionalidad-espanola", servicioId: "nacionalidad", tipoEnum: "NACIONALIDAD",
    nombre: "Nacionalidad española",
    titulo: "Nacionalidad por residencia: documentos y tasa 790-026 | Aproba",
    descripcion: "La nacionalidad por residencia con Aproba: pasaporte, nacimiento, empadronamiento y antecedentes en el portal, la tasa 790-026 generada y un plazo de un año.",
    h1: "Nacionalidad española: cómo la tramita un despacho con Aproba",
    entradilla: "La nacionalidad por residencia no lleva modelo EX: se presenta en Justicia, por vía telemática, y su cuello de botella son los certificados extranjeros y un plazo de resolución de un año que en la práctica se alarga.",
    docs: ["Pasaporte", "Certificado de nacimiento", "Certificado de empadronamiento", "Antecedentes penales"],
    formularios: [],
    tasas: ["790-026"], organismo: ORG_JUSTICIA,
    plazo: { meses: "1 año", silencio: "Negativo", base: "RD 1004/2015, art. 11" },
    produceTarjeta: false,
    intro: [
      "La **nacionalidad por residencia** exige, según el caso, de uno a diez años de residencia legal y continuada, además de los exámenes DELE y CCSE. No se presenta en Extranjería sino ante el **Ministerio de Justicia**, y no lleva formulario EX.",
      "Donde Aproba ayuda es antes: en recoger certificados que llegan de otro país, legalizados y traducidos, y en no perder de vista un expediente que puede durar más de un año. La tasa 790-026 sale generada con los datos del cliente.",
    ],
    particular: [
      "**Sin EX, con tasa.** Aproba genera la 790-026 de Justicia; no hay modelo de solicitud que rellenar porque el trámite es telemático.",
      "**Certificados de origen.** Nacimiento y antecedentes penales del país de origen son las casillas críticas: la IA lee fechas de expedición y te avisa si un certificado ya no vale.",
      "**Un expediente largo.** Los avisos automáticos al cliente («presentado», «resolución») evitan el «¿cómo va lo mío?» durante los meses de espera.",
    ],
    faq: [
      { q: "¿Aproba presenta la solicitud en Justicia?", a: "No. Prepara el expediente — documentos validados, tasa generada, hoja de encargo firmada — y lo presentas tú con tu certificado, como en cualquier trámite." },
      { q: "¿Qué plazo tiene la Administración?", a: "Un año, con silencio negativo (RD 1004/2015, art. 11). El artículo sobre nacionalidad detalla los atascos reales de 2026." },
      { q: "¿Sirve la misma ficha del cliente que en su renovación?", a: "Sí. La ficha es una: lo que la IA leyó del pasaporte al renovar la TIE ya está para la nacionalidad." },
    ],
    articulo: A_NACIONALIDAD, relacionados: ["residencia-larga-duracion", "renovacion-tie", "reagrupacion-familiar"],
  },
  {
    slug: "residencia-larga-duracion", servicioId: "larga_duracion", tipoEnum: "RESIDENCIA_LARGA",
    nombre: "Residencia de larga duración",
    titulo: "Residencia de larga duración: EX-11 y tasa 790-052 | Aproba",
    descripcion: "La larga duración con Aproba: TIE actual, empadronamiento y medios en el portal, el EX-11 rellenado, la tasa 790-052 y silencio positivo a los tres meses.",
    h1: "Residencia de larga duración: cómo la tramita un despacho con Aproba",
    entradilla: "Tras cinco años de residencia legal, la larga duración libera al cliente de renovar cada dos años. Es un expediente sencillo en documentos y exigente en fechas: el cómputo de los cinco años.",
    docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"],
    formularios: [{ code: "EX-11", nombre: "Residencia de larga duración" }],
    tasas: ["790-052"], organismo: ORG_EXTRANJERIA,
    plazo: { meses: "3 meses", silencio: "Positivo", base: "RD 1155/2024, arts. 182-185" },
    produceTarjeta: true,
    intro: [
      "La **residencia de larga duración** se concede a quien acredita cinco años de residencia legal y continuada. La tarjeta que resulta sigue teniendo caducidad — se renueva cada cinco años —, pero la autorización ya es indefinida.",
      "El expediente pide poco: la TIE vigente, el empadronamiento y los medios. Lo delicado es el historial: Aproba conserva las TIE anteriores validadas en la ficha, con sus fechas, y eso es exactamente lo que hay que acreditar.",
    ],
    particular: [
      "**El historial de tarjetas ya está.** Si el cliente renovó con Aproba, sus TIE anteriores están validadas con fecha: el cómputo de los cinco años se lee de la ficha.",
      "**EX-11 rellenado**, con el representante si actúa el despacho, y la 790-052 generada.",
      "**Silencio positivo** a los tres meses: el artículo enlazado explica cómo pedir el certificado.",
      "**La nueva tarjeta también caduca.** Aproba registra su fecha y, cuando toque, la vigila en Renovaciones como cualquier otra.",
    ],
    faq: [
      { q: "¿Larga duración o nacionalidad?", a: "Son trámites distintos y compatibles: la larga duración es una autorización de residencia; la nacionalidad, un cambio de estatus ante Justicia. Aproba lleva ambos con la misma ficha del cliente." },
      { q: "¿Qué plazo tiene?", a: "Tres meses, con silencio positivo (RD 1155/2024, arts. 182-185)." },
      { q: "¿Qué documentos pide el portal?", a: "La TIE actual, el certificado de empadronamiento y el justificante de medios económicos, por defecto. La lista se ajusta por expediente." },
    ],
    articulo: A_SILENCIO, relacionados: ["renovacion-tie", "nacionalidad-espanola", "modificacion-autorizacion"],
  },
  {
    slug: "asignacion-nie", servicioId: "nie", tipoEnum: "NIE",
    nombre: "Asignación de NIE",
    titulo: "Asignación de NIE: EX-15 y tasa 790-012 en un clic | Aproba",
    descripcion: "El NIE con Aproba: pasaporte validado por IA, EX-15 rellenado, tasa 790-012 generada y la cita en Policía en el expediente. El trámite más corto, sin errores.",
    h1: "Asignación de NIE: cómo lo tramita un despacho con Aproba",
    entradilla: "El NIE es el trámite más corto del catálogo y, por eso mismo, el que menos tolera una mañana perdida: un pasaporte, un EX-15, una tasa y una cita. Aproba lo deja listo en minutos.",
    docs: ["Pasaporte"],
    formularios: [{ code: "EX-15", nombre: "NIE y certificados" }],
    tasas: ["790-012"], organismo: ORG_POLICIA,
    produceTarjeta: false,
    intro: [
      "El **Número de Identidad de Extranjero** se pide con el modelo EX-15 ante la Policía, acreditando el motivo (económico, profesional o social). Es, casi siempre, la puerta de entrada de un cliente nuevo al despacho.",
      "Por eso Aproba lo trata como el primer contacto: el cliente recibe su enlace, sube el pasaporte desde el móvil y la IA rellena su ficha. A partir de ahí, cada trámite posterior arranca con los datos ya cargados.",
    ],
    particular: [
      "**Un documento, una casilla.** El portal pide el pasaporte completo; la IA lo lee y crea la ficha del cliente sin teclear nada.",
      "**EX-15 y 790-012** generados con esos datos, incluida la casilla del representante si el despacho actúa por el cliente.",
      "**La cita, en el expediente.** La cita en Policía se anota con fecha y hora y el cliente recibe la invitación en su idioma.",
      "**La ficha se queda.** El siguiente trámite de ese cliente — un arraigo, una reagrupación — no vuelve a pedirle lo que ya dio.",
    ],
    faq: [
      { q: "¿Pide Aproba la cita en Policía?", a: "No: la cita la pide el despacho o el cliente en la sede oficial. Aproba la registra en el expediente y avisa al cliente con fecha, hora y lugar." },
      { q: "¿Sirve para el NIE de un ciudadano de la UE?", a: "El EX-15 sirve para el NIE y los certificados. Para el registro o la tarjeta de familiar de ciudadano de la UE hay un servicio propio con sus modelos EX-18 y EX-19." },
      { q: "¿Y si el cliente sube una foto borrosa?", a: "La IA la rechaza y el portal se la vuelve a pedir en su idioma, con una ayuda sobre cómo hacer la foto." },
    ],
    articulo: A_ERRORES, relacionados: ["familiar-ciudadano-ue", "arraigo-social", "renovacion-tie"],
  },
  {
    slug: "familiar-ciudadano-ue", servicioId: "residencia_ue",
    nombre: "Familiar de ciudadano de la UE",
    titulo: "Familiar de ciudadano UE: EX-19, EX-18 y tasa 790-012 | Aproba",
    descripcion: "Tarjeta de familiar de ciudadano de la UE (RD 240/2007) con Aproba: identidad, vínculo y empadronamiento en el portal, EX-19 y EX-18 rellenados, tasa 790-012.",
    h1: "Familiar de ciudadano de la UE: cómo lo tramita un despacho con Aproba",
    entradilla: "El régimen comunitario tiene sus propios modelos y su propia lógica: no se acredita arraigo sino vínculo. El documento que decide el expediente es el que prueba la relación con el ciudadano de la Unión.",
    docs: ["Pasaporte", "Documento de identidad del ciudadano UE", "Certificado de empadronamiento", "Justificante del vínculo familiar"],
    formularios: [{ code: "EX-19", nombre: "Tarjeta de familiar de ciudadano de la UE" }, { code: "EX-18", nombre: "Registro de ciudadano de la UE" }],
    tasas: ["790-012"], organismo: ORG_POLICIA,
    produceTarjeta: true,
    intro: [
      "El **familiar de un ciudadano de la Unión** — cónyuge, pareja registrada, hijos, ascendientes a cargo — obtiene una tarjeta de residencia al amparo del **RD 240/2007**, con requisitos y modelos distintos del régimen general.",
      "Aproba pide en el portal los dos lados del vínculo: la identidad del ciudadano de la UE y la prueba de la relación (certificado de matrimonio o de pareja, libro de familia), además del pasaporte y el empadronamiento del solicitante.",
    ],
    particular: [
      "**Dos identidades en un expediente.** El pasaporte del solicitante y el documento del ciudadano de la UE tienen casilla propia; la IA extrae los datos de ambos.",
      "**EX-19 primero, EX-18 si hace falta.** El servicio genera la solicitud de tarjeta de familiar y, cuando el propio ciudadano de la UE necesita su registro, el EX-18.",
      "**Tasa 790-012**, que en este régimen se abona en Policía.",
      "**Tarjeta con caducidad**: cinco años, normalmente. Aproba la registra y la vigila en Renovaciones.",
    ],
    faq: [
      { q: "¿Qué prueba del vínculo pide el portal?", a: "Una casilla «Justificante del vínculo familiar» que admite certificado de matrimonio, inscripción de pareja o libro de familia; tú decides en cada expediente qué documento concreto esperas." },
      { q: "¿Es el mismo trámite que la reagrupación familiar?", a: "No. La reagrupación es del régimen general (el reagrupante es un residente extracomunitario); aquí el familiar lo es de un ciudadano de la UE y se aplica el RD 240/2007. Aproba tiene un servicio para cada uno." },
      { q: "¿Lleva plazo de silencio conocido?", a: "Esta página no lo afirma: el artículo sobre el silencio administrativo cubre el régimen general. Consulta la hoja informativa oficial del trámite." },
    ],
    articulo: A_REPRESENTANTE, relacionados: ["reagrupacion-familiar", "asignacion-nie", "tarjeta-brexit"],
  },
  {
    slug: "tarjeta-brexit", servicioId: "brexit",
    nombre: "Tarjeta del Acuerdo de Retirada (Brexit)",
    titulo: "Tarjeta Acuerdo de Retirada (Brexit): EX-23 y modelos | Aproba",
    descripcion: "Británicos y familiares tras el Brexit con Aproba: residencia anterior a 2021 y empadronamiento en el portal, modelos EX-23, EX-20, EX-21 y EX-22, tasa 790-012.",
    h1: "Tarjeta del Acuerdo de Retirada: cómo la tramita un despacho con Aproba",
    entradilla: "Los británicos residentes antes del 1 de enero de 2021 y sus familiares se documentan al amparo del Acuerdo de Retirada. El expediente gira en torno a una prueba: la residencia anterior a esa fecha.",
    docs: ["Pasaporte", "Justificante de residencia anterior a 2021", "Certificado de empadronamiento"],
    formularios: [{ code: "EX-23", nombre: "Tarjeta del Acuerdo de Retirada" }, { code: "EX-20", nombre: "Documento de residencia (art. 18.4)" }, { code: "EX-21", nombre: "Familiar de beneficiario" }, { code: "EX-22", nombre: "Trabajador fronterizo" }],
    tasas: ["790-012"], organismo: ORG_POLICIA,
    produceTarjeta: true,
    intro: [
      "El **Acuerdo de Retirada** protege a los nacionales del Reino Unido que residían en España antes del 1 de enero de 2021, y a sus familiares. Su documentación tiene modelos propios: el EX-23 para la tarjeta, y los EX-20, EX-21 y EX-22 para los supuestos del artículo 18.4, los familiares y los trabajadores fronterizos.",
      "Para el despacho es un trámite de **prueba de fechas**: empadronamientos antiguos, contratos, certificados de residencia anteriores a 2021. Aproba les da una casilla propia en el portal y lee las fechas al validarlos.",
    ],
    particular: [
      "**Cuatro modelos según el supuesto**: EX-23, EX-20, EX-21 y EX-22. Eliges el que toca y sale rellenado.",
      "**«Residencia anterior a 2021» como documento propio**, para que el cliente entienda qué se le pide y la IA compruebe la fecha.",
      "**Familiares en el mismo expediente**, con el modelo EX-21 para cada uno si hace falta.",
      "**Tarjeta con caducidad**, vigilada después en Renovaciones.",
    ],
    faq: [
      { q: "¿Qué modelo usa Aproba para un británico que ya residía en 2020?", a: "El EX-23 (tarjeta del Acuerdo de Retirada). Para el documento de residencia del artículo 18.4, el EX-20; para familiares, el EX-21; para trabajadores fronterizos, el EX-22." },
      { q: "¿Qué tasa lleva?", a: "La 790-012, generada con los datos del cliente." },
      { q: "¿Y un británico llegado después de 2021?", a: "Ya no está cubierto por el Acuerdo: entra por el régimen general. Aproba lo tramita con el servicio que corresponda (por ejemplo, movilidad internacional o residencia y trabajo)." },
    ],
    articulo: A_ERRORES, relacionados: ["familiar-ciudadano-ue", "asignacion-nie", "renovacion-tie"],
  },
  {
    slug: "modificacion-autorizacion", servicioId: "modificacion",
    nombre: "Modificación de autorización",
    titulo: "Modificación de autorización: EX-26 y tasa 790-052 | Aproba",
    descripcion: "Cambiar de autorización con Aproba: TIE, pasaporte y prueba del nuevo supuesto en el portal, el EX-26 rellenado, la tasa 790-052 y tres meses de plazo.",
    h1: "Modificación de autorización: cómo la tramita un despacho con Aproba",
    entradilla: "De estudiante a trabajador, de cuenta ajena a cuenta propia, de reagrupado a independiente: la modificación cambia la autorización sin salir de España. El documento que manda es la prueba del nuevo supuesto.",
    docs: ["TIE actual", "Pasaporte", "Justificante del nuevo supuesto"],
    formularios: [{ code: "EX-26", nombre: "Modificación de autorización" }],
    tasas: ["790-052"], organismo: ORG_EXTRANJERIA,
    plazo: { meses: "3 meses", silencio: "Negativo", base: "RD 1155/2024, art. 191" },
    produceTarjeta: true,
    intro: [
      "La **modificación de autorización** permite pasar de una situación a otra — estudios a trabajo, cuenta ajena a cuenta propia, reagrupación a autorización independiente — sin perder la residencia. El Reglamento de 2024 la regula en el artículo 191.",
      "Aproba pide lo que comparte todo supuesto (TIE vigente y pasaporte) y deja una casilla abierta, **«Justificante del nuevo supuesto»**, que tú concretas en cada expediente: un contrato, un alta de autónomo, una matrícula.",
    ],
    particular: [
      "**EX-26 rellenado** con los datos de la ficha y la autorización actual leída de la TIE.",
      "**Casilla del nuevo supuesto**: la renombras o añades otras desde el expediente para que el portal pida exactamente lo que necesitas.",
      "**Tasa 790-052** generada. Si el nuevo supuesto es de trabajo por cuenta ajena, la 790-062 la abona el empleador: añádela desde el selector.",
      "**Plazo de tres meses, silencio negativo** (art. 191).",
    ],
    faq: [
      { q: "¿Sirve para pasar de estudiante a trabajador?", a: "Sí: es uno de los supuestos típicos. El portal pedirá el contrato o la oferta como «justificante del nuevo supuesto» y el EX-26 saldrá rellenado." },
      { q: "¿Y la tasa de trabajo?", a: "La 790-052 sale por defecto. Cuando el supuesto implica autorización de trabajo por cuenta ajena, añades la 790-062 (la paga quien contrata) desde el selector de tasas del expediente." },
      { q: "¿Plazo?", a: "Tres meses, silencio negativo (RD 1155/2024, art. 191)." },
    ],
    articulo: A_SILENCIO, relacionados: ["renovacion-tie", "arraigo-laboral", "residencia-larga-duracion"],
  },
  {
    slug: "movilidad-internacional", servicioId: "movilidad_internacional",
    nombre: "Movilidad internacional (Ley 14/2013)",
    titulo: "Movilidad internacional (Ley 14/2013): modelos MI | Aproba",
    descripcion: "Ley 14/2013 con Aproba: inversores, emprendedores, cualificados, investigadores y teletrabajadores; documentos en el portal y los tres modelos MI rellenados.",
    h1: "Movilidad internacional: cómo tramita un despacho la Ley 14/2013 con Aproba",
    entradilla: "La Ley de Emprendedores tiene su propio circuito: se presenta ante la Unidad de Grandes Empresas, con sus modelos MI y sin pasar por la Oficina de Extranjería. Aproba los genera los tres.",
    docs: ["Pasaporte", "Titulación o experiencia profesional", "Contrato, proyecto empresarial o justificación de la inversión", "Seguro médico", "Antecedentes penales"],
    formularios: [{ code: "MI-T", nombre: "Solicitud del titular" }, { code: "MI-TIE", nombre: "Tarjeta del titular" }, { code: "MI-F", nombre: "Familiares" }],
    tasas: [], organismo: ORG_UGE,
    produceTarjeta: true,
    intro: [
      "La **Ley 14/2013** agrupa a inversores, emprendedores, profesionales altamente cualificados, investigadores, traslados intraempresariales y teletrabajadores internacionales. Sus autorizaciones se piden en la **sede del Ministerio de Inclusión**, ante la Unidad de Grandes Empresas, con modelos propios: MI-T para el titular, MI-TIE para su tarjeta y MI-F para los familiares.",
      "Es un trámite de expediente grueso — titulación, contrato o proyecto, seguro, antecedentes — y de cliente que suele escribir en inglés. El portal en 8 idiomas y la lista de documentos por casilla hacen el trabajo de recogida; los tres modelos salen rellenados.",
    ],
    particular: [
      "**Los tres modelos MI**, rellenados con la ficha del titular y de cada familiar.",
      "**Sin tasa generada, a propósito.** La tasa de este circuito es la 790-038, cuyo impreso exige certificado o Cl@ve en la sede del Ministerio: Aproba no la genera y lo dice.",
      "**Casillas amplias**: «Titulación o experiencia profesional» y «Contrato, proyecto empresarial o justificación de la inversión» admiten lo que el supuesto exija; el cliente sube varios archivos en cada una.",
      "**Sin cita presencial** por defecto: la presentación es telemática.",
    ],
    faq: [
      { q: "¿Por qué no genera Aproba la tasa 790-038?", a: "Porque su impreso oficial solo se obtiene identificándose con certificado o Cl@ve en la sede del Ministerio. Antes que generar algo que no sea el impreso válido, Aproba lo deja fuera y te lo indica." },
      { q: "¿Sirve para el visado de nómada digital?", a: "El teletrabajador internacional es uno de los supuestos de la Ley 14/2013: mismo circuito y mismos modelos MI. El servicio del catálogo se llama «Movilidad internacional» y lo activas en Ajustes." },
      { q: "¿Lleva plazo de silencio conocido?", a: "Esta página no lo afirma: el artículo sobre el silencio administrativo cubre el régimen general del RD 1155/2024. Consulta la información oficial de la Unidad de Grandes Empresas." },
    ],
    articulo: A_REPRESENTANTE, relacionados: ["modificacion-autorizacion", "familiar-ciudadano-ue", "renovacion-tie"],
  },
];

export const rutaTramite = (t: Pick<Tramite, "slug">) => `/tramites/${t.slug}`;
export const getTramite = (slug: string) => TRAMITES.find((t) => t.slug === slug);

const TASA_LABEL: Record<string, string> = {
  "790-012": "790-012 (Policía)",
  "790-052": "790-052 (autorizaciones de residencia)",
  "790-062": "790-062 (autorizaciones de trabajo)",
  "790-026": "790-026 (Justicia, nacionalidad)",
  "790-006": "790-006 (Justicia, antecedentes penales)",
};
const lista = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`;

// La página de cada trámite, montada con el mismo motor de bloques que el resto del sitio.
export function paginaDeTramite(t: Tramite): PaginaPublica {
  const modelos = t.formularios.map((f) => `**${f.code}** (${f.nombre})`);
  const tasas = t.tasas.map((c) => `**${TASA_LABEL[c] ?? c}**`);
  const otros = t.relacionados.map((s) => getTramite(s)).filter((x): x is Tramite => Boolean(x));
  const bloques: Bloque[] = [
    { t: "datos", items: [
      { valor: String(t.docs.length), etiqueta: t.docs.length === 1 ? "documento que pide el portal por defecto" : "documentos que pide el portal por defecto" },
      { valor: t.formularios.length ? String(t.formularios.length) : "0", etiqueta: t.formularios.length === 1 ? "modelo oficial rellenado" : "modelos oficiales rellenados" },
      { valor: t.tasas.length ? t.tasas.join(" · ") : "—", etiqueta: t.tasas.length ? "tasa generada con los datos del cliente" : "tasa: no se genera (ver por qué)" },
      ...(t.plazo ? [{ valor: t.plazo.meses, etiqueta: `plazo de resolución · silencio ${t.plazo.silencio.toLowerCase()}` }] : []),
    ] },
    ...t.intro.map((texto): Bloque => ({ t: "p", texto })),
    { t: "h2", texto: "Qué pide Aproba a tu cliente" },
    { t: "p", texto: `Al crear el expediente y elegir «${t.nombre}», el cliente recibe un enlace con esta lista, en su idioma. Es la lista por defecto del catálogo: la ajustas por servicio en Ajustes o por expediente, y lo que no tenga casilla se sube igual como «otros documentos».` },
    { t: "ul", items: t.docs.map((d) => `**${d}**`) },
    { t: "h2", texto: "Formularios y tasa" },
    { t: "p", texto: t.formularios.length
      ? `Con los documentos validados, Aproba rellena ${lista(modelos)} sobre el impreso oficial vigente, editable antes de imprimir; la página 2 (lugar, fecha, firmante) se completa sobre el propio PDF. ${t.tasas.length ? `La tasa ${lista(tasas)} sale generada con los datos del cliente.` : "Este trámite no lleva tasa generada por Aproba (se explica más abajo)."} Se presenta ante la ${t.organismo}; **la presentación la hace el profesional**, con su certificado o su convenio.`
      : `Este trámite no lleva modelo EX: se presenta por vía telemática ante el ${t.organismo}. ${t.tasas.length ? `Aproba genera la tasa ${lista(tasas)} con los datos del cliente.` : ""} **La presentación la hace el profesional**, con su certificado.` },
    { t: "h2", texto: "El recorrido en Aproba" },
    { t: "esquema", titulo: `Un expediente de ${t.nombre.toLowerCase()}, de principio a fin`, nodos: [
      { titulo: "Enlace", texto: "Creas el expediente, eliges el servicio y envías el enlace." },
      { titulo: "Portal", texto: `El cliente sube ${t.docs.length === 1 ? "el documento" : "los documentos"} desde el móvil, en su idioma, y firma la hoja de encargo.` },
      { titulo: "IA", texto: "Cada documento se reconoce, se lee y rellena la ficha; lo ilegible se vuelve a pedir." },
      { titulo: t.formularios.length ? "Formularios" : "Tasa", texto: t.formularios.length ? `${t.formularios.map((f) => f.code).join(", ")} y la tasa, rellenados y editables.` : "Generada con los datos del cliente." },
      { titulo: "Cobro", texto: "Anticipo y pago final desde el expediente (Pro y Business), con transferencia o tarjeta." },
    ], destino: { titulo: "Presentación", texto: "La haces tú. Aproba avisa al cliente de cada paso y guarda el historial." } },
    { t: "h2", texto: "Lo particular de este trámite" },
    { t: "ul", items: t.particular },
    ...(t.plazo ? [
      { t: "h2", texto: "Plazo de resolución" } as Bloque,
      { t: "p", texto: `La Administración dispone de **${t.plazo.meses}** desde la entrada en registro, con **silencio ${t.plazo.silencio.toLowerCase()}** (${t.plazo.base}). Los requerimientos paran el reloj; el detalle, con las fuentes, está en [${A_SILENCIO.titulo}](${A_SILENCIO.ruta}).` } as Bloque,
    ] : []),
    ...(t.produceTarjeta ? [{ t: "p", texto: "**Y después.** La tarjeta que resulta tiene caducidad. Aproba la registra al validarla y, cuando se acerque, te propondrá la renovación desde la vista **Renovaciones**, con aviso al cliente en su idioma." } as Bloque] : []),
    { t: "nota", titulo: "Lo que Aproba no hace", texto: "No presenta el expediente ni valora si el cliente cumple los requisitos: prepara documentos, formularios, tasa, hoja de encargo y cobro para que tú presentes con todo en orden. La decisión profesional sigue siendo tuya." },
    { t: "faq", items: t.faq },
  ];
  return {
    ruta: rutaTramite(t),
    titulo: t.titulo,
    descripcion: t.descripcion,
    etiqueta: "Trámite",
    h1: t.h1,
    entradilla: t.entradilla,
    actualizado: "2026-09-20",
    migas: [{ nombre: "Trámites", ruta: "/tramites" }, { nombre: t.nombre, ruta: rutaTramite(t) }],
    bloques,
    cta: { titulo: `Prueba un expediente de ${t.nombre.toLowerCase()}`, texto: "15 días gratis, sin tarjeta. La cuenta de prueba trae un expediente de ejemplo ya resuelto para ver el flujo completo." },
    relacionadas: ["/software-de-extranjeria", ...(t.articulo ? [t.articulo.ruta] : []), ...otros.map(rutaTramite), "/precios"],
  };
}

export const PAGINAS_TRAMITES: PaginaPublica[] = TRAMITES.map(paginaDeTramite);
