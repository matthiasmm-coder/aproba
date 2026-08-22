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
  | { t: "nota"; titulo?: string; texto: string };

export type Articulo = {
  slug: string;
  titulo: string;          // <h1> y <title>
  descripcion: string;     // meta description — 140-160 caracteres, con la intención de búsqueda
  fecha: string;           // ISO (publicación)
  actualizado?: string;    // ISO — si se revisa, cuenta para el frescor en buscadores
  tema: string;            // etiqueta corta para el índice
  entradilla: string;      // resumen visible bajo el h1
  bloques: Bloque[];
};

// El texto admite **negrita** (se convierte en <strong> al pintar; ver components/articulo-cuerpo).
export const ARTICULOS: Articulo[] = [
  {
    slug: "renovaciones-2027-regularizacion-extraordinaria",
    titulo: "La ola de renovaciones de 2027: qué viene y cómo prepararla",
    descripcion:
      "En 2026 se presentaron 1.174.978 solicitudes de regularización extraordinaria. Las autorizaciones duran un año: a mediados de 2027 vencen casi todas a la vez.",
    fecha: "2026-08-22",
    tema: "Regularización 2026",
    entradilla:
      "La regularización extraordinaria de 2026 no termina cuando se resuelve el último expediente: empieza otra vez doce meses después. Estos son los números y lo que un despacho puede hacer hoy.",
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

// Minutos de lectura calculados, no escritos a mano: si el texto crece, el dato sigue
// siendo verdad (200 palabras/minuto, la referencia habitual en castellano).
export function minutosDeLectura(a: Articulo): number {
  const texto = a.bloques
    .map((b) => {
      if (b.t === "ul" || b.t === "ol") return b.items.join(" ");
      if (b.t === "datos") return b.items.map((d) => `${d.valor} ${d.etiqueta}`).join(" ");
      if (b.t === "cita") return `${b.texto} ${b.autor}`;
      if (b.t === "nota") return `${b.titulo ?? ""} ${b.texto}`;
      return b.texto;
    })
    .join(" ");
  return Math.max(1, Math.round(texto.split(/\s+/).filter(Boolean).length / 200));
}

export const fechaLarga = (iso: string): string => {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
};
