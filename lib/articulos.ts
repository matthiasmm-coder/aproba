// ARTÍCULOS — sección editorial pública (SEO), pedida por Matthias el 22/08/2026.
//
// El contenido vive AQUÍ, en código, no en la base: son textos que cambian pocas veces,
// que deben pasar por revisión antes de publicarse y que interesa versionar en git (un
// dato legal equivocado en una página indexada es peor que un bug). Añadir un artículo
// = añadir una entrada a ARTICULOS; el índice, el sitemap y las páginas se generan solos.
//
// ⚠️ REGLA: cada cifra o plazo que aparezca aquí debe poder rastrearse a una fuente
// oficial datada — el lector es un profesional de extranjería y lo va a notar. Cuando el
// dato tenga fecha, dilo en el texto («datos oficiales de julio de 2026»).

export type Bloque =
  | { t: "p"; texto: string }
  | { t: "h2"; texto: string }
  | { t: "h3"; texto: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "cita"; texto: string; autor: string }
  | { t: "datos"; items: { valor: string; etiqueta: string }[] }
  | { t: "nota"; titulo?: string; texto: string }
  // Tabla editorial: cabeceras + filas de texto plano (admite **negrita**). El wrapper
  // desborda con scroll horizontal en móvil — la página nunca se ensancha.
  | { t: "tabla"; titulo?: string; encabezados: string[]; filas: string[][]; nota?: string }
  // Barras de rango min–max (p. ej. honorarios): se pintan como divs en servidor, sin JS.
  // `techo` fija la escala común para que los rangos sean comparables entre sí.
  | { t: "rangos"; titulo: string; unidad: string; techo: number; items: { etiqueta: string; min: number; max: number }[]; nota?: string }
  // Cronología vertical de hitos con fecha (p. ej. calendario normativo).
  | { t: "hitos"; items: { fecha: string; titulo: string; texto?: string; destacado?: boolean }[] }
  // Gráfico de barras horizontales (p. ej. entidades por provincia): divs en servidor,
  // sin JS. La escala es el valor máximo de la serie; `unidad` va en la cifra.
  | { t: "barras"; titulo: string; unidad: string; items: { etiqueta: string; valor: number; destacado?: boolean }[]; nota?: string }
  // Esquema de vías: varios nodos que convergen en un destino (p. ej. quién puede
  // presentar un expediente y ante quién). Cajas + flechas en CSS, legible en móvil.
  | { t: "esquema"; titulo: string; nodos: { titulo: string; texto?: string; cifra?: string; destacado?: boolean }[]; destino: { titulo: string; texto?: string }; nota?: string }
  // Preguntas frecuentes: además de pintarse, alimentan el JSON-LD FAQPage de la página.
  | { t: "faq"; items: { q: string; a: string }[] };

export type Articulo = {
  slug: string;
  titulo: string;          // <h1> y <title>
  descripcion: string;     // meta description — 140-160 caracteres, con la intención de búsqueda
  fecha: string;           // ISO (publicación)
  actualizado?: string;    // ISO — si se revisa, cuenta para el frescor en buscadores
  tema: string;            // etiqueta corta para el índice
  entradilla: string;      // resumen visible bajo el h1
  // Imagen de cabecera (public/articulos/<slug>.jpg, 1536×1024). Sirve DOS veces: en la
  // página y como tarjeta al compartir el enlace (og:image). El alt describe la imagen,
  // no repite el título — quien la escucha con un lector de pantalla ya lo ha oído.
  imagenAlt: string;
  bloques: Bloque[];
};

// La ruta se deriva del slug: una imagen por artículo, mismo nombre, sin campo que
// pueda quedar desincronizado.
export const imagenDe = (a: Articulo): string => `/articulos/${a.slug}.jpg`;

// El texto admite **negrita** (se convierte en <strong> al pintar; ver components/articulo-cuerpo).
export const ARTICULOS: Articulo[] = [
  {
    slug: "entidades-colaboradoras-extranjeria-registro-2026",
    titulo: "Entidades colaboradoras de extranjería: las 498 acreditadas y qué cambia para tu despacho",
    descripcion:
      "El Registro de Colaboradores de Extranjería acredita a 498 entidades para presentar expedientes sin cobrar. Dónde están, qué pueden hacer y qué obligaciones tienen.",
    fecha: "2026-09-05",
    tema: "Colaboradores de extranjería",
    entradilla:
      "Desde marzo de 2026 el Ministerio acredita a ONG y sindicatos para representar a personas extranjeras sin cobrar. Ya son 498. Dónde están, qué les exige la norma y qué significa para quien vive de tramitar.",
    imagenAlt:
      "Gráfico: la cifra 498 junto a un diagrama de barras con las provincias con más entidades colaboradoras acreditadas, Madrid y Barcelona en cabeza.",
    bloques: [
      { t: "h2", texto: "Qué es el Registro de Colaboradores de Extranjería" },
      {
        t: "p",
        texto:
          "La **Orden ISM/164/2026, de 2 de marzo** (BOE-A-2026-5128, en vigor desde el 6 de marzo) creó el Registro Electrónico de Colaboradores de Extranjería: un censo de entidades habilitadas para representar a personas extranjeras ante la Administración en sus trámites. Nació al servicio de la [regularización extraordinaria](/articulos/renovaciones-2027-regularizacion-extraordinaria), con su ventana del 16 de abril al 30 de junio, pero no termina con ella: la inscripción vale **cuatro años** (art. 5.2) y la lista sigue creciendo.",
      },
      {
        t: "p",
        texto:
          "Solo pueden inscribirse dos tipos de entidad (art. 4.1): los **sindicatos más representativos**, estatales o autonómicos, y las **entidades sin ánimo de lucro** constituidas hace más de tres años y con al menos dos de experiencia verificable con personas migrantes. Las gestorías y los despachos de abogados quedan fuera: la colaboración es, por definición, gratuita.",
      },
      { t: "h2", texto: "Las cifras: 498 entidades, un tercio en dos provincias" },
      {
        t: "p",
        texto:
          "El Ministerio de Inclusión, Seguridad Social y Migraciones publica la lista de entidades acreditadas y la va actualizando en su web. La versión del **4 de septiembre de 2026** recoge **498 entidades**. Hemos contado dónde están, provincia a provincia:",
      },
      {
        t: "barras",
        titulo: "Entidades colaboradoras acreditadas por provincia",
        unidad: "entidades",
        items: [
          { etiqueta: "Madrid", valor: 84, destacado: true },
          { etiqueta: "Barcelona", valor: 77, destacado: true },
          { etiqueta: "Bizkaia", valor: 31 },
          { etiqueta: "Valencia", valor: 28 },
          { etiqueta: "Santa Cruz de Tenerife", valor: 24 },
          { etiqueta: "Sevilla", valor: 17 },
          { etiqueta: "Gipuzkoa", valor: 15 },
          { etiqueta: "A Coruña", valor: 14 },
          { etiqueta: "Tarragona", valor: 14 },
          { etiqueta: "Almería", valor: 11 },
          { etiqueta: "Las Palmas", valor: 11 },
          { etiqueta: "Navarra", valor: 11 },
        ],
        nota:
          "Recuento propio sobre la lista oficial de entidades colaboradoras acreditadas (Ministerio de Inclusión, versión del 4 de septiembre de 2026, 498 entidades). La provincia es la que declara la propia lista.",
      },
      {
        t: "datos",
        items: [
          { valor: "32 %", etiqueta: "de las entidades están en Madrid o Barcelona" },
          { valor: "4", etiqueta: "sindicatos inscritos: CCOO, UGT, CIG e Intersindical Solidària" },
          { valor: "0", etiqueta: "gestorías o despachos de abogados: la norma los excluye" },
        ],
      },
      {
        t: "p",
        texto:
          "El mapa encaja con el de la regularización: Cataluña, Madrid, la Comunidad Valenciana y Andalucía concentraron las solicitudes de 2026, y ahí están las entidades. Llama la atención el peso de Canarias y de Euskadi, con más entidades acreditadas que provincias mucho más pobladas: el tejido asociativo pesa tanto como la demanda.",
      },
      { t: "h2", texto: "Quién puede presentar un expediente por otra persona" },
      {
        t: "p",
        texto:
          "Desde 2026 conviven cuatro vías para que un expediente de extranjería llegue a la Administración. Los datos oficiales del 2 de julio de 2026 sobre la regularización dicen cuánto pesa cada una:",
      },
      {
        t: "esquema",
        titulo: "Cuatro vías, un mismo destino",
        nodos: [
          { titulo: "Abogado o gestor", cifra: "58 % + 8,4 %", texto: "Representación profesional, con honorarios.", destacado: true },
          { titulo: "Funcionario habilitado", cifra: "16,8 %", texto: "Registro asistido en oficinas públicas." },
          { titulo: "La propia persona", cifra: "7,3 %", texto: "Con certificado digital o Cl@ve." },
          { titulo: "Entidad colaboradora", cifra: "resto", texto: "Gratuita, inscrita en el registro." },
        ],
        destino: { titulo: "Oficina de Extranjería", texto: "Sede electrónica, uno a uno: la orden no prevé ningún canal masivo ni API." },
        nota:
          "Porcentajes: desglose del Gobierno sobre las 1.174.978 solicitudes de regularización (2 de julio de 2026). El desglose oficial no aísla a las entidades colaboradoras; el resto agrupa otras vías de presentación.",
      },
      {
        t: "p",
        texto:
          "El grueso pasó por un despacho: **dos de cada tres solicitudes las presentó un abogado o un gestor**. Pero el bloque de los colaboradores no es pequeño. Solo CCOO comunicó el 29 de junio de 2026 haber **tramitado más de 7.500 expedientes** con cerca de 200 personas movilizadas en sus sedes; CCOO Canarias, más de 700.",
      },
      { t: "h2", texto: "Lo que un colaborador no puede hacer, y lo que está obligado a hacer" },
      {
        t: "p",
        texto:
          "La orden es corta y muy concreta en su artículo 8. Esto es lo que obliga, y lo que cada punto implica en el trabajo diario:",
      },
      {
        t: "tabla",
        titulo: "Obligaciones del colaborador de extranjería (art. 8 de la Orden ISM/164/2026)",
        encabezados: ["Obligación", "Artículo", "En la práctica"],
        filas: [
          ["**Gratuidad** de la representación", "8.1.c", "No puede cobrar nada por los trámites que presenta al amparo del registro. Su única variable es el tiempo."],
          ["Personas habilitadas con **conocimientos** y sin antecedentes", "8.1.a, 8.1.b", "Certificado negativo de delitos sexuales, sin condenas ni sanciones de extranjería, RGPD o LISOS en tres años."],
          ["**Firma electrónica** y presentación telemática", "8.1.b.4º", "Presenta por medios electrónicos y entrega a la persona todos los justificantes y resguardos que genere la Administración."],
          ["Representación con **constancia fidedigna**", "8.1.b.5º", "Un mandato que deje prueba de su existencia (art. 5 de la Ley 39/2015)."],
          ["**Seguro** de responsabilidad civil", "8.1.d", "Cubre la representación que ejercen las personas habilitadas."],
          ["**Protección de datos**", "8.1.e", "Trata datos de categoría especial, a menudo con voluntarios."],
          ["**Memoria de actividad** o auditoría externa al renovar", "8.1.f", "Número de expedientes tramitados, procedimientos, tipo de actuaciones, recursos empleados y elementos para valorar calidad, alcance y eficacia."],
          ["Comunicar cambios en **cinco días**", "8.2", "Cualquier modificación de los datos inscritos, con responsabilidad por lo que derive de no hacerlo."],
        ],
        nota: "La inscripción dura cuatro años; la prórroga se pide en los seis meses anteriores al vencimiento y exige acreditar que se siguen cumpliendo los requisitos (art. 5.2).",
      },
      {
        t: "nota",
        titulo: "El detalle que casi nadie ha leído",
        texto:
          "La memoria del artículo 8.1.f se entrega en 2030, pero se construye desde el primer expediente de 2026. Una entidad que no registre hoy qué tramita, en qué procedimiento y con qué recursos, tendrá que reconstruirlo de memoria dentro de cuatro años.",
      },
      { t: "h2", texto: "Y para tu despacho, ¿qué cambia?" },
      {
        t: "p",
        texto:
          "La lectura rápida es «el Estado acaba de acreditar a 498 competidores que trabajan gratis». La lectura correcta es otra: la gratuidad no es una ventaja de precio, es un límite de capacidad. El mejor ejemplo lo dio el mayor operador gratuito de extranjería del país.",
      },
      {
        t: "cita",
        texto: "El CITE no té viabilitat i no pot seguir prestant els serveis d'assessorament.",
        autor: "Junta directiva del CITE de CCOO de Catalunya, 21 de enero de 2026",
      },
      {
        t: "p",
        texto:
          "El CITE catalán tenía **40 años de historia, 30 oficinas y 16 personas en plantilla**, y atendió a **casi 11.000 personas** en su último año. En enero de 2026 pidió el concurso de acreedores; hoy mantiene abiertas tres oficinas, en Manresa, Terrassa y Tarragona. Un servicio gratuito con demanda ilimitada se hunde por el coste de las horas, no por falta de clientes.",
      },
      {
        t: "p",
        texto:
          "Para un despacho, esto significa tres cosas. **Primera**: los colaboradores no van a absorber la [ola de renovaciones de 2027](/articulos/renovaciones-2027-regularizacion-extraordinaria); cuando se saturen, derivarán. **Segunda**: lo que el cliente compra en un despacho no es la presentación, que puede conseguir gratis, sino la disponibilidad, la velocidad y la responsabilidad de alguien que responde por el expediente. **Tercera**: la orden ha escrito por primera vez un estándar de trazabilidad —quién intervino, en qué, cuándo— que hasta ahora nadie exigía a nadie. Es razonable pensar que financiadores y clientes acabarán esperándolo de todos.",
      },
      {
        t: "hitos",
        items: [
          { fecha: "2 de marzo de 2026", titulo: "Orden ISM/164/2026", texto: "Se crea el Registro Electrónico de Colaboradores de Extranjería. En vigor el 6 de marzo." },
          { fecha: "16 de abril – 30 de junio de 2026", titulo: "Ventana de la regularización", texto: "1.174.978 solicitudes; los colaboradores se estrenan con el mayor volumen de la historia reciente." },
          { fecha: "30 de septiembre de 2026", titulo: "Fin de las subsanaciones", texto: "Último plazo para completar los expedientes requeridos." },
          { fecha: "4 de septiembre de 2026", titulo: "498 entidades acreditadas", texto: "Última versión publicada de la lista del Ministerio.", destacado: true },
          { fecha: "Mediados de 2027", titulo: "Vencen las autorizaciones de un año", texto: "Cerca de 600.000 renovaciones casi simultáneas.", destacado: true },
          { fecha: "2030", titulo: "Primeras prórrogas del registro", texto: "Con la memoria de actividad del artículo 8.1.f bajo el brazo." },
        ],
      },
      {
        t: "nota",
        titulo: "Cómo lo resuelve Aproba",
        texto:
          "Para una entidad colaboradora, Aproba registra cada expediente con su procedimiento, sus actuaciones y quién intervino, y genera la memoria de actividad del artículo 8.1.f en un clic; el mandato de representación se firma desde el propio expediente y deja constancia fidedigna. Para un despacho, Vigía fecha cada vencimiento y prepara las renovaciones de 2027 antes de que lleguen todas a la vez.",
      },
      {
        t: "faq",
        items: [
          { q: "¿Puede una gestoría o un despacho de abogados inscribirse como colaborador?", a: "No. El artículo 4.1 de la Orden ISM/164/2026 reserva el registro a los sindicatos más representativos y a las entidades sin ánimo de lucro con más de tres años de existencia." },
          { q: "¿Puede una entidad colaboradora cobrar por presentar un expediente?", a: "No. La representación al amparo del registro es gratuita por obligación expresa (art. 8.1.c)." },
          { q: "¿Dónde se consulta la lista de entidades acreditadas?", a: "El Ministerio de Inclusión la publica en su web, en la sección de la regularización, como documento actualizado; la versión del 4 de septiembre de 2026 recoge 498 entidades. No se publica en el BOE." },
          { q: "¿Cuánto dura la inscripción y qué hace falta para renovarla?", a: "Cuatro años. La prórroga se solicita en los seis meses anteriores al vencimiento, acreditando que se mantienen los requisitos y aportando la memoria de actividad o auditoría externa del artículo 8.1.f." },
        ],
      },
      {
        t: "p",
        texto:
          "Una última pregunta, válida tanto para una entidad como para un despacho: **si mañana te pidieran cuántos expedientes has tramitado este año, por procedimiento y con qué recursos, ¿cuánto tardarías en responder?**",
      },
    ],
  },
  {
    slug: "nacionalidad-por-residencia-plazos-tasas-2026",
    titulo: "Nacionalidad por residencia en 2026: plazos, tasas y atascos",
    descripcion:
      "299.732 concesiones en 2025 y 256.000 expedientes pendientes. Plazos por nacionalidad, coste real (790-026, CCSE, DELE) y qué retrasa el expediente.",
    fecha: "2026-08-31",
    tema: "Nacionalidad",
    entradilla:
      "La nacionalidad por residencia es el trámite que más ha crecido en los últimos años y el que peor fama tiene de plazos. Estos son los números oficiales, el coste real para el cliente y las tres cosas que hacen que un expediente tarde el doble.",
    imagenAlt:
      "Un pasaporte granate abierto sobre un escritorio de nogal, con una estela de luz verde que se eleva de sus páginas hacia un reloj de arena de latón cuya arena cae lentamente.",
    bloques: [
      {
        t: "p",
        texto:
          "En 2025, **299.732 personas** adquirieron la nacionalidad española: el dato más alto de toda la serie histórica del INE, un **18,7 % más** que el año anterior. Al mismo tiempo, el Ministerio de Justicia arrastra **más de 256.000 expedientes pendientes**. Las dos cifras juntas explican la experiencia real de cualquier despacho: nunca se han concedido tantas nacionalidades, y nunca se ha esperado tanto por cada una.",
      },
      { t: "h2", texto: "Cuántos años de residencia hacen falta" },
      {
        t: "p",
        texto:
          "El **artículo 22 del Código Civil** fija cuatro plazos. La diferencia entre ellos es enorme —de uno a diez años— y determinar cuál aplica es la primera decisión del expediente. La residencia debe ser **legal, continuada e inmediatamente anterior** a la solicitud: un periodo en situación irregular en medio rompe el cómputo.",
      },
      {
        t: "tabla",
        titulo: "Plazos de residencia exigidos (art. 22 CC)",
        encabezados: ["Plazo", "A quién se aplica", "Nota práctica"],
        filas: [
          ["**10 años**", "Regla general", "El resto de nacionalidades sin trato preferente"],
          ["**5 años**", "Refugiados con estatuto reconocido", "Cuenta desde el reconocimiento, no desde la solicitud de asilo"],
          [
            "**2 años**",
            "Iberoamericanos, Andorra, Filipinas, Guinea Ecuatorial, Portugal y sefardíes",
            "La vía mayoritaria: los nueve países iberoamericanos suman más de la mitad de las concesiones",
          ],
          [
            "**1 año**",
            "Nacidos en España; casados con español/a hace ≥1 año sin separación; viudos de español/a; tutelados por español/a o institución durante 2 años",
            "El matrimonio debe estar vigente y sin separación legal ni de hecho",
          ],
        ],
        nota: "En todos los casos se exige además buena conducta cívica y suficiente grado de integración en la sociedad española.",
      },
      {
        t: "datos",
        items: [
          { valor: "37.712", etiqueta: "concesiones a colombianos en 2025, el primer país" },
          { valor: "36.271", etiqueta: "a venezolanos, el segundo" },
          { valor: "20.745", etiqueta: "a hondureños, el tercero" },
        ],
      },
      { t: "h2", texto: "Lo que cuesta de verdad" },
      {
        t: "p",
        texto:
          "El cliente pregunta «cuánto es la tasa» y la respuesta honesta son **tres importes distintos**, dos de ellos ajenos a tu despacho. Conviene decírselos juntos desde la primera visita: la sorpresa a mitad de expediente es una de las causas más frecuentes de impago.",
      },
      {
        t: "tabla",
        titulo: "Coste para el solicitante (sin honorarios)",
        encabezados: ["Concepto", "Importe", "Quién lo cobra", "Cuándo"],
        filas: [
          ["**Tasa 790-026**", "**104,05 €**", "Ministerio de Justicia", "Antes de presentar; el justificante va en el expediente"],
          ["**Prueba CCSE**", "**85 €**", "Instituto Cervantes", "Incluye dos convocatorias si suspende o no se presenta"],
          ["**DELE A2**", "Según nivel y país", "Instituto Cervantes", "Exentos los nacionales de países hispanohablantes"],
        ],
        nota: "Las dos pruebas del Cervantes no caducan a efectos de nacionalidad, pero sí conviene hacerlas antes de solicitar: sin ellas el expediente se presenta incompleto.",
      },
      {
        t: "nota",
        titulo: "Las exenciones que más se olvidan",
        texto:
          "Del **DELE** están exentos los nacionales de países donde el español es idioma oficial —es decir, casi toda la vía de los dos años—. Del **CCSE** están exentos los menores de edad y las personas con capacidad modificada judicialmente. Comprobar la exención antes de mandar al cliente a examinarse ahorra 85 € y varias semanas.",
      },
      { t: "h2", texto: "El plazo legal y el plazo real" },
      {
        t: "p",
        texto:
          "Justicia dispone de **un año** para resolver desde que el expediente entra completo. En la práctica, los plazos observados en 2026 se mueven entre **12 y 24 meses**, y la fase donde más se acumulan los expedientes es la de **calificación**. Transcurrido el año sin respuesta se produce **silencio administrativo negativo**: la solicitud se entiende denegada, lo que abre la vía del recurso contencioso-administrativo por inactividad — el instrumento habitual para desbloquear expedientes parados.",
      },
      {
        t: "hitos",
        items: [
          { fecha: "Antes de solicitar", titulo: "Pruebas y tasa", texto: "CCSE y DELE aprobados (salvo exención) y tasa 790-026 pagada. Sin esto, el expediente nace incompleto." },
          { fecha: "Día 0", titulo: "Presentación telemática", texto: "Se registra la solicitud con toda la documentación y el justificante de la tasa." },
          { fecha: "Meses 1-6", titulo: "Instrucción", texto: "Se piden informes: antecedentes penales, CNI, padrón, Seguridad Social." },
          { fecha: "Meses 6-18", titulo: "Calificación", texto: "La fase más lenta y donde se detiene la mayoría de los expedientes.", destacado: true },
          { fecha: "Mes 12", titulo: "Vence el plazo legal", texto: "A partir de aquí cabe entender denegada la solicitud por silencio y recurrir por inactividad.", destacado: true },
          { fecha: "Tras la concesión", titulo: "Jura en 180 días", texto: "Plazo de caducidad para jurar o prometer ante el Registro Civil. Si vence, la concesión decae." },
        ],
      },
      { t: "h2", texto: "Las tres causas reales de retraso" },
      {
        t: "ol",
        items: [
          "**El cómputo de residencia mal hecho.** Un hueco entre una autorización y su renovación rompe la continuidad. Antes de solicitar, reconstruye el historial completo de autorizaciones: es más rápido que discutirlo después con la Administración.",
          "**Los antecedentes penales del país de origen.** Deben estar legalizados o apostillados y traducidos, y muchos caducan a los tres o seis meses según el país. Pedirlos demasiado pronto obliga a repetirlos; demasiado tarde retrasa la presentación.",
          "**El domicilio desactualizado.** Justicia notifica al domicilio del expediente. Una mudanza no comunicada convierte un requerimiento en una denegación por falta de respuesta, y eso ya no se arregla con una subsanación.",
        ],
      },
      {
        t: "p",
        texto:
          "Ninguna de las tres es un problema jurídico complejo: son problemas de seguimiento a lo largo de dos años. Por eso la nacionalidad castiga tanto al despacho que la lleva en carpetas y hojas de cálculo — y por eso conviene tratarla como [un expediente vivo con vencimientos](/articulos/errores-documentales-retrasan-expediente-extranjeria), no como un trámite que se presenta y se olvida.",
      },
      {
        t: "nota",
        titulo: "Por qué esto crece y va a seguir creciendo",
        texto:
          "Los dos años de residencia para iberoamericanos convierten cada permiso inicial en una futura solicitud de nacionalidad a corto plazo. Con [la ola de renovaciones de 2027](/articulos/renovaciones-2027-regularizacion-extraordinaria) llegando en paralelo, un despacho que hoy tramita residencias tendrá dentro de dos años una cartera de nacionalidades del mismo cliente. Merece la pena registrarlo desde ahora.",
      },
      {
        t: "faq",
        items: [
          {
            q: "¿Cuánto cuesta la tasa de nacionalidad por residencia en 2026?",
            a: "La tasa modelo 790 código 026 son 104,05 €. Se paga antes de presentar la solicitud y el justificante debe incorporarse al expediente: sin él, la Administración no evalúa la documentación.",
          },
          {
            q: "¿Cuánto tarda la nacionalidad española por residencia?",
            a: "El plazo legal es de un año desde la solicitud completa. En la práctica, en 2026 se observan resoluciones entre 12 y 24 meses, con la fase de calificación como principal cuello de botella.",
          },
          {
            q: "¿Qué pasa si pasa un año y no me responden?",
            a: "Se produce silencio administrativo negativo: la solicitud se entiende denegada. Esto abre la posibilidad de interponer recurso contencioso-administrativo por inactividad, que es la vía habitual para desbloquear expedientes paralizados.",
          },
          {
            q: "¿Quién está exento del examen DELE?",
            a: "Los nacionales de países o territorios donde el español es idioma oficial. Es decir, prácticamente toda la vía de los dos años de residencia (países iberoamericanos, Guinea Ecuatorial). Del CCSE están exentos los menores y las personas con capacidad modificada judicialmente.",
          },
          {
            q: "¿Cuántos años de residencia necesita un iberoamericano?",
            a: "Dos años de residencia legal, continuada e inmediatamente anterior a la solicitud (art. 22 CC), frente a los diez de la regla general. El mismo plazo se aplica a nacionales de Andorra, Filipinas, Guinea Ecuatorial, Portugal y a los sefardíes.",
          },
          {
            q: "¿Qué ocurre si no juro la nacionalidad a tiempo?",
            a: "La concesión caduca. Hay 180 días desde la notificación para jurar o prometer ante el Registro Civil; superado el plazo sin causa justificada, la resolución pierde efecto y hay que volver a empezar.",
          },
        ],
      },
    ],
  },
  {
    slug: "honorarios-extranjeria-cuanto-cobrar-2026",
    titulo: "Honorarios de extranjería en 2026: cuánto cobrar por cada trámite",
    descripcion:
      "Rangos de honorarios habituales en extranjería en 2026 —arraigos, renovaciones, nacionalidad—, por qué no existen baremos oficiales y cómo estructurar el cobro.",
    fecha: "2026-08-26",
    tema: "Gestión del despacho",
    entradilla:
      "Es la pregunta que todo despacho se hace y casi nadie responde por escrito: qué cobrar por un arraigo, una renovación o una nacionalidad. Aquí están los rangos que se observan en el mercado, el porqué de que no haya tarifa oficial, y cómo estructurar el precio para no perder dinero por el camino.",
    imagenAlt:
      "Balanza de latón sobre un escritorio de despacho: en un platillo, documentos oficiales con sello de lacre; en el otro, monedas.",
    bloques: [
      {
        t: "p",
        texto:
          "Fijar honorarios en extranjería tiene algo de paradoja: es la decisión que más afecta a la cuenta de resultados del despacho y, a la vez, la que menos referencias públicas tiene. No hay tarifa oficial, los colegios no pueden publicar baremos y cada despacho fija lo suyo mirando de reojo al de al lado. Este artículo pone números encima de la mesa — con su metodología y sus límites dichos claramente.",
      },
      { t: "h2", texto: "Por qué no existe una tarifa oficial" },
      {
        t: "p",
        texto:
          "Desde la **Ley 25/2009** (la llamada «ley ómnibus», que modificó la Ley 2/1974 de Colegios Profesionales), los colegios tienen **prohibido establecer baremos orientativos** de honorarios o cualquier otra recomendación sobre precios. La única excepción legal son los informes para la tasación de costas judiciales. La CNMC ha sancionado a varios colegios por saltarse esta prohibición. Consecuencia práctica: los honorarios son libres, y cualquier «baremo del colegio» que circule en PDF es anterior a 2009 o directamente ilegal — no lo uses como escudo ante un cliente.",
      },
      { t: "h2", texto: "Las tres piezas del precio (y cuál lleva IVA)" },
      {
        t: "p",
        texto:
          "Un encargo de extranjería bien facturado separa tres conceptos. Mezclarlos no es solo un problema estético: cobrar la tasa dentro del honorario te hace pagar IVA sobre un dinero que no es tuyo.",
      },
      {
        t: "tabla",
        titulo: "Los tres componentes de una factura de extranjería",
        encabezados: ["Componente", "Qué es", "¿Lleva IVA?", "Ejemplo"],
        filas: [
          ["Honorario", "Tu trabajo profesional: estudio, preparación, presentación, seguimiento", "Sí, 21 %", "450 € por un arraigo social"],
          ["Tasa oficial", "Lo que cobra la Administración (modelos 790, códigos 052 y 012)", "No, si se repercute como suplido por su importe exacto", "La tasa de la autorización o de la TIE, al céntimo"],
          ["Otros suplidos", "Gastos adelantados por cuenta del cliente", "No, con factura o justificante a nombre del cliente", "Traducción jurada, certificados, apostillas"],
        ],
        nota: "Los importes de las tasas se actualizan periódicamente: consulta siempre el importe vigente del modelo 790 en la sede electrónica antes de presentar.",
      },
      { t: "h2", texto: "Rangos habituales en 2026" },
      {
        t: "nota",
        titulo: "Metodología, dicha claramente",
        texto:
          "No existe ninguna fuente oficial de honorarios. Los rangos siguientes son **orientativos**, observados en el mercado español en 2026 entre despachos especializados. Varían con la plaza (Madrid y Barcelona cotizan por encima), la urgencia, la complejidad del caso y el idioma del cliente. Son honorarios SIN IVA y SIN tasas.",
      },
      {
        t: "rangos",
        titulo: "Honorarios observados por trámite (€, sin IVA ni tasas)",
        unidad: "€",
        techo: 850,
        items: [
          { etiqueta: "Nacionalidad por residencia", min: 300, max: 800 },
          { etiqueta: "Arraigo (social, sociolaboral, familiar)", min: 350, max: 700 },
          { etiqueta: "Reagrupación familiar", min: 350, max: 650 },
          { etiqueta: "Estancia por estudios y prórrogas", min: 250, max: 500 },
          { etiqueta: "Renovación de autorización + TIE", min: 120, max: 300 },
          { etiqueta: "NIE, certificados, citas", min: 50, max: 150 },
        ],
        nota: "Rangos de honorarios observados en agosto de 2026. El tramo alto suele incluir recursos de subsanación y familia a cargo.",
      },
      {
        t: "p",
        texto:
          "Dos lecturas rápidas de esos rangos. Primera: **la renovación está sistemáticamente infravalorada** — se cobra a 120-300 € un trámite del que depende que el cliente conserve su estatus, y que en [2027 llegará en masa](/articulos/renovaciones-2027-regularizacion-extraordinaria). Segunda: el tramo alto de cada horquilla no es «caro»: suele incluir lo que el tramo bajo factura aparte (subsanaciones, más de un intento de cita, familiares a cargo).",
      },
      { t: "h2", texto: "Cómo estructurar el cobro" },
      {
        t: "ol",
        items: [
          "**Anticipo del 40-50 % al aceptar el encargo**, resto a la presentación (o a la resolución, si quieres diferenciarte). Sin anticipo, el incobrable es tuyo y financias tú el expediente.",
          "**Familia: precio por miembro**, no «por familia». Una reagrupación de cuatro no es una de uno. Lo habitual: tarifa completa el titular y un descuento del 20-40 % a partir del segundo miembro.",
          "**Fraccionar a partir de ~400 €** en dos o tres cuotas cerradas con fecha. Cobra mejor que un «ya me lo irás pagando».",
          "**La tasa, siempre como suplido separado** y por su importe exacto — y que el justificante quede en el expediente.",
        ],
      },
      { t: "h2", texto: "Tres errores que cuestan dinero" },
      {
        t: "ul",
        items: [
          "**Cobrar la tasa dentro del honorario.** Pagas 21 % de IVA sobre dinero que solo transita por tu cuenta. En un despacho con volumen, son cientos de euros al año regalados.",
          "**No pedir anticipo** «porque el cliente es de confianza». Los impagos de extranjería se concentran precisamente en los encargos sin anticipo: si el expediente se deniega, la voluntad de pagar desaparece con él.",
          "**No repercutir el trabajo documental.** Perseguir documentos es la mitad del expediente ([y donde más se pierde tiempo](/articulos/errores-documentales-retrasan-expediente-extranjeria)); si tu proceso lo resuelve rápido, es argumento para el tramo alto de la horquilla, no un regalo.",
        ],
      },
      {
        t: "faq",
        items: [
          {
            q: "¿Puede mi colegio decirme cuánto cobrar?",
            a: "No. Desde la Ley 25/2009, los colegios profesionales tienen prohibido publicar baremos o recomendaciones de honorarios (salvo para tasación de costas). Los honorarios son libres y se pactan por escrito con el cliente.",
          },
          {
            q: "¿La tasa de extranjería lleva IVA?",
            a: "Si la repercutes como suplido —por su importe exacto y con justificante— no lleva IVA. Si la integras en tu honorario, tributa como el resto: es el error de facturación más común del sector.",
          },
          {
            q: "¿Cuánto se cobra por un arraigo social en 2026?",
            a: "En el mercado se observan honorarios de entre 350 y 700 € sin IVA, tasas aparte, según plaza y complejidad. El tramo alto suele incluir subsanaciones y acompañamiento a cita.",
          },
          {
            q: "¿Es mejor cobrar todo al final?",
            a: "No: el estándar del sector es un anticipo del 40-50 % al aceptar el encargo y el resto a la presentación. El anticipo filtra al cliente que no va en serio y reparte el riesgo de denegación.",
          },
        ],
      },
    ],
  },
  {
    slug: "verifactu-despachos-extranjeria-fechas-2027",
    titulo: "VeriFactu para despachos de extranjería: fechas y obligaciones",
    descripcion:
      "VeriFactu será obligatorio el 1 de enero de 2027 para sociedades y el 1 de julio para autónomos. Qué exige el RD 1007/2023 y cómo preparar el despacho.",
    fecha: "2026-08-26",
    tema: "Facturación",
    entradilla:
      "2027 no solo trae la ola de renovaciones: también cambia las reglas de la factura de tu propio despacho. VeriFactu deja de ser un rumor y pasa a tener fechas firmes, sanciones concretas y una lista corta de cosas que conviene hacer antes.",
    imagenAlt:
      "Una factura de papel sobre un escritorio de cuero verde cuya mitad derecha se disuelve en trazos luminosos y un mosaico tipo QR.",
    bloques: [
      {
        t: "p",
        texto:
          "VeriFactu es el nombre popular del **Reglamento de los sistemas informáticos de facturación** (RD 1007/2023): a partir de 2027, el software con el que emites tus facturas deberá generar por cada una un **registro inalterable y encadenado**, con huella criptográfica y código QR, verificable por la Agencia Tributaria — y podrá (o no, a tu elección) remitirlo a la AEAT en el momento. Emitir facturas con Word, Excel o un programa no adaptado dejará de ser una opción legal.",
      },
      { t: "h2", texto: "El calendario, con sus normas" },
      {
        t: "hitos",
        items: [
          { fecha: "Julio 2021", titulo: "Ley 11/2021 antifraude", texto: "Crea el artículo 201 bis de la LGT: fabricar, comercializar o poseer «software de doble uso» pasa a ser infracción tributaria específica." },
          { fecha: "Diciembre 2023", titulo: "RD 1007/2023", texto: "Aprueba el reglamento (RRSIF): registros de facturación inalterables, encadenados y con QR." },
          { fecha: "Octubre 2024", titulo: "Orden HAC/1177/2024", texto: "Especificaciones técnicas: formato de los registros, huella, firma y remisión." },
          { fecha: "29 julio 2025", titulo: "Obligación para los fabricantes", texto: "Desde esta fecha solo puede comercializarse software de facturación conforme al reglamento." },
          { fecha: "2025", titulo: "Aplazamientos (RD 254/2025 y RDL 15/2025)", texto: "El calendario inicial de 2025-2026 se traslada definitivamente a 2027." },
          { fecha: "1 enero 2027", titulo: "Obligatorio para sociedades", texto: "Todos los contribuyentes del Impuesto sobre Sociedades que no estén en el SII.", destacado: true },
          { fecha: "1 julio 2027", titulo: "Obligatorio para autónomos y el resto", texto: "Profesionales en estimación directa y demás obligados no acogidos al SII.", destacado: true },
        ],
      },
      {
        t: "tabla",
        titulo: "¿A quién obliga y cuándo?",
        encabezados: ["Situación del despacho", "Fecha", "Nota"],
        filas: [
          ["Sociedad (SL, SLP…) sujeta al IS", "**1 de enero de 2027**", "La fecha que afecta a la mayoría de despachos con forma societaria"],
          ["Autónomo en estimación directa", "**1 de julio de 2027**", "La mayoría de gestores y abogados por cuenta propia"],
          ["Acogido al SII (grandes empresas, REDEME)", "Exento de VeriFactu", "Ya remite sus registros por el Suministro Inmediato de Información"],
          ["País Vasco y Navarra", "Sistema foral propio", "TicketBAI y equivalentes forales, con su propio calendario"],
        ],
      },
      { t: "h2", texto: "Las sanciones" },
      {
        t: "datos",
        items: [
          { valor: "50.000 €", etiqueta: "por ejercicio, para quien use software no conforme (art. 201 bis LGT)" },
          { valor: "150.000 €", etiqueta: "por ejercicio y tipo de software, para quien lo fabrique o comercialice" },
          { valor: "0 €", etiqueta: "cuesta preguntarle hoy a tu proveedor si estará listo" },
        ],
      },
      { t: "h2", texto: "Qué significa para un despacho de extranjería" },
      {
        t: "p",
        texto:
          "La facturación de extranjería tiene manías propias: **anticipos** al abrir el expediente, **tasas repercutidas como suplidos**, **cuotas fraccionadas**, facturas por miembro de familia. Todo eso seguirá siendo legal — pero cada emisión deberá generar su registro, y las correcciones deberán hacerse **por rectificativa o anulación, nunca borrando**: la serie queda encadenada y un hueco se nota. Si tu costumbre es «borro la factura y la vuelvo a hacer bien», VeriFactu es la fecha límite de esa costumbre.",
      },
      {
        t: "ul",
        items: [
          "**Pregunta a tu proveedor de facturación**, por escrito, si emitirá registros VeriFactu en tu fecha (1/1/2027 o 1/7/2027). Su respuesta te dice si tienes proveedor o tienes problema.",
          "**Si facturas con Word o Excel**, planifica el cambio este otoño: la migración de serie y numeración es lo que más cuesta, y [2027 va a ser un año sin tiempo libre](/articulos/renovaciones-2027-regularizacion-extraordinaria).",
          "**Revisa tu política de correcciones**: rectificativa e anulación con motivo, nunca reutilizar un número ni borrar una factura emitida.",
          "**Decide modalidad**: «VERI*FACTU» (remisión inmediata a la AEAT) o no remisión con conservación local firmada. Para un despacho pequeño, la remisión simplifica la carga de conservación.",
        ],
      },
      {
        t: "nota",
        titulo: "Y sí, nos afecta a nosotros también",
        texto:
          "Aproba emite facturas por tus expedientes, así que esta obligación es también nuestra: la adaptación VeriFactu del módulo de facturación está en el plan de producto para estar lista antes de tu fecha, con la numeración correlativa y las anulaciones ya funcionando como el reglamento exige.",
      },
      {
        t: "faq",
        items: [
          {
            q: "¿VeriFactu me afecta si soy autónomo?",
            a: "Sí. Los autónomos en estimación directa entran el 1 de julio de 2027 (las sociedades, el 1 de enero). Solo quedan fuera los acogidos al SII y los territorios forales, que tienen sistema propio.",
          },
          {
            q: "¿Puedo seguir facturando con Excel o Word?",
            a: "Hasta tu fecha de 2027, sí. A partir de ella, no: cada factura deberá nacer de un sistema que genere registro inalterable con huella y QR, cosa que una hoja de cálculo no hace.",
          },
          {
            q: "¿VeriFactu es lo mismo que la factura electrónica obligatoria B2B?",
            a: "No. Son dos obligaciones distintas: VeriFactu (RD 1007/2023) regula CÓMO se genera el registro de cada factura; la factura electrónica B2B de la Ley Crea y Crece regula el FORMATO de intercambio entre empresas y sigue pendiente de su propio desarrollo reglamentario.",
          },
          {
            q: "¿Qué pasa si mi software no cumple en la fecha?",
            a: "El uso de software no conforme es infracción del artículo 201 bis de la LGT, con multa de hasta 50.000 € por ejercicio. Para el fabricante que lo comercialice, hasta 150.000 € por ejercicio y tipo de software.",
          },
        ],
      },
    ],
  },
  {
    slug: "renovaciones-2027-regularizacion-extraordinaria",
    titulo: "La ola de renovaciones de 2027: qué viene y cómo prepararla",
    descripcion:
      "En 2026 se presentaron 1.174.978 solicitudes de regularización extraordinaria. Las autorizaciones duran un año: a mediados de 2027 vencen casi todas a la vez.",
    fecha: "2026-08-22",
    tema: "Regularización 2026",
    entradilla:
      "La regularización extraordinaria de 2026 no termina cuando se resuelve el último expediente: empieza otra vez doce meses después. Estos son los números y lo que un despacho puede hacer hoy.",
    imagenAlt:
      "Ilustración: una ola inmensa formada por miles de expedientes de papel avanza hacia una mesa pequeña con un calendario.",
    bloques: [
      { t: "h2", texto: "Qué pasó en 2026" },
      {
        t: "p",
        texto:
          "La base legal fue el **Real Decreto 316/2026, de 14 de abril** (BOE del 15, en vigor el 16), que modificó el RD 1155/2024. Abrió una ventana de presentación del **16 de abril al 30 de junio de 2026**, que se cerró sin prórroga, con dos vías: la disposición adicional 20ª, para solicitantes de asilo anteriores al 1 de enero de 2026, y la 21ª, un arraigo extraordinario para quienes acreditaran presencia en España antes de esa misma fecha. La segunda concentró cerca del 80 % de las solicitudes.",
      },
      {
        t: "nota",
        titulo: "Un error frecuente",
        texto:
          "La regularización de 2026 NO es la ILP registrada en 2024, que sigue parada en comisión. Citar la ILP como base legal en un escrito es un fallo que se ve, y se ve rápido.",
      },
      { t: "h2", texto: "Los números oficiales" },
      {
        t: "p",
        texto:
          "Según los datos comunicados por el Gobierno el 2 de julio de 2026, la previsión oficial de 750.000 solicitudes se quedó corta en más de un 55 %:",
      },
      {
        t: "datos",
        items: [
          { valor: "1.174.978", etiqueta: "solicitudes presentadas" },
          { valor: "≈608.000", etiqueta: "admitidas a trámite (52 %)" },
          { valor: "≈566.000", etiqueta: "pendientes de admisión" },
        ],
      },
      {
        t: "p",
        texto:
          "Por territorio, Cataluña encabezó el volumen (257.602 solicitudes), seguida de Madrid (202.424), la Comunidad Valenciana (167.286) y Andalucía (161.557). Por nacionalidad, Colombia (25,9 %), Marruecos (13,3 %) y Venezuela (11,8 %).",
      },
      {
        t: "p",
        texto:
          "Y un dato que conviene mirar dos veces si trabajas en el sector: **el 58 % de las solicitudes las presentaron abogados** y el 8,4 % gestores administrativos. El resto se repartió entre funcionarios habilitados (16,8 %) y los propios interesados (7,3 %). El grueso del expediente pasó por un despacho.",
      },
      { t: "h2", texto: "Por qué 2027 es el problema de verdad" },
      {
        t: "p",
        texto:
          "Las autorizaciones concedidas por esta vía tienen una duración de **un año**. Como la ventana de presentación duró diez semanas y las resoluciones se concentran en los meses siguientes, los vencimientos también se concentran: alrededor de **600.000 autorizaciones expiran de forma casi simultánea a mediados de 2027**.",
      },
      {
        t: "p",
        texto:
          "Es, probablemente, el pico de volumen más previsible que ha tenido nunca el sector: se conoce el número, se conoce la fecha aproximada y se sabe quién lo va a atender. Los colegios profesionales llevan meses avisando.",
      },
      {
        t: "cita",
        texto:
          "El volumen que nos puede llegar será inmenso… si no, no sé cómo vamos a llegar.",
        autor: "Olga Gracia, CCOO, sobre 2027",
      },
      {
        t: "cita",
        texto:
          "El gran pánico que tengo es la provincia de Barcelona.",
        autor: "Quim Clavaguera, Comisión de Extranjería del ICAB",
      },
      {
        t: "p",
        texto:
          "El contexto de 2026 ya venía tenso: huelga indefinida en las Oficinas de Extranjería desde el 20 de abril, plazos de entre tres y nueve meses según la provincia, y clientes buscando cita de huellas durante meses. Añadir 600.000 renovaciones sobre esa base no es un aumento de trabajo: es un cuello de botella anunciado.",
      },
      { t: "h2", texto: "Qué puede hacer un despacho ahora" },
      {
        t: "p",
        texto:
          "La diferencia entre un despacho que pasa 2027 y otro que lo sufre no va a estar en la velocidad de tramitación, sino en la **anticipación**. Cuatro cosas se pueden hacer con un año de margen:",
      },
      {
        t: "ol",
        items: [
          "**Tener la lista.** Saber exactamente qué expedientes de regularización presentaste, cuándo se resolvieron y, por tanto, cuándo caducan. Si esa lista está en la cabeza de alguien o repartida en carpetas, no existe.",
          "**Fechar los vencimientos, no las intenciones.** La renovación se puede presentar dentro de la ventana legal previa a la caducidad. Ese margen es tu capacidad de repartir el trabajo: sin fechas concretas, todo cae la misma semana.",
          "**Avisar antes que el cliente pregunte.** Un recordatorio a 90, 60 y 30 días convierte una avalancha en un calendario. Y evita la renovación fuera de plazo, que es un problema mucho más caro.",
          "**Reutilizar la documentación.** Buena parte de lo que pediste en 2026 sirve en 2027. Un expediente cuyos documentos siguen accesibles y ordenados se renueva en una fracción del tiempo.",
        ],
      },
      {
        t: "nota",
        titulo: "Cómo lo resuelve Aproba",
        texto:
          "Vigía es la parte de Aproba que se ocupa exactamente de esto: registra la caducidad de cada autorización, avisa con antelación y permite iniciar la renovación en un clic, reutilizando los datos y documentos del expediente anterior.",
      },
      {
        t: "p",
        texto:
          "No hace falta esperar a 2027 para saber si tu despacho está preparado. Basta con una pregunta: **¿puedes decir hoy, en menos de un minuto, cuántos expedientes tuyos vencen en junio de 2027?**",
      },
    ],
  },
  {
    slug: "subsanacion-regularizacion-plazo",
    titulo: "Subsanación de la regularización: el plazo es de 15 días",
    descripcion:
      "Muchos despachos citan 10 días y el Real Decreto dice 15. No responder implica archivo automático del expediente. Qué revisar antes del 30 de septiembre de 2026.",
    fecha: "2026-08-22",
    tema: "Plazos",
    entradilla:
      "La fase de subsanación de la regularización extraordinaria afecta a cientos de miles de expedientes y se cierra el 30 de septiembre de 2026. El plazo que circula por el sector no siempre es el correcto.",
    imagenAlt:
      "Ilustración: un calendario con una fecha rodeada en verde, un reloj de arena casi vacío y un sobre cerrado.",
    bloques: [
      { t: "h2", texto: "El plazo: 15 días, no 10" },
      {
        t: "p",
        texto:
          "El texto del Real Decreto 316/2026 fija en **15 días** el plazo para subsanar. Circula con insistencia la cifra de 10 días, probablemente por analogía con otros procedimientos, y no es la que corresponde a este.",
      },
      {
        t: "nota",
        titulo: "La notificación manda",
        texto:
          "Antes de calcular nada, lee el requerimiento concreto: es él quien fija el día inicial del cómputo y la forma de contarlo. Si hay contradicción entre lo que recuerdas y lo que dice la notificación, gana la notificación.",
      },
      { t: "h2", texto: "Qué pasa si no se responde" },
      {
        t: "p",
        texto:
          "El silencio no deja el expediente en pausa: provoca el **archivo automático**. Es la diferencia entre un trámite que se retrasa y un trámite que desaparece, y obliga a empezar de cero por una vía que ya está cerrada. Por eso la subsanación no es un asunto administrativo menor: es el punto del procedimiento donde más expedientes se pierden por razones que no tienen nada que ver con el fondo del caso.",
      },
      { t: "h2", texto: "El calendario que queda" },
      {
        t: "p",
        texto:
          "La fase de subsanación se desarrolla en 383 oficinas de Correos y se extiende **hasta el 30 de septiembre de 2026**. En julio de 2026 había en torno a 566.000 expedientes pendientes de la decisión de admisión, el colectivo donde se concentran los requerimientos.",
      },
      {
        t: "p",
        texto:
          "Conviene tener presente además que el plazo máximo de resolución es de tres meses desde la presentación y que **el silencio es negativo**. Un expediente presentado en junio y no resuelto en septiembre no está simplemente «en trámite»: abre la puerta a recurso, con un mes para la alzada y dos para el contencioso.",
      },
      { t: "h2", texto: "Cómo organizarlo sin perder expedientes" },
      {
        t: "ul",
        items: [
          "**Una sola lista de requerimientos vivos**, con la fecha de notificación y la fecha límite calculada, no «pendiente de revisar».",
          "**Un responsable por expediente.** Los requerimientos se pierden en los huecos entre personas, no dentro del trabajo de una.",
          "**Contacto con el cliente el mismo día.** Si el documento lo tiene que aportar él, cada día que tardas en pedirlo sale de tus 15.",
          "**Acuse de lo presentado.** Guarda constancia de qué se aportó y cuándo: es lo primero que necesitarás si hay que recurrir un archivo.",
        ],
      },
      {
        t: "nota",
        titulo: "Revisión profesional",
        texto:
          "Este artículo resume plazos publicados y no sustituye la lectura del requerimiento ni el criterio del profesional que lleva el expediente.",
      },
    ],
  },
  {
    slug: "errores-documentales-retrasan-expediente-extranjeria",
    titulo: "Siete errores documentales que retrasan un expediente de extranjería",
    descripcion:
      "Pasaportes que caducan a mitad de trámite, empadronamientos fuera de fecha, documentos ilegibles: los fallos que provocan requerimientos y cómo detectarlos antes de presentar.",
    fecha: "2026-08-22",
    tema: "Práctica del despacho",
    entradilla:
      "Casi ningún requerimiento llega por el fondo del asunto. Llega porque falta una hoja, porque una fecha no cuadra o porque la foto del móvil no se lee. Estos son los siete casos más repetidos.",
    imagenAlt:
      "Ilustración cenital: documentos en blanco y un pasaporte sobre una mesa, con una lupa que destaca el detalle marcado por una pestaña ámbar.",
    bloques: [
      { t: "h2", texto: "1. El documento ilegible" },
      {
        t: "p",
        texto:
          "La foto tomada de noche, en diagonal y con sombra sigue siendo la primera causa de rechazo evitable. No es un problema del cliente: es un problema de instrucción. Pedir «una foto del pasaporte» produce fotos de pasaporte; pedir «la página de la foto, completa, con las cuatro esquinas visibles y sin reflejos» produce documentos válidos.",
      },
      { t: "h2", texto: "2. El pasaporte que caduca durante el trámite" },
      {
        t: "p",
        texto:
          "Un pasaporte válido el día de la presentación puede no serlo el día de la resolución. Revisar la caducidad **contra la duración previsible del procedimiento**, y no contra la fecha de hoy, evita un requerimiento que llega meses después, cuando el cliente ya ha desconectado del trámite.",
      },
      { t: "h2", texto: "3. El empadronamiento fuera de fecha" },
      {
        t: "p",
        texto:
          "Los certificados de empadronamiento tienen una vigencia limitada a efectos de presentación. El error típico no es olvidarlo: es pedirlo demasiado pronto, al abrir el expediente, y presentarlo cuando ya no sirve porque la recogida del resto de documentos se alargó.",
      },
      { t: "h2", texto: "4. Nombres que no coinciden entre documentos" },
      {
        t: "p",
        texto:
          "Dos apellidos en el pasaporte, uno en el certificado de nacimiento, una tilde de más en el padrón. Cada divergencia es una pregunta que alguien tendrá que responder por escrito. Detectarla al recibir el documento cuesta un minuto; detectarla después de un requerimiento cuesta semanas.",
      },
      { t: "h2", texto: "5. Traducciones y legalizaciones incompletas" },
      {
        t: "p",
        texto:
          "El documento extranjero llega traducido pero sin legalizar, o apostillado pero sin traducción jurada. Al ser dos requisitos distintos que viajan juntos, es fácil dar uno por hecho al ver el otro.",
      },
      { t: "h2", texto: "6. Documentación económica insuficiente" },
      {
        t: "p",
        texto:
          "Aportar la nómina no es acreditar medios. Faltan el contrato, el extracto, la continuidad del ingreso o el cálculo respecto al umbral aplicable. Es el punto donde más se confunde «tengo un documento del tema» con «he acreditado el requisito».",
      },
      { t: "h2", texto: "7. La tasa pagada… y no aportada" },
      {
        t: "p",
        texto:
          "El modelo 790-012 se abona y el justificante se queda en el correo del cliente, en una carpeta de descargas o en un WhatsApp. El pago existe; el expediente no lo demuestra.",
      },
      { t: "h2", texto: "El patrón común" },
      {
        t: "p",
        texto:
          "Ninguno de estos siete errores es un error de criterio jurídico. Todos son de **control**: alguien tenía que mirar un documento a la luz de una fecha o de otro documento, y ese cruce no se hizo. Es exactamente el tipo de revisión que se puede sistematizar, con una lista fija por trámite y una validación de cada documento en el momento en que entra, no la víspera de presentar.",
      },
      {
        t: "nota",
        titulo: "Cómo lo resuelve Aproba",
        texto:
          "Aproba valida cada documento al recibirlo, avisa de lo que falta según el trámite y no deja presentar a ciegas: la lista de requisitos la fija el servicio, no la memoria de quien prepara el expediente.",
      },
    ],
  },
];

export const listaArticulos = (): Articulo[] =>
  [...ARTICULOS].sort((a, b) => (b.actualizado ?? b.fecha).localeCompare(a.actualizado ?? a.fecha));

export const getArticulo = (slug: string): Articulo | undefined => ARTICULOS.find((a) => a.slug === slug);

// FAQ del artículo (si la hay) — la página la convierte en JSON-LD FAQPage, el formato
// que permite al buscador mostrar las preguntas desplegadas bajo el resultado.
export function faqDe(a: Articulo): { q: string; a: string }[] {
  const b = a.bloques.find((x) => x.t === "faq");
  return b && b.t === "faq" ? b.items : [];
}

// Minutos de lectura calculados, no escritos a mano: si el texto crece, el dato sigue
// siendo verdad (200 palabras/minuto, la referencia habitual en castellano).
// Cuerpo aplanado a texto: lo usan el tiempo de lectura y el buscador del índice.
export function textoPlano(a: Articulo): string {
  return a.bloques
    .map((b) => {
      if (b.t === "ul" || b.t === "ol") return b.items.join(" ");
      if (b.t === "datos") return b.items.map((d) => `${d.valor} ${d.etiqueta}`).join(" ");
      if (b.t === "cita") return `${b.texto} ${b.autor}`;
      if (b.t === "nota") return `${b.titulo ?? ""} ${b.texto}`;
      if (b.t === "tabla") return [b.titulo ?? "", ...b.encabezados, ...b.filas.flat(), b.nota ?? ""].join(" ");
      if (b.t === "rangos") return [b.titulo, ...b.items.map((x) => x.etiqueta), b.nota ?? ""].join(" ");
      if (b.t === "hitos") return b.items.map((x) => `${x.fecha} ${x.titulo} ${x.texto ?? ""}`).join(" ");
      if (b.t === "faq") return b.items.map((x) => `${x.q} ${x.a}`).join(" ");
      if (b.t === "barras") return [b.titulo, ...b.items.map((x) => x.etiqueta), b.nota ?? ""].join(" ");
      if (b.t === "esquema") return [b.titulo, ...b.nodos.map((n) => `${n.titulo} ${n.texto ?? ""}`), b.destino.titulo, b.destino.texto ?? "", b.nota ?? ""].join(" ");
      return b.texto;
    })
    .join(" ");
}

export function minutosDeLectura(a: Articulo): number {
  return Math.max(1, Math.round(textoPlano(a).split(/\s+/).filter(Boolean).length / 200));
}

export const fechaLarga = (iso: string): string => {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
};
