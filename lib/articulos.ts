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
  // Procedimiento paso a paso (25/09/2026, guía de Mercurio): pasos numerados y, en cada
  // uno, `falla` = el punto exacto donde se atasca. Una guía se lee en orden; por eso no
  // es una tabla ni una lista suelta.
  | { t: "pasos"; titulo?: string; items: { titulo: string; texto: string; falla?: string }[]; nota?: string }
  // Lista de comprobación (antes de firmar, antes de presentar): una marca por punto, sin JS.
  | { t: "checklist"; titulo: string; items: string[]; nota?: string }
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
    // 26/09/2026 — el requerimiento, pedido por Matthias tras llevar los requerimientos a la
    // lista de Expedientes y a la campana. Fuente única: Ley 39/2015 consolidada (BOE, últ.
    // mod. 06/11/2024), leída el 26/09: arts. 22.1.a, 30.2, 30.3, 30.5, 30.7, 31.2.b, 32.1-3,
    // 41.5, 43.2, 68.1-2, 73.1-3 y 95.1-2. El ejemplo (1 → 16/10/2026) se contó a mano: el
    // lunes 12 es la Fiesta Nacional. Lo que se dice de Aproba sale del código
    // (lib/requerimientos.ts, lib/requerimientos-escaner.ts, lib/alertas.ts).
    slug: "requerimiento-extranjeria-plazo-10-dias-como-responder",
    titulo: "Requerimiento en extranjería: los 10 días y cómo responder",
    descripcion:
      "Qué es un requerimiento de extranjería, cómo se cuentan los diez días hábiles, cuándo pedir la ampliación y qué pasa si no se contesta, según la Ley 39/2015.",
    fecha: "2026-09-26",
    tema: "Procedimiento",
    entradilla:
      "Un requerimiento no es una denegación: es la Administración diciendo qué falta antes de resolver. Pero solo da diez días hábiles, empieza a contar al día siguiente de la notificación y, si se deja pasar, se tiene al solicitante por desistido o se resuelve sin lo que faltaba. Esto dice la ley, con un ejemplo contado día a día.",
    imagenAlt:
      "Diez fichas de cerámica crema en fila sobre un escritorio de madera clara: las seis primeras llevan circuitos verde esmeralda y las cuatro últimas siguen en blanco; detrás, un folio en blanco en una bandeja de metacrilato, sujeto con una pinza dorada.",
    bloques: [
      {
        t: "p",
        texto:
          "El requerimiento llega cuando la oficina de extranjería, al revisar un expediente, echa algo en falta: un documento, una traducción, un dato que no cuadra. A menudo nace de un [error documental](/articulos/errores-documentales-retrasan-expediente-extranjeria) que se pudo ver antes de presentar. La **Ley 39/2015** fija el plazo para responder, cómo se cuenta y qué pasa si no se contesta.",
      },
      {
        t: "datos",
        items: [
          { valor: "10 días", etiqueta: "hábiles para contestar, desde el día siguiente a la notificación (arts. 68.1 y 73.1)" },
          { valor: "+5 días", etiqueta: "de ampliación como máximo, pedida antes de que venza el plazo (arts. 68.2 y 32.3)" },
          { valor: "10 + 10", etiqueta: "días: diez naturales para abrir la notificación electrónica y diez hábiles para contestar" },
          { valor: "Pausa", etiqueta: "en el plazo para resolver: puede suspenderse mientras dura el requerimiento (art. 22.1.a)" },
        ],
      },
      { t: "h2", texto: "Dos requerimientos que se parecen y no acaban igual" },
      {
        t: "p",
        texto:
          "El primero es el de **subsanación de la solicitud** (art. 68.1): la solicitud no reúne los requisitos o le faltan documentos preceptivos, y se conceden diez días advirtiendo que, si no se completa, **se tendrá al solicitante por desistido**, previa resolución. El segundo llega con el expediente en marcha: la Administración pide cumplir un **trámite** o completar un acto que no reúne los requisitos (art. 73). También son diez días, pero lo que está en juego es **el derecho a ese trámite**, no la solicitud entera.",
      },
      {
        t: "tabla",
        titulo: "Qué pasa si no se contesta",
        encabezados: ["Requerimiento", "Plazo", "Si no se atiende"],
        filas: [
          ["Subsanar la solicitud (art. 68.1)", "**10 días hábiles**, ampliables hasta 5 (art. 68.2)", "Desistimiento, previa resolución: la solicitud se archiva"],
          ["Cumplir un trámite (art. 73)", "**10 días hábiles**, salvo que la norma fije otro", "Puede darse por perdido el trámite; aun así, se admite si llega antes o dentro del día en que se notifica la resolución que da el plazo por pasado (art. 73.3)"],
          ["Expediente parado por causa del interesado (art. 95)", "**3 meses** desde la advertencia", "Caducidad y archivo, solo si lo pendiente era indispensable para resolver"],
        ],
        nota: "Fuente: Ley 39/2015, texto consolidado del BOE (última modificación, 6 de noviembre de 2024).",
      },
      { t: "h2", texto: "Cómo se cuentan los diez días" },
      {
        t: "p",
        texto:
          "El plazo empieza **el día siguiente a la notificación** (art. 30.3). En papel, cuenta el día de la entrega. En electrónico, el día en que se abre o, si nadie la abre y esa vía era obligatoria o elegida, el día en que se entiende rechazada, **diez días naturales** después de la puesta a disposición (art. 43.2), y el procedimiento sigue (art. 41.5): lo explicamos en [quién recibe las notificaciones](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias).",
      },
      {
        t: "p",
        texto:
          "Desde ahí cuentan solo los **días hábiles**: fuera sábados, domingos y festivos (art. 30.2), los nacionales y los autonómicos o locales del calendario oficial de días inhábiles (art. 30.7). Si el último día es inhábil, el plazo acaba el primer hábil siguiente (art. 30.5). Un ejemplo de este otoño:",
      },
      {
        t: "hitos",
        items: [
          { fecha: "Jueves 1 de octubre de 2026", titulo: "Se abre la notificación", texto: "Ese día no cuenta." },
          { fecha: "Viernes 2 de octubre", titulo: "Día 1", texto: "El plazo arranca al día siguiente (art. 30.3)." },
          { fecha: "Lunes 12 de octubre", titulo: "No cuenta", texto: "Fiesta Nacional de España: inhábil en todo el territorio, como los fines de semana." },
          {
            fecha: "Viernes 16 de octubre",
            titulo: "Día 10: último día",
            texto: "Si no hay festivo autonómico o local por medio. Saltando solo los fines de semana saldría el jueves 15.",
            destacado: true,
          },
        ],
      },
      {
        t: "p",
        texto:
          "Mercurio registra a cualquier hora, pero lo presentado en sábado, domingo o festivo cuenta como presentado **a primera hora del siguiente día hábil** (art. 31.2.b): no gana tiempo, como explicamos en la [guía de Mercurio](/articulos/mercurio-extranjeria-presentar-paso-a-paso).",
      },
      { t: "h2", texto: "Si el documento no llega a tiempo" },
      {
        t: "p",
        texto:
          "Un certificado de antecedentes penales que hay que pedir en el país de origen no siempre se consigue en dos semanas. La ley da margen, pero **solo si se pide pronto**: la petición y la decisión tienen que llegar antes del vencimiento, y un plazo vencido ya no se amplía (art. 32.3).",
      },
      {
        t: "checklist",
        titulo: "Antes del día 10",
        items: [
          "**Pedir la ampliación por escrito**, explicando la dificultad: hasta cinco días más (arts. 68.2 y 32.1). La decisión no se puede recurrir por separado (art. 32.3).",
          "**Si hay que hacer gestiones en el extranjero**, invocar el art. 32.2: en esos procedimientos la ampliación máxima se aplica «en todo caso».",
          "**Aportar lo que ya se tiene** y explicar lo que falta, con la prueba de que se ha pedido: una respuesta parcial a tiempo deja constancia de la diligencia; el silencio, no.",
          "**Contestar punto por punto**, en el orden del requerimiento, con el número de expediente.",
          "**Guardar el justificante de registro** en el expediente el mismo día: es lo que acredita la fecha.",
        ],
      },
      { t: "h2", texto: "El requerimiento también mueve la fecha del silencio" },
      {
        t: "p",
        texto:
          "La Administración puede **suspender el plazo máximo para resolver** desde que notifica el requerimiento hasta que se cumple o, si no se cumple, hasta que vence el plazo concedido (art. 22.1.a). En una renovación con [silencio positivo](/articulos/silencio-administrativo-extranjeria-plazos-2026), la fecha en que se entiende concedida se corre esos días. Si contestas a los tres días, el reloj se para tres días; si esperas al último, unas dos semanas. Responder pronto también acerca la resolución.",
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Aproba no lee la DEHú ni la sede: el requerimiento lo anotas en la ficha del expediente, con lo que piden y la fecha límite que figura en él. El botón «Calcular 10 días hábiles» propone esa fecha saltando los fines de semana; no conoce los festivos, así que solo puede equivocarse hacia el lado seguro (en el ejemplo marcaría el jueves 15), y manda la fecha que tú dejes. Después avisa al despacho por correo al entrar en el margen que elijas, a tres días, a uno, el día del vencimiento y el siguiente si sigue pendiente. En Expedientes, cada expediente con requerimiento muestra los días que quedan y el filtro «Requerimientos» los reúne; la campana del encabezado junta lo que está por vencer, también las [renovaciones](/funciones/radar-de-renovaciones). Al cliente no le escribe por su cuenta.",
      },
      {
        t: "faq",
        items: [
          {
            q: "¿Los diez días de un requerimiento son hábiles o naturales?",
            a: "Hábiles: no cuentan sábados, domingos ni festivos (art. 30.2 de la Ley 39/2015). Los diez días naturales son otros: los que hay para abrir una notificación electrónica antes de que se entienda rechazada (art. 43.2).",
          },
          {
            q: "¿Desde cuándo cuenta el plazo del requerimiento?",
            a: "Desde el día siguiente a la notificación (art. 30.3): el siguiente al día en que se abrió o, si nadie la abrió, al día en que se entendió rechazada, diez días naturales después de la puesta a disposición.",
          },
          {
            q: "¿Se puede pedir más plazo para contestar?",
            a: "Sí: hasta cinco días más si aportar los documentos presenta dificultades especiales (art. 68.2). Hay que pedirlo antes de que venza, porque un plazo vencido no se amplía (art. 32.3).",
          },
          {
            q: "¿Qué pasa si contesto tarde?",
            a: "Depende del requerimiento. Si era de subsanación de la solicitud, la ley prevé tener al solicitante por desistido, mediante resolución (art. 68.1). Si era para cumplir un trámite, la respuesta todavía se admite si llega antes o dentro del día en que se notifica la resolución que da el plazo por transcurrido (art. 73.3).",
          },
        ],
      },
    ],
  },
  {
    // 25/09/2026 — primer artículo en formato GUÍA (bloques `pasos` y `checklist`), para
    // que la serie no parezca calcada. Fuentes, todas leídas el 23-25/09: manual de usuario
    // «Plataforma de Extranjería. Mercurio Iniciales» (SGAD, 22 págs.), ficha del
    // procedimiento en sede.administracionespublicas.gob.es (/directorio/mercurio2), Ley
    // 39/2015 consolidada (BOE, últ. mod. 06/11/2024: arts. 14.2.c, 30.2, 31.2, 32.4, 68,
    // 73.1), ICAM 13/03/2024 (recursos por Mercurio) y la ficha pública de la extensión en
    // Chrome Web Store (v0.2.1).
    slug: "mercurio-extranjeria-presentar-paso-a-paso",
    titulo: "Mercurio paso a paso: cómo presenta un despacho de extranjería",
    descripcion:
      "Guía de Mercurio para despachos: acceso por el Consejo General, adjuntos de 6 MB, firma con AutoFirma, el resguardo que acredita y el número de expediente.",
    fecha: "2026-09-25",
    tema: "Presentación telemática",
    entradilla:
      "Mercurio no es difícil: es estricto, y casi todos sus rechazos llegan al final. Un «nº» en el nombre de un archivo, un PDF de 7 MB o un certificado distinto del que abrió la sesión bloquean la presentación en los últimos pasos. Esta guía recorre los seis, con el punto exacto donde se atasca cada uno.",
    imagenAlt:
      "Tarjeta blanca con chip dorado en un soporte de aluminio sobre una mesa de terrazo claro; de ella parten trazos de circuito verde esmeralda que suben hasta un emblema circular suspendido sobre un taco de papel crema sujeto con una pinza de latón.",
    bloques: [
      {
        t: "p",
        texto:
          "Mercurio es la aplicación de la sede electrónica para presentar solicitudes de extranjería por internet: autorizaciones iniciales, renovaciones, prórrogas y algunas modificaciones. También sirve para **aportar documentación a expedientes en trámite**, que es por donde puede entrar la respuesta a un requerimiento.",
      },
      {
        t: "p",
        texto:
          "Para un profesional colegiado no es una opción: quien ejerce una profesión de colegiación obligatoria debe relacionarse por medios electrónicos en los trámites de esa profesión (art. 14.2.c de la Ley 39/2015). Si presenta en papel, se le requiere que subsane por vía electrónica y **la fecha de presentación pasa a ser la de la subsanación** (art. 68.4). En una renovación al límite de plazo, eso no es un detalle.",
      },
      { t: "h2", texto: "Seis pasos, y dónde se atasca cada uno" },
      {
        t: "pasos",
        titulo: "Presentar en Mercurio",
        items: [
          {
            titulo: "Entrar por el acceso de tu colectivo",
            texto:
              "En la sede: Procedimientos › Extranjería › «MERCURIO – Solicitudes de autorizaciones de Extranjería – Presentación Telemática». Junto al acceso individual hay accesos para **graduados sociales, gestores administrativos y abogacía**, que exigen estar dado de alta en el Consejo General correspondiente. Se elige la provincia y se entra con Cl@ve y un certificado personal instalado en el navegador.",
            falla: "El certificado con el que entras es el único con el que podrás firmar en el paso 5: si en el equipo hay varios, elige ya el definitivo.",
          },
          {
            titulo: "Elegir el modelo y rellenar las pestañas",
            texto:
              "Mercurio solo ofrece los modelos habilitados para presentación telemática y, en esa pantalla, comprueba si AutoFirma está instalada. Luego vienen las pestañas: las de datos (extranjero, reagrupante, presentador, domicilio de notificación, según el modelo), la del **tipo de autorización** y la de **anexos**, donde se autoriza o se deniega que la Administración consulte documentos por su cuenta.",
            falla: "No deja cambiar de pestaña mientras falte un dato obligatorio: la ficha tiene que estar completa antes de abrir Mercurio, no durante.",
          },
          {
            titulo: "Concluir: guardar no es presentar",
            texto:
              "**Concluir**, tras aceptar la cláusula de protección de datos, guarda la solicitud y ofrece dos salidas: **Descargar solicitud**, el impreso relleno para presentarlo en papel, y **Presentación electrónica**, que pide declarar que quien presenta es el sujeto legitimado.",
            falla: "El impreso descargado no es una presentación: hasta el paso 5 no hay registro ni fecha.",
          },
          {
            titulo: "Adjuntar la documentación",
            texto:
              "Se adjuntan tantos archivos como haga falta, con tres límites: **pdf, doc, jpg, tif o gif**; **6 MB por archivo**; y en el nombre, solo letras (con tilde y ñ), números, espacios, guiones, guion bajo, puntos y paréntesis. Cada archivo lleva un tipo del desplegable, y «Otros» pide una descripción. Incluye el justificante de la tasa ([790-052](/tasas/790-052), y también la [790-062](/tasas/790-062) si hay trabajo): si falta, la ficha oficial remite a llevarlo a la oficina, con retraso.",
            falla: "Un PDF de 9 MB sacado del móvil, un PNG o un «Pasaporte nº 2.pdf»: ninguno pasa. Renombra y comprime antes de abrir Mercurio.",
          },
          {
            titulo: "Comprobar, firmar y registrar",
            texto:
              "La comprobación resume lo que entrará en el registro y permite descargar el PDF con los datos a registrar: es el último momento para corregir. **Firmar y registrar** abre AutoFirma y solo hay que elegir el certificado. El resto es automático: firma de los datos y los adjuntos, registro a través de la plataforma GEISER y justificante.",
            falla: "Con un certificado distinto del usado en Cl@ve, la aplicación no firma. Sin AutoFirma instalada, tampoco.",
          },
          {
            titulo: "Descargar el resguardo, no la copia",
            texto:
              "Al final hay dos descargas. **Descargar resguardo** es el justificante de registro y **sí acredita** la presentación. **Descargar presentación** es una copia del formulario con los datos de registro y, como advierte el manual, **no es válida** para acreditarla.",
            falla: "Archivar solo la «presentación» porque parece más completa. La fecha la acredita el resguardo: guárdalo en el expediente ese mismo día.",
          },
        ],
        nota: "Fuente: manual «Mercurio Iniciales» (Secretaría General de Administración Digital) y ficha oficial del procedimiento.",
      },
      {
        t: "checklist",
        titulo: "Antes de pulsar «Firmar y registrar»",
        items: [
          "Cada archivo pesa menos de 6 MB y es pdf, doc, jpg, tif o gif.",
          "Ningún nombre de archivo lleva «º», «ª», «&», comas ni apóstrofos.",
          "Cada documento tiene su tipo, y los de «Otros», su descripción.",
          "El justificante de la tasa va adjunto.",
          "El domicilio de notificación es el de quien abrirá los requerimientos ([quién recibe las notificaciones](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias)).",
          "El certificado que tienes a mano es el mismo con el que entraste por Cl@ve, y AutoFirma responde.",
        ],
      },
      { t: "h2", texto: "Después del resguardo: el número de expediente" },
      {
        t: "p",
        texto:
          "El resguardo acredita la presentación, pero todavía no hay expediente. Cuando la oficina de extranjería recibe la solicitud le asigna un **ID de expediente**, que Mercurio devuelve en «Consultar solicitud existente» con cuatro datos: el identificador del formulario (arriba a la derecha en cada pantalla y en la copia descargada), la fecha de presentación, la nacionalidad y el año de nacimiento del solicitante.",
      },
      {
        t: "hitos",
        items: [
          { fecha: "Al registrar", titulo: "Resguardo", texto: "Acredita la presentación y su fecha." },
          {
            fecha: "Al recibirla la oficina",
            titulo: "ID de expediente",
            texto: "Tres respuestas posibles: no encontrada, encontrada pero aún no recibida por la oficina, o recibida, con su número.",
            destacado: true,
          },
          {
            fecha: "En trámite",
            titulo: "Estado",
            texto: "Se consulta en infoext2, con captcha. Si vence el plazo sin resolución, rige el [silencio de cada trámite](/articulos/silencio-administrativo-extranjeria-plazos-2026).",
          },
          {
            fecha: "Si hay requerimiento",
            titulo: "Aportar documentación",
            texto: "Por Mercurio, en el expediente en trámite. El plazo general es de diez días hábiles (arts. 68.1 y 73.1 de la Ley 39/2015).",
          },
        ],
      },
      { t: "h2", texto: "Fines de semana, festivos y caídas del sistema" },
      {
        t: "p",
        texto:
          "El registro electrónico admite presentaciones **todos los días del año, las 24 horas** (art. 31.2.a de la Ley 39/2015), pero en los plazos por días hábiles lo presentado en un día inhábil cuenta **a primera hora del primer día hábil siguiente** (art. 31.2.b), según el calendario de la sede. Presentar un sábado no gana un día: cuenta como el lunes.",
      },
      {
        t: "p",
        texto:
          "Una caída tampoco amplía el plazo por sí sola: la Administración **puede** ampliar los plazos no vencidos, pero publicando en la sede la incidencia y la ampliación concreta (art. 32.4). Si Mercurio falla, anota el número de error y haz capturas: es lo que pide el formulario de incidencias de la sede, y la prueba de que se intentó. Y no apures al último día.",
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Aproba no presenta en Mercurio ni firma por ti: la firma con tu certificado es tuya, y debe seguir siéndolo. Lo que ahorra es teclear dos veces: la extensión **Aproba para Mercurio**, para Chrome, rellena en el formulario los datos del extranjero que ya están en la ficha del expediente, y tú revisas, adjuntas, firmas y presentas. Los documentos del expediente se descargan de una vez, en un ZIP, y la misma ficha rellena los [formularios EX y las tasas 790](/funciones/formularios-en-un-clic).",
      },
      {
        t: "faq",
        items: [
          {
            q: "¿Quién puede presentar por Mercurio?",
            a: "El propio interesado, con certificado digital o DNI electrónico, y tres colectivos con acceso propio, dados de alta en su Consejo General: graduados sociales, gestores administrativos y abogacía (esta, además, adherida al convenio del CGAE con la Administración General del Estado).",
          },
          {
            q: "¿Es obligatorio presentar por Mercurio?",
            a: "Para quien ejerce una profesión de colegiación obligatoria, la vía electrónica sí lo es (art. 14.2.c de la Ley 39/2015), y Mercurio es la vía telemática específica de estos procedimientos. El art. 197.2 del RD 1155/2024 obligaba además a las personas físicas en siete procedimientos, pero el Tribunal Supremo lo anuló en julio de 2026, como explicamos en [notificaciones en extranjería](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias).",
          },
          {
            q: "¿Qué hago si un archivo pesa más de 6 MB?",
            a: "Mercurio no lo admite: el límite es por archivo, no por solicitud. Comprime el PDF o divídelo en varios archivos; el número de adjuntos no está limitado y cada parte lleva su tipo de documento.",
          },
          {
            q: "¿Se pueden presentar recursos por Mercurio?",
            a: "Sí. Desde 2024 Mercurio admite la presentación electrónica de recursos administrativos en materia de extranjería, según comunicó el Colegio de la Abogacía de Madrid; los abogados entran por el acceso de abogacía, adheridos al convenio del CGAE.",
          },
        ],
      },
    ],
  },
  {
    slug: "representante-formulario-ex-quien-va-en-cada-casilla",
    titulo: "Representante en el formulario EX: quién va en cada casilla",
    descripcion:
      "El EX pide un representante tres veces y no es la misma persona: el tutor del extranjero, el profesional que presenta y quien recibe las notificaciones.",
    fecha: "2026-09-18",
    tema: "Formularios",
    entradilla:
      "El mismo formulario escribe «representante» en tres apartados y cada vez se refiere a alguien distinto. El propio impreso lo explica en sus notas al pie; casi nadie las lee, y el despacho acaba en la casilla del tutor o en ninguna.",
    imagenAlt:
      "Vista cenital de un formulario en blanco de papel crema sobre una mesa de piedra clara: sus tres recuadros vacíos están perfilados en verde esmeralda y de cada uno sale un trazado de circuito que converge en un nodo mayor junto a un sello de latón con mango de madera; unas gafas de carey descansan en la esquina inferior.",
    bloques: [
      {
        t: "p",
        texto:
          "El formulario EX escribe la palabra «representante» tres veces, en tres apartados distintos, y en cada uno se refiere a una persona diferente. La primera es el **representante legal del extranjero**: un padre, una madre, un tutor. La segunda es **quien presenta la solicitud en su nombre**: el abogado, el gestor administrativo, el graduado social. La tercera no lleva la palabra, pero decide más que las otras dos: el **domicilio a efectos de notificaciones**. Confundirlas manda los requerimientos a quien no toca o deja al despacho actuando sin título.",
      },
      {
        t: "datos",
        items: [
          { valor: "3", etiqueta: "apartados del EX con un representante: el legal del extranjero, el que presenta y el domicilio de notificaciones" },
          { valor: "3", etiqueta: "vías para representar (art. 197.4 del RD 1155/2024): poder notarial o apud acta, convenio profesional, registro de colaboradores" },
          { valor: "1", etiqueta: "modelo oficial, «Designación de representante», basta en renovaciones y prórrogas (Instrucción SEM 1/2024)" },
          { valor: "11/07/2027", etiqueta: "caducan los convenios de gestores administrativos y graduados sociales; el de la abogacía, el 28/04/2028" },
        ],
      },
      { t: "h2", texto: "Tres casillas, tres personas" },
      {
        t: "p",
        texto:
          "El bloque 1, «Datos de la persona extranjera», termina con la línea «Representante legal, en su caso», seguida de «DNI/NIE/PAS» y «Título». La nota (4) del impreso dice qué título espera: «Indique el título en base al cual se ostenta la representación, por ejemplo: Padre/Madre del menor, Tutor…». El EX-11 lo escribe sin rodeos: «Representante legal (menor/tutelado…)». Es la casilla de quien representa **a la persona**, no a la solicitud. El bloque 2, «Datos del representante a efectos de presentación de la solicitud», es un apartado entero con razón social, NIF, domicilio, teléfono y correo, y su nota (5) lo resume: «Rellenar sólo en el caso de ser persona distinta del solicitante». Ahí va el despacho. El bloque 3, «Domicilio a efectos de notificaciones», no pide un representante sino una dirección, y esa dirección decide quién recibe los escritos de la Administración.",
      },
      {
        t: "esquema",
        titulo: "Los tres apartados del EX",
        nodos: [
          { titulo: "Representante legal", texto: "Del extranjero: padre, madre o tutor, con su título" },
          { titulo: "Quien presenta", texto: "El profesional: nombre o razón social, NIF y título", destacado: true },
          { titulo: "Notificaciones", texto: "La dirección a la que escribe la Administración" },
        ],
        destino: { titulo: "Una solicitud que llega a quien debe", texto: "Cada persona en su apartado y los requerimientos donde alguien los abre a tiempo" },
        nota: "Los dos primeros identifican personas; el tercero elige un buzón, y es el que más consecuencias tiene.",
      },
      {
        t: "tabla",
        titulo: "Quién va en cada apartado",
        encabezados: ["Apartado", "Quién", "Título que se escribe", "Error habitual"],
        filas: [
          ["Representante legal, en su caso (bloque 1)", "El representante legal del extranjero", "Padre o madre del menor, tutor", "Poner ahí al despacho"],
          ["Representante a efectos de presentación (bloque 2)", "El profesional que presenta la solicitud", "Abogado, gestor administrativo, graduado social", "Dejarlo vacío y presentar como si fuera el interesado"],
          ["Domicilio a efectos de notificaciones (bloque 3)", "Quien va a abrir las notificaciones", "Ninguno: nombre, NIF y dirección", "Poner al despacho sin certificado ni turno para atenderlas"],
        ],
        nota: "Las notas (4) y (5) están al pie de la última página de cada modelo EX.",
      },
      { t: "h2", texto: "Con qué título presenta un despacho" },
      {
        t: "p",
        texto:
          "Rellenar el bloque 2 identifica a quien presenta; no crea la representación. Esa tiene que existir antes, y el reglamento cierra la lista: el art. 197.4 del RD 1155/2024 admite el **poder notarial o apud acta** inscrito en el Registro Electrónico de Apoderamientos, la actuación de **profesionales bajo convenio** (abogados, gestores administrativos y graduados sociales, cada colegio con el suyo) y la inscripción en el **Registro de entidades colaboradoras**, reservado a sindicatos y entidades sin ánimo de lucro. Una gestoría sin colegiación no encaja en ninguna de las tres.",
      },
      {
        t: "p",
        texto:
          "La distinción que más trabajo ahorra está en la Instrucción SEM 1/2024: para las **autorizaciones iniciales** hace falta el poder notarial o apud acta, pero para **renovaciones, prórrogas y modificaciones** basta una representación simple con el modelo oficial «Designación de representante» del Ministerio. Sea cual sea la vía, el título del bloque 2 es la profesión por la que se actúa; los convenios de gestores y graduados sociales caducan el 11 de julio de 2027.",
      },
      { t: "h2", texto: "La casilla que no es de representación" },
      {
        t: "p",
        texto:
          "El bloque 3 es un interruptor. Si la dirección es la del extranjero, las notificaciones van a él, en papel salvo que marque la casilla de la DEHú. Si es la del despacho, van al despacho y **solo por vía electrónica**, porque el profesional colegiado está obligado a recibirlas así (art. 14.2 de la Ley 39/2015), con diez días naturales para abrirlas antes de que se entiendan rechazadas ([quién recibe las notificaciones y los 10 días](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias)). Presentar por Mercurio como gestoría no cambia nada: decide la dirección escrita en ese bloque. Un requerimiento que nadie abre se convierte en un plazo de [subsanación](/articulos/subsanacion-regularizacion-plazo) que corre igual, y después en un [silencio](/articulos/silencio-administrativo-extranjeria-plazos-2026) que nadie vio venir.",
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Al [generar un modelo EX](/funciones/formularios-en-un-clic), Aproba rellena el bloque 1 con los datos de la persona extranjera y reserva la casilla «Representante legal, en su caso» para el padre, la madre o el tutor cuando el expediente lo tiene: nunca pone ahí al despacho. El bloque 2 solo se rellena si el gestor marca «Presento yo la solicitud como representante»: salen la razón social, el NIF, el domicilio y el profesional con su título, deducido del colegio que el despacho declara en sus ajustes. La casilla está desmarcada por defecto, porque en la mayoría de expedientes el despacho no representa. El bloque 3 se deja en blanco y editable: elegir quién recibe las notificaciones no es una decisión que un programa deba tomar solo.",
      },
      {
        t: "faq",
        items: [
          { q: "¿Puede el abogado ponerse en «Representante legal, en su caso»?", a: "No es su casilla. Según la nota (4) del impreso, ahí va quien representa legalmente a la persona extranjera: padre, madre, tutor. El profesional tiene su propio apartado, «Datos del representante a efectos de presentación de la solicitud»." },
          { q: "¿Qué se escribe en «Título» del bloque 2?", a: "La condición por la que se actúa: abogado, gestor administrativo, graduado social. La casilla es corta; el número de colegiado consta en el poder o en la designación." },
          { q: "¿Basta con rellenar el bloque 2 para representar al cliente?", a: "No. El apartado identifica a quien presenta; la representación tiene que existir por una de las vías del art. 197.4 del RD 1155/2024: poder notarial o apud acta para las iniciales, designación oficial de representante para renovaciones y prórrogas, o convenio del colegio profesional." },
          { q: "Si pongo mi despacho en el domicilio de notificaciones, ¿las recibo yo?", a: "Sí, y solo por vía electrónica, con diez días naturales para abrir cada una. Solo conviene si el despacho tiene certificado y alguien que mire la sede cada semana; si no, es más seguro dejar la dirección del cliente y explicarle cómo abrirlas." },
        ],
      },
    ],
  },
  {
    slug: "recibir-documentos-clientes-extranjeria-whatsapp-email",
    titulo: "Del WhatsApp al expediente: recibir documentos en extranjería",
    descripcion:
      "Los documentos llegan por WhatsApp, email o en mano. Cinco operaciones para reconocerlos, comprobarlos y colocarlos en el expediente sin perder plazos.",
    fecha: "2026-09-15",
    tema: "Práctica del despacho",
    entradilla:
      "Los papeles no llegan por donde el despacho quiere, sino por donde el cliente puede: una foto por WhatsApp a las once de la noche, un email con seis adjuntos, una carpeta en mano. Ordenarlos no tiene honorario, pero decide si el expediente se presenta completo.",
    imagenAlt:
      "Un teléfono móvil apoyado en una mesa de mármol blanco junto a una carpeta abierta de cartulina crema; de la pantalla del móvil sale un trazado de circuito verde esmeralda que se convierte, dentro de la carpeta, en una pila ordenada de documentos dibujados con líneas de luz.",
    bloques: [
      {
        t: "p",
        texto:
          "Entre el momento en que el cliente envía un documento y el momento en que ese documento está en su sitio pasan cinco operaciones que casi nadie contabiliza: reconocer qué es, leer lo que dice, comprobar que sirve, colocarlo en el expediente correcto y pedir lo que falta. Son minutos por documento y decenas de documentos por expediente. Cuando una de ellas falla, la Administración la convierte en un requerimiento, y el requerimiento, en un plazo.",
      },
      {
        t: "datos",
        items: [
          { valor: "10 días", etiqueta: "hábiles para aportar lo que falte tras un requerimiento; si no, la solicitud se tiene por desistida (art. 68.1 de la Ley 39/2015)" },
          { valor: "10 días", etiqueta: "naturales para abrir la notificación electrónica de ese requerimiento antes de que se entienda rechazada (art. 43.2)" },
          { valor: "3 meses", etiqueta: "de plazo máximo para resolver un arraigo; sin resolución expresa, el silencio es negativo" },
          { valor: "2 meses", etiqueta: "antes de la caducidad se abre la ventana para renovar una residencia por cuenta ajena; se cierra tres meses después (hoja informativa 13)" },
        ],
      },
      { t: "h2", texto: "Por dónde llegan los papeles" },
      {
        t: "p",
        texto:
          "En un despacho de extranjería la documentación entra por tres puertas, y ninguna la eligió el despacho. **WhatsApp**, porque es donde vive el cliente: fotos de un pasaporte tomadas de noche o un PDF reenviado desde otro chat. **Email**, porque es donde viven el empleador y el otro profesional. Y **en mano**, porque hay documentos que solo existen en papel hasta que alguien los escanea. El portal del cliente, cuando existe, es una cuarta puerta: útil, pero la menos transitada.",
      },
      {
        t: "esquema",
        titulo: "Tres entradas, un solo destino",
        nodos: [
          { titulo: "WhatsApp", texto: "Fotos y capturas desde el móvil del cliente, a cualquier hora" },
          { titulo: "Email", texto: "Adjuntos del cliente, del empleador o de otro profesional" },
          { titulo: "En mano", texto: "Papel que se escanea en el despacho" },
        ],
        destino: { titulo: "El expediente", texto: "Cada documento en su casilla y lo que falta, a la vista" },
        nota: "El portal es una entrada más, no un requisito: cuanto menos cambie el cliente de hábitos, más documentos llegan.",
      },
      { t: "h2", texto: "Las cinco operaciones que se hacen con cada documento" },
      {
        t: "ol",
        items: [
          "**Reconocer qué es.** Un archivo llamado IMG_4821.jpg puede ser un pasaporte, un padrón o la foto de un gato. Hasta que alguien lo abre, no existe para el expediente.",
          "**Leer lo que dice.** Número de pasaporte, NIE, fechas de nacimiento y de caducidad, el nombre exactamente como está escrito. Los nombres que no coinciden entre documentos están entre las causas más repetidas de requerimiento ([siete errores documentales](/articulos/errores-documentales-retrasan-expediente-extranjeria)).",
          "**Comprobar que sirve.** Que el pasaporte siga en vigor cuando se prevea la resolución, no solo hoy; que el empadronamiento no supere la antigüedad que admite el trámite; que la foto se lea entera, con las cuatro esquinas.",
          "**Colocarlo en su sitio.** En el expediente correcto y en la casilla correcta de la lista de ese trámite, para que la lista diga lo que falta y no solo lo que hay.",
          "**Pedir lo que falta.** En el idioma del cliente, con instrucciones concretas y por el canal en el que él envió lo anterior. Pedir «la documentación» produce silencio; pedir «la página del pasaporte con la foto, completa» produce documentos.",
        ],
      },
      { t: "h2", texto: "Lo que cuesta hacerlo a mano, y lo que cuesta no hacerlo" },
      {
        t: "p",
        texto:
          "Ninguna de las cinco operaciones factura. El honorario se pacta por el trámite; ordenar papeles se paga con la tarde del despacho. Pero saltárselas tiene precio: un documento sin colocar es un expediente presentado incompleto, un requerimiento de diez días hábiles y, si nadie abre la notificación a tiempo, un desistimiento. En los trámites con silencio negativo, además, el error no se descubre hasta que se agota el plazo ([el silencio administrativo, trámite por trámite](/articulos/silencio-administrativo-extranjeria-plazos-2026)).",
      },
      {
        t: "tabla",
        titulo: "Las cinco operaciones, a mano y automatizadas",
        encabezados: ["Operación", "A mano", "Automatizada"],
        filas: [
          ["Reconocer", "Abrir cada archivo y renombrarlo", "El sistema identifica el tipo de documento al recibirlo"],
          ["Leer", "Copiar los datos a la ficha, uno a uno", "Los datos leídos rellenan los campos vacíos de la ficha"],
          ["Comprobar", "Mirar fechas y legibilidad, si hay tiempo", "Caducidad y legibilidad se contrastan en el momento"],
          ["Colocar", "Carpeta, subcarpeta, nombre de archivo", "Cada documento cae en la casilla de su trámite"],
          ["Pedir", "Escribir el mensaje, traducirlo, recordarlo", "La lista de lo que falta sale sola, en el idioma del cliente"],
        ],
        nota: "La automatización no sustituye la revisión del profesional: le entrega el expediente ya ordenado para que revisar sea la única tarea.",
      },
      { t: "h2", texto: "El criterio para elegir herramienta" },
      {
        t: "p",
        texto:
          "La pregunta útil no es cuántas funciones tiene un programa, sino cuántas de estas cinco operaciones deja de hacer el despacho sin cambiar de hábitos. Si la herramienta obliga al cliente a aprender un portal, o al despacho a subir a mano lo que ya recibió por WhatsApp, ha añadido una sexta operación en lugar de quitar una. Un programa de extranjería tiene que adaptarse a cómo trabaja el despacho, y no al revés: recibir los papeles por donde ya llegan y devolver el trabajo por donde ya sale.",
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Cada despacho tiene en Aproba una dirección de correo propia para documentos. El gestor reenvía el email del cliente, o el cliente escribe directamente, y los adjuntos entran solos: el sistema [reconoce el tipo de documento](/funciones/validacion-con-ia), rellena con lo leído los campos vacíos de la ficha, coloca cada pieza en la casilla de su expediente y responde en el mismo hilo con lo que todavía falta. Si la ficha queda completa, los formularios EX del trámite llegan ya rellenados en esa misma respuesta. La misma entrada por WhatsApp está en fase de pruebas. El [portal del cliente, en ocho idiomas](/cifras/8-idiomas), sigue disponible como opción, nunca como requisito.",
      },
      {
        t: "faq",
        items: [
          { q: "¿Hay que obligar al cliente a usar un portal para enviar documentos?", a: "No. La mayoría de los clientes envía por WhatsApp o por email; un buen flujo acepta las tres entradas y las lleva al mismo expediente." },
          { q: "¿Qué hago con una foto que no se lee?", a: "Pedirla de nuevo en el momento, con instrucciones concretas, antes de que el cliente desconecte del trámite. La legibilidad es la primera causa de requerimiento evitable." },
          { q: "¿Cuánto tiempo hay para aportar un documento que la Administración echa en falta?", a: "Diez días hábiles desde la notificación del requerimiento (art. 68.1 de la Ley 39/2015); si no se aporta, la solicitud se tiene por desistida. Y la notificación electrónica se entiende rechazada a los diez días naturales sin abrirla ([quién recibe las notificaciones](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias))." },
          { q: "¿Puedo reenviar el email de un cliente, con su pasaporte, a un programa de gestión?", a: "Sí, si el proveedor actúa como encargado del tratamiento con un contrato conforme al art. 28 del RGPD y los datos se alojan en la Unión Europea o con garantías equivalentes. Conviene decirlo en la hoja de encargo." },
        ],
      },
    ],
  },
  {
    slug: "notificaciones-electronicas-extranjeria-quien-recibe-10-dias",
    titulo: "Notificaciones en extranjería: quién las recibe y los 10 días",
    descripcion:
      "Quién recibe las notificaciones de un expediente de extranjería, la regla de los diez días naturales, la sentencia del Supremo de 2026 y cómo organizarlo.",
    fecha: "2026-09-12",
    tema: "Procedimiento",
    entradilla:
      "Un requerimiento que nadie abre acaba en desistimiento; una denegación que nadie lee se vuelve firme. En extranjería la notificación es el punto donde se pierden expedientes bien preparados, y quién la recibe no lo decide la oficina: lo decide una casilla del formulario.",
    imagenAlt:
      "Un sobre de papel crema con lacre verde sobre un escritorio de mármol blanco; de él se eleva una red de líneas y nodos de luz verde esmeralda que dibuja la silueta de una campana de notificación, con luz de estudio clara.",
    bloques: [
      {
        t: "p",
        texto:
          "La Administración notifica cada acto que afecta a un expediente: el requerimiento, la audiencia, la resolución. La **Ley 39/2015** fija cómo se practica y, sobre todo, **cuándo se entiende hecha aunque nadie la haya leído**. Con clientes que cambian de teléfono, de piso y a veces de país, esa regla decide más expedientes que cualquier requisito de fondo.",
      },
      {
        t: "datos",
        items: [
          { valor: "10 días", etiqueta: "naturales para abrir una notificación electrónica antes de que se entienda rechazada (art. 43.2)" },
          { valor: "1 mes", etiqueta: "para recurrir una denegación en vía administrativa, aunque nadie la haya leído" },
          { valor: "7 tipos", etiqueta: "de solicitud cuya obligación electrónica anuló el Supremo el 8 de julio de 2026" },
          { valor: "11/07/2027", etiqueta: "vencen los convenios de gestores administrativos y graduados sociales" },
        ],
      },
      { t: "h2", texto: "El campo que decide quién recibe la notificación" },
      {
        t: "p",
        texto:
          "Los formularios EX tienen tres bloques de identidad: el solicitante, el representante a efectos de presentación y el **domicilio a efectos de notificaciones**. Solo el tercero decide adónde va cada notificación. Presentar desde la puerta «Gestoría» o «Abogacía» de Mercurio acredita quién presenta, pero **no desvía las notificaciones al despacho**. Si en ese bloque figura el NIF del profesional, le llegan a él, y solo en electrónico (**art. 14.2.c y d**: profesión colegiada, y representante de un obligado). Si figura el extranjero, le llegan a él: en papel, o en la **Dirección Electrónica Habilitada única (DEHú)** si marcó la casilla.",
      },
      {
        t: "esquema",
        titulo: "Un mismo bloque, tres buzones",
        nodos: [
          { titulo: "NIF del despacho", texto: "Electrónica obligatoria, en la sede o la DEHú del profesional. Comparece con su certificado.", destacado: true },
          { titulo: "El extranjero, sin casilla DEHú", texto: "Papel, al domicilio que conste, aunque se haya mudado sin avisar." },
          { titulo: "El extranjero, con casilla DEHú", texto: "Puesta a disposición en su DEHú. Diez días naturales para acceder." },
        ],
        destino: { titulo: "Un solo reloj", texto: "Desde que la notificación se entiende practicada o rechazada corren los diez días de subsanación, el mes del recurso o los dos meses del contencioso." },
        nota: "Art. 41.3 de la Ley 39/2015: en los procedimientos a solicitud del interesado, la notificación se practica por el medio señalado en la solicitud.",
      },
      { t: "h2", texto: "Los diez días naturales" },
      {
        t: "p",
        texto:
          "Una notificación electrónica se entiende **practicada cuando se accede a su contenido**. Si es obligatoria o el interesado la eligió y pasan **diez días naturales desde la puesta a disposición sin acceder, se entiende rechazada** (art. 43.2): cuentan sábados, domingos y festivos. El aviso al correo o al móvil es una cortesía: **su falta no impide que la notificación sea válida** (art. 41.6). Si el acto llega por dos cauces, vale la primera (art. 41.7).",
      },
      {
        t: "hitos",
        items: [
          { fecha: "Día 0", titulo: "Puesta a disposición", texto: "En la sede o la DEHú; con ella la Administración ya ha notificado en plazo (art. 43.3). Llega un aviso al correo o al móvil comunicados." },
          { fecha: "Días 1 a 10", titulo: "Ventana de acceso", texto: "En cuanto alguien identificado abre el contenido, la notificación se entiende practicada ese día." },
          { fecha: "Día 10 sin acceso", titulo: "Rechazada", texto: "Se hace constar y el procedimiento sigue como si se hubiera recibido (art. 41.5).", destacado: true },
          { fecha: "Desde ahí", titulo: "Corren los plazos", texto: "Subsanación, recurso o contencioso: los de la tabla siguiente." },
        ],
      },
      { t: "h2", texto: "Qué se pierde cuando nadie la abre" },
      {
        t: "tabla",
        titulo: "Cuatro notificaciones habituales y su coste",
        encabezados: ["Notificación", "Plazo que arranca", "Si no se atiende"],
        filas: [
          ["Requerimiento de subsanación", "**10 días** (art. 68.1)", "Desistimiento, previa resolución"],
          ["Trámite de audiencia", "**10 a 15 días** (art. 82.2)", "Se resuelve sin alegaciones"],
          ["Resolución denegatoria, vía administrativa", "**1 mes**: alzada o reposición (arts. 122 y 124)", "La denegación gana firmeza"],
          ["Resolución denegatoria, vía judicial", "**2 meses** (art. 46.1 LJCA)", "Se cierra también el contencioso"],
        ],
        nota: "Días hábiles salvo mención expresa; los diez del art. 43.2 son naturales. En la regularización de 2026 la subsanación fue de [quince días](/articulos/subsanacion-regularizacion-plazo), y la causa más frecuente del requerimiento sigue siendo [un error documental](/articulos/errores-documentales-retrasan-expediente-extranjeria).",
      },
      { t: "h2", texto: "La sentencia del Supremo: qué cambia y qué no" },
      {
        t: "p",
        texto:
          "El **art. 197.2 del Reglamento de Extranjería** (RD 1155/2024) obligaba a las personas físicas a tramitar electrónicamente siete tipos de solicitud, entre ellos la autorización inicial por cuenta ajena y varias renovaciones. La **sentencia 868/2026 del Tribunal Supremo, de 8 de julio** (Sección Quinta, recurso 19/2025), lo anuló: el Reglamento no justificó, como exige el art. 14.3 de la Ley 39/2015, que esas personas dispusieran de los medios necesarios. A la fecha de este artículo el **texto consolidado del BOE aún no recoge la anulación** (última modificación, 15 de abril de 2026) y las oficinas tramitan como antes.",
      },
      {
        t: "tabla",
        titulo: "Tras la sentencia, ¿quién sigue obligado al canal electrónico?",
        encabezados: ["Quién presenta", "Canal", "Por qué"],
        filas: [
          ["El extranjero, por sí mismo", "El que elija", "Persona física no obligada; el art. 197.2 está anulado"],
          ["Abogado, gestor administrativo o graduado social", "**Electrónico, obligatorio**", "Profesión colegiada (14.2.c) y representante de un obligado (14.2.d)"],
          ["Entidad colaboradora inscrita", "**Electrónico, obligatorio**", "Persona jurídica (14.2.a)"],
        ],
        nota: "Para un despacho cambia poco: con un profesional en el expediente, el canal es electrónico.",
      },
      { t: "h2", texto: "Cómo organizarlo en el despacho" },
      {
        t: "ol",
        items: [
          "**Decidir en cada expediente quién recibe**, y escribirlo en el bloque 3 del formulario: el NIF del profesional, o el domicilio real del cliente y, solo si va a mirarla, la casilla DEHú.",
          "**Si recibe el despacho, turno de comparecencia** cada dos o tres días laborables con el certificado: diez días naturales incluyen fines de semana y puentes.",
          "**Si recibe el cliente, enseñarle a acceder** antes de presentar, y comprobar que el correo y el móvil comunicados son los suyos.",
          "**Anotar la fecha de acceso** el mismo día: es la que abre el plazo.",
          "**Tener el poder inscrito**: apoderamiento notarial o apud acta en el Registro Electrónico de Apoderamientos (art. 5.4 de la Ley 39/2015; art. 197.4 del Reglamento).",
        ],
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Los [formularios EX que genera Aproba](/funciones/formularios-en-un-clic) dejan editables el bloque «Domicilio a efectos de notificaciones» y la casilla DEHú, para decidirlo expediente a expediente. Cada requerimiento se anota en la ficha con su plazo, y Aproba avisa al despacho antes de que venza. Aproba no accede a la DEHú ni a la sede: la comparecencia es del profesional, con su certificado.",
      },
      {
        t: "faq",
        items: [
          { q: "¿Los diez días son hábiles o naturales?", a: "Naturales: el art. 43.2 lo dice expresamente. Una notificación puesta a disposición un jueves de puente se entiende rechazada el domingo de la semana siguiente." },
          { q: "No me llegó el aviso al correo. ¿La notificación es válida?", a: "Sí. El aviso es una cortesía del art. 41.6: cuentan la puesta a disposición y el acceso, no el aviso." },
          { q: "Presenté desde Mercurio como gestoría. ¿Las notificaciones me llegan a mí?", a: "No por ese hecho. Van a quien figure en el bloque «Domicilio a efectos de notificaciones» del formulario." },
          { q: "¿Puedo abrir la notificación de mi cliente con mi certificado?", a: "Solo con representación acreditada: apoderamiento notarial o apud acta inscrito. Sin ella, la sede o la DEHú no te la mostrarán aunque hayas presentado el expediente." },
        ],
      },
    ],
  },
  {
    slug: "silencio-administrativo-extranjeria-plazos-2026",
    titulo: "Silencio administrativo en extranjería: el plazo de cada trámite",
    descripcion:
      "Plazo de resolución y sentido del silencio de cada trámite de extranjería en 2026, con su artículo del RD 1155/2024, y qué hacer el día que vence sin respuesta.",
    fecha: "2026-09-08",
    tema: "Procedimiento",
    entradilla:
      "«¿Y si no contestan?» es la pregunta que más se repite en un despacho de extranjería, y la respuesta cambia según el trámite: en unos el silencio concede, en otros deniega, y en la nacionalidad se tarda un año en saberlo. Esta es la tabla completa, con las fuentes oficiales y lo que conviene hacer el día que vence el plazo.",
    imagenAlt:
      "Un reloj de arena de latón con la arena cayendo, junto a un expediente cerrado con cinta verde y sello de lacre y una campanilla de latón en silencio, sobre un escritorio de nogal.",
    bloques: [
      {
        t: "p",
        texto:
          "Cada solicitud de extranjería tiene un **plazo máximo de resolución** y un **sentido del silencio**: lo que ocurre si ese plazo pasa sin respuesta. La regla general la fija la **disposición adicional primera de la Ley Orgánica 4/2000**: tres meses y silencio negativo, salvo para prórrogas, renovaciones y larga duración, donde el silencio concede. El Reglamento aprobado por el **Real Decreto 1155/2024**, en vigor desde el 20 de mayo de 2025, concreta el plazo de cada trámite, y las hojas informativas del Ministerio lo repiten una a una.",
      },
      { t: "h2", texto: "La tabla que conviene tener a mano" },
      {
        t: "tabla",
        titulo: "Plazo de resolución y sentido del silencio por trámite",
        encabezados: ["Trámite", "Plazo", "Silencio", "Base"],
        filas: [
          ["Autorización inicial de residencia y trabajo por cuenta ajena", "**3 meses**", "Negativo", "RD 1155/2024, arts. 72-79"],
          ["Reagrupación familiar (autorización inicial)", "**2 meses**", "Negativo", "RD 1155/2024, arts. 65-68"],
          ["Arraigos: social, sociolaboral, familiar, socioformativo y de segunda oportunidad", "**3 meses**", "Negativo", "RD 1155/2024, arts. 124-132"],
          ["Modificación de autorizaciones", "**3 meses**", "Negativo", "RD 1155/2024, art. 191"],
          ["Renovación de residencia y trabajo por cuenta ajena", "**3 meses**", "**Positivo**", "RD 1155/2024, arts. 80-81"],
          ["Renovación por reagrupación familiar", "**3 meses**", "**Positivo**", "RD 1155/2024, art. 71"],
          ["Renovación de residencia no lucrativa", "**3 meses**", "**Positivo**", "RD 1155/2024, art. 64"],
          ["Residencia de larga duración", "**3 meses**", "**Positivo**", "RD 1155/2024, arts. 182-185"],
          ["Nacionalidad por residencia", "**1 año**", "Negativo", "RD 1004/2015, art. 11"],
        ],
        nota:
          "Los plazos cuentan desde el día siguiente a la entrada de la solicitud en el registro del órgano competente. Fuente: hojas informativas del Ministerio de Inclusión, Seguridad Social y Migraciones (números 7, 8, 10, 12, 13, 28, 49 y 55), consultadas en septiembre de 2026. El visado de corta duración sigue el Código de visados de la UE: 15 días naturales, ampliables a 45.",
      },
      {
        t: "p",
        texto:
          "Dos lecturas rápidas. La primera: **el nuevo reglamento no cambió la lógica**, solo los artículos. Donde el cliente pide algo nuevo, el silencio deniega; donde pide continuar lo que ya tenía, el silencio concede. La segunda: la reagrupación familiar es el único trámite ordinario con **dos meses**, no tres.",
      },
      { t: "h2", texto: "Cuándo empieza a contar y qué lo detiene" },
      {
        t: "p",
        texto:
          "El plazo arranca **el día siguiente a la entrada en el registro del órgano competente**: no el día en que el cliente firmó, ni el día en que se presentó en una oficina que no era la competente. Y se **suspende** cuando la Administración requiere una subsanación: el reloj se para desde la notificación del requerimiento hasta que se cumple o, si no se cumple, hasta que vence el plazo concedido (**art. 22.1.a de la Ley 39/2015**). Un expediente con [dos requerimientos de diez días](/articulos/subsanacion-regularizacion-plazo) puede tardar cuatro meses y seguir dentro de plazo.",
      },
      {
        t: "p",
        texto:
          "La segunda trampa es la notificación electrónica. Si el interesado eligió ese canal o está obligado a usarlo, la resolución se pone a disposición en la sede y, **si nadie la abre en diez días naturales, se entiende rechazada** y el procedimiento sigue como si se hubiera leído (arts. 43.2 y 41.5). El silencio que el despacho cree estar esperando puede ser una denegación ya notificada que nadie leyó, con el plazo de recurso corriendo. [Los errores de seguimiento](/articulos/errores-documentales-retrasan-expediente-extranjeria), no los jurídicos, son los que más expedientes cuestan.",
      },
      { t: "h2", texto: "El día que vence el plazo" },
      { t: "h3", texto: "Si el silencio es positivo" },
      {
        t: "p",
        texto:
          "La renovación o la larga duración están **concedidas por ministerio de la ley**. El órgano debe expedir de oficio el **certificado acreditativo del silencio en quince días** (**art. 24.4 de la Ley 39/2015**), y el interesado puede pedirlo en cualquier momento. Con ese certificado se solicita la tarjeta. Si después llega una resolución expresa, solo puede ser **confirmatoria** (art. 24.3.a): la Administración ya no puede denegar lo que el silencio concedió.",
      },
      { t: "h3", texto: "Si el silencio es negativo" },
      {
        t: "p",
        texto:
          "Todavía no se ha perdido nada: la Administración **sigue obligada a resolver** (art. 21.1) y puede estimar más tarde sin quedar vinculada por el silencio (art. 24.3.b). El despacho tiene tres caminos: esperar, interponer **recurso de reposición** (un mes para presentarlo y un mes para que lo resuelvan, art. 124) o acudir al **contencioso-administrativo**. Frente a una resolución expresa, el plazo es de **dos meses** (art. 46.1 de la LJCA). Frente al silencio negativo, el Tribunal Constitucional fijó en la **STC 52/2014** que el plazo de seis meses no corre: se puede recurrir mientras la Administración no resuelva. En [nacionalidad](/articulos/nacionalidad-por-residencia-plazos-tasas-2026), donde el año legal se convierte en dos, es la vía habitual para desbloquear el expediente.",
      },
      {
        t: "hitos",
        items: [
          { fecha: "Dos meses antes", titulo: "Se abre la ventana de renovación", texto: "También se admite hasta tres meses después de la caducidad, con posible sanción." },
          { fecha: "Día 0", titulo: "Entrada en el registro competente", texto: "Empieza el plazo de tres meses." },
          { fecha: "Requerimiento", titulo: "El reloj se para", texto: "Desde la notificación hasta la subsanación o hasta que vence el plazo concedido." },
          { fecha: "Mes 3", titulo: "Silencio positivo", texto: "La renovación se entiende concedida.", destacado: true },
          { fecha: "Quince días después", titulo: "Certificado de oficio", texto: "Acredita el silencio y abre la solicitud de la tarjeta." },
        ],
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Cada expediente en Aproba guarda la fecha de presentación en su historial y [Vigía, el radar de renovaciones](/funciones/radar-de-renovaciones), lleva los vencimientos de las renovaciones antes de que caduquen. Anotar la fecha de silencio el día del registro convierte la espera en una fecha.",
      },
      {
        t: "faq",
        items: [
          {
            q: "¿Qué silencio tiene la renovación de la residencia?",
            a: "Positivo. Pasados tres meses desde la entrada en el registro sin resolución notificada, la renovación se entiende concedida (disposición adicional primera de la LO 4/2000 y hojas informativas 7, 10 y 13). Conviene pedir el certificado acreditativo del silencio para solicitar la tarjeta.",
          },
          {
            q: "¿Y el arraigo social?",
            a: "Negativo. El plazo es de tres meses y, si vence sin respuesta, la solicitud puede entenderse desestimada (Hoja 28; arts. 124 a 132 del RD 1155/2024). La Administración sigue obligada a resolver y puede conceder después.",
          },
          {
            q: "¿Cuánto tarda la reagrupación familiar?",
            a: "El plazo legal es de dos meses, con silencio negativo (Hoja 8; arts. 65 a 68 del RD 1155/2024).",
          },
          {
            q: "¿Qué es el certificado acreditativo del silencio?",
            a: "El documento que prueba que el plazo venció sin resolución. El órgano competente debe expedirlo de oficio en quince días desde el vencimiento (art. 24.4 de la Ley 39/2015), y el interesado puede solicitarlo en cualquier momento. En los silencios positivos es la llave para la tarjeta.",
          },
          {
            q: "¿Hay plazo para recurrir un silencio negativo?",
            a: "El recurso de reposición se interpone en un mes. Para el contencioso-administrativo, la STC 52/2014 estableció que el plazo de seis meses del art. 46.1 de la LJCA no se aplica al silencio negativo: cabe recurrir mientras la Administración no resuelva. Si llega resolución expresa, el plazo pasa a ser de dos meses.",
          },
        ],
      },
    ],
  },
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
      "Ilustración: un registro abierto sobre una mesa de madera, un sello de latón encima, y la silueta de España dibujada con cientos de puntos de luz verde flotando sobre las páginas.",
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
          "Para una entidad colaboradora, Aproba registra cada expediente con su procedimiento, sus actuaciones y quién intervino, y genera la memoria de actividad del artículo 8.1.f en un clic; el mandato de representación se firma desde el propio expediente y deja constancia fidedigna. Para un despacho, [Vigía](/funciones/radar-de-renovaciones) fecha cada vencimiento y prepara las renovaciones de 2027 antes de que lleguen todas a la vez.",
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
          "Aproba [emite facturas por tus expedientes](/funciones/facturas-automaticas), así que esta obligación es también nuestra: la adaptación VeriFactu del módulo de facturación está en el plan de producto para estar lista antes de tu fecha, con la numeración correlativa y las anulaciones ya funcionando como el reglamento exige.",
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
          "[Vigía](/funciones/radar-de-renovaciones) es la parte de Aproba que se ocupa exactamente de esto: registra la caducidad de cada autorización, avisa con antelación y permite iniciar la renovación en un clic, reutilizando los datos y documentos del expediente anterior.",
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
      "El RD 316/2026 da 15 días para subsanar, no 10, y sin respuesta el expediente se archiva. Correos atiende hasta el 30 de septiembre de 2026: qué viene después.",
    fecha: "2026-08-22",
    // 25/09/2026: al cerrar la ventanilla de Correos el 30/09, el artículo dejaba de servir. Se
    // añade «qué viene después» y se corrige el recurso contra el silencio (arts. 122.1 y
    // 124.1 de la Ley 39/2015: en cualquier momento, no «un mes»).
    actualizado: "2026-09-25",
    tema: "Plazos",
    entradilla:
      "La fase de subsanación de la regularización extraordinaria afecta a cientos de miles de expedientes y se cierra el 30 de septiembre de 2026. El plazo que circula por el sector no siempre es el correcto, y esa fecha no alarga ningún requerimiento.",
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
          "Que Correos atienda hasta esa fecha **no alarga ningún requerimiento**: cada uno corre con el plazo que fija su notificación. Un requerimiento que vence el 18 de septiembre vence el 18, aunque la ventanilla siga abierta doce días más.",
      },
      {
        t: "p",
        texto:
          "Conviene tener presente además que el plazo máximo de resolución es de tres meses desde la presentación y que **el silencio es negativo**. Un expediente presentado en junio y no resuelto en septiembre no está simplemente «en trámite»: se entiende desestimado y abre la puerta al recurso. Contra el silencio, el recurso administrativo puede interponerse **en cualquier momento** (arts. 122.1 y 124.1 de la Ley 39/2015); contra una denegación expresa, el plazo es de un mes, y el del contencioso, de dos.",
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
      { t: "h2", texto: "Después del 30 de septiembre" },
      {
        t: "hitos",
        items: [
          { fecha: "30/09/2026", titulo: "Cierra la atención en Correos", texto: "Solo para quien presentó en plazo. Cada requerimiento conserva el plazo que fija su notificación." },
          { fecha: "3 meses desde la presentación", titulo: "Resolución o silencio negativo", texto: "Sin resolución, la solicitud se entiende desestimada; contra el silencio, el recurso no tiene plazo." },
          {
            fecha: "Mediados de 2027",
            titulo: "Renovar las autorizaciones de un año",
            texto: "Las concedidas en 2026 duran un año y vencerán casi a la vez: es [la ola de renovaciones de 2027](/articulos/renovaciones-2027-regularizacion-extraordinaria).",
            destacado: true,
          },
        ],
      },
      {
        t: "nota",
        titulo: "Cómo lo lleva Aproba",
        texto:
          "Cada requerimiento se anota en la ficha del expediente con su plazo, y Aproba avisa al despacho antes de que venza. Para lo que viene después, [Vigía, el radar de renovaciones](/funciones/radar-de-renovaciones), guarda la caducidad de cada autorización concedida y prepara su renovación antes de que llegue 2027.",
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
          "Aproba [valida cada documento al recibirlo](/funciones/validacion-con-ia), avisa de lo que falta según el trámite y no deja presentar a ciegas: la lista de requisitos la fija el servicio, no la memoria de quien prepara el expediente.",
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
      if (b.t === "pasos") return [b.titulo ?? "", ...b.items.map((x) => `${x.titulo} ${x.texto} ${x.falla ?? ""}`), b.nota ?? ""].join(" ");
      if (b.t === "checklist") return [b.titulo, ...b.items, b.nota ?? ""].join(" ");
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
