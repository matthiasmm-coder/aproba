import type { Bloque } from "@/lib/articulos";

// BENEFICIOS DE LA PORTADA, EXPLICADOS (13/09/2026, idea de Matthias): cada tarjeta de la
// landing (las 4 cifras, las 6 funciones, las 4 garantías) enlaza a una página que dice
// QUÉ SIGNIFICA exactamente y CÓMO PODEMOS AFIRMARLO — con el mecanismo, los límites y
// la forma de comprobarlo uno mismo en la cuenta de prueba. La landing no cambia de
// forma; gana catorce páginas de fondo que un buscador puede indexar por su nombre.
//
// ⚠️ REGLA: lo que se afirma aquí es verdad HOY en el producto. Una cifra que es una
// estimación se presenta como estimación, con su cálculo a la vista.

export type Grupo = "funciones" | "cifras" | "garantias";
export type Beneficio = {
  grupo: Grupo;
  slug: string;
  tarjeta: string;        // texto de la tarjeta en la portada
  titulo: string;         // <title> completo, ≤ 65 caracteres
  descripcion: string;    // meta description, ≤ 160
  h1: string;
  entradilla: string;
  actualizado: string;    // ISO
  significa: Bloque[];    // «Qué significa»
  afirmamos: Bloque[];    // «Cómo podemos afirmarlo»
  limites?: Bloque[];     // «Lo que no incluye»
  faq: { q: string; a: string }[];
  fuentes?: { nombre: string; url: string }[]; // documentos externos citados
  // Captura REAL de Aproba (cuenta demo) que ilustra el beneficio: public/beneficios/<slug>.jpg.
  // Solo las seis FUNCIONES la llevan (decisión Matthias 13/09): cifras y garantías van sin captura.
  captura?: { w: number; h: number; alt: string; pie: string };
};

export const GRUPO_LABEL: Record<Grupo, string> = { funciones: "Función", cifras: "Cifra", garantias: "Garantía" };
export const rutaDe = (b: Pick<Beneficio, "grupo" | "slug">) => `/${b.grupo}/${b.slug}`;

const PRUEBA = "En la cuenta de prueba (15 días, sin tarjeta) entras con un expediente de ejemplo ya resuelto: cuatro documentos validados, la ficha rellenada y los formularios listos para generar.";

export const BENEFICIOS: Beneficio[] = [
  // ══════════════════════════════ FUNCIONES ══════════════════════════════
  {
    grupo: "funciones", slug: "validacion-con-ia",
    tarjeta: "Validación con IA",
    titulo: "Validación de documentos con IA para extranjería | Aproba",
    descripcion: "Qué comprueba la IA de Aproba en cada documento (lectura, caducidad, legibilidad, trámite), cómo lo hace y qué no decide por ti. Verificable en la prueba.",
    h1: "Validación con IA: qué comprueba en cada documento y qué no",
    entradilla: "El cliente sube una foto desde el móvil y, antes de que llegue a tu mesa, el documento está leído, clasificado y comprobado. Esto es lo que hace exactamente y por qué podemos decirlo.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 1129, alt: "Documentos de un expediente en Aproba: TIE, empadronamiento y nómina validados por la IA; los que faltan, marcados", pie: "La sección Documentos de un expediente real: cada pieza con su estado (Validado / Falta) y la zona para arrastrar todos los documentos a la vez." },
    significa: [
      { t: "p", texto: "Cada foto o PDF que entra en un expediente —por el portal del cliente, por email o subido por el despacho— pasa por un modelo de visión que lo **lee** como lo leería una persona: identifica qué documento es, extrae los datos que contiene y los compara con lo que el trámite exige." },
      { t: "ul", items: [
        "**Clasificación.** Pasaporte, NIE/TIE, certificado de empadronamiento, contrato de trabajo, vida laboral, antecedentes penales, informe de arraigo, nóminas… El documento va a su casilla del expediente sin que nadie lo mueva; lo que no encaja en la lista del trámite se guarda en «Otros documentos».",
        "**Extracción.** Nombre y apellidos, número de pasaporte y NIE, fechas de expedición y caducidad, nacionalidad, domicilio: los datos pasan a la ficha del cliente y de ahí a los formularios EX. No se teclean.",
        "**Comprobaciones.** Que el documento se lee (foto borrosa, recortada, a oscuras); que no está caducado ni caduca antes de la presentación; que corresponde al trámite (un padrón de hace un año no sirve para un arraigo); que los datos coinciden entre documentos (mismo nombre en pasaporte y contrato).",
        "**Resultado.** Cada documento queda VALIDADO, RECHAZADO (con el motivo, para que el cliente lo repita) o pendiente de tu revisión, con el porcentaje de confianza de la lectura a la vista.",
      ] },
    ],
    afirmamos: [
      { t: "p", texto: "No es un adjetivo: es un flujo con pasos concretos que puedes ver funcionar." },
      { t: "esquema", titulo: "Qué pasa con un documento desde que se sube", nodos: [
        { titulo: "Se sube", texto: "Portal del cliente (móvil), email reenviado o subida del despacho." },
        { titulo: "Se lee", texto: "Modelo de visión (Claude, de Anthropic) sobre la imagen o el PDF.", destacado: true },
        { titulo: "Se comprueba", texto: "Tipo, legibilidad, caducidad, correspondencia con el trámite, coherencia entre documentos." },
      ], destino: { titulo: "Queda en su sitio", texto: "Casilla del expediente, ficha rellenada, estado y motivo visibles para el gestor y el cliente." } },
      { t: "ul", items: [
        `**Puedes verlo en tres minutos.** ${PRUEBA} Sube tú mismo una foto de un documento cualquiera y verás la lectura, la casilla y el veredicto.`,
        "**El porcentaje de confianza se enseña.** Cuando la lectura no es segura, lo dice, y el gestor decide. Un sistema que nunca duda no es más fiable, es menos honesto.",
        "**Los documentos no entrenan ningún modelo.** La lectura se hace por API con Anthropic bajo condiciones comerciales que excluyen el uso de los datos para entrenar; el proveedor no conserva el contenido más de 30 días ([garantía completa](/garantias/tus-datos-no-entrenan-ia)).",
        "**El cliente sabe qué repetir.** El estado del documento y la instrucción de volver a subirlo aparecen en el portal en su idioma ([8 idiomas](/cifras/8-idiomas)); el detalle técnico del motivo se escribe en español, para el gestor.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No decide el fondo.** Te dice que un certificado tiene más de tres meses; no te dice si el arraigo procede. El criterio jurídico es tuyo.",
        "**No lee lo ilegible.** Una foto realmente mala se rechaza con un mensaje para repetirla, no se «adivina».",
        "**El gestor manda.** Cualquier veredicto se puede cambiar a mano, y un documento no reconocido se etiqueta en un clic.",
      ] },
    ],
    faq: [
      { q: "¿Qué documentos reconoce?", a: "Los habituales de un expediente de extranjería: pasaporte, NIE/TIE, empadronamiento, contratos, vida laboral, nóminas, antecedentes penales, informes de arraigo, certificados de nacimiento y matrimonio, resoluciones. Lo que no reconoce se guarda como «otros documentos» y se etiqueta a mano." },
      { q: "¿Puede equivocarse?", a: "Sí, y por eso enseña su confianza y deja el veredicto en manos del gestor. En la práctica, los errores vienen de fotos malas, y para eso está el rechazo con motivo: el cliente repite la foto sin que nadie le llame." },
      { q: "¿Los documentos salen de la UE?", a: "Se guardan en la UE. Para la lectura se envían por API al proveedor del modelo (Anthropic, EE. UU.) amparados en cláusulas contractuales tipo, sin uso para entrenamiento y sin conservación más allá de 30 días. Está en el DPA." },
    ],
  },
  {
    grupo: "funciones", slug: "formularios-en-un-clic",
    tarjeta: "Formularios en un clic",
    titulo: "Formularios EX y tasas 790 en un clic | Aproba",
    descripcion: "25 modelos EX y las tasas 790-012, 790-052, 790-062 y 790-026 rellenados con los datos del expediente, editables sobre el impreso oficial. La lista completa.",
    h1: "Formularios en un clic: los 25 EX y las 4 tasas, rellenados solos",
    entradilla: "Los datos que la IA ha leído en los documentos no se vuelven a teclear: el modelo EX del trámite y su tasa 790 salen del expediente, sobre el impreso oficial vigente, editables campo a campo.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 933, alt: "Página «Formularios oficiales» de un expediente: EX-17 y EX-13 rellenados, con la tasa 790-012 al lado", pie: "Los formularios generados de una renovación de TIE: EX-17 y EX-13 rellenados y editables, con las tasas 790 disponibles al lado." },
    significa: [
      { t: "p", texto: "Cada servicio del catálogo del despacho lleva asociados sus formularios oficiales. Cuando el expediente tiene la ficha y los documentos, el botón «Generar formularios» produce el PDF del modelo EX correspondiente con las casillas rellenadas —titular, representante, domicilio a efectos de notificaciones, situación— y, al lado, la tasa 790 que toca, también rellenada." },
      { t: "ul", items: [
        "**Sobre el impreso oficial.** No es una plantilla parecida: es el PDF publicado por el Ministerio, con los datos escritos en sus casillas. Se presenta tal cual.",
        "**Editable.** Cada campo se puede corregir sobre el propio PDF, incluida la página 2 (lugar, fecha, firmante). Si cambias la ficha, regeneras.",
        "**Familias.** En un expediente familiar, un formulario por miembro, con el solicitante y el reagrupante en el sitio correcto.",
        "**Con su tasa.** 790-012 (Policía), 790-052 y 790-062 (Oficinas de Extranjería: residencia y trabajo) o 790-026 (Justicia, nacionalidad), según el trámite ([las 29 piezas](/cifras/29-formularios-y-tasas-oficiales)).",
      ] },
    ],
    afirmamos: [
      { t: "p", texto: "La lista es cerrada y se puede comprobar modelo a modelo en la cuenta de prueba." },
      { t: "tabla", titulo: "Los 25 modelos EX disponibles", encabezados: ["Modelo", "Trámite", "Modelo", "Trámite"], filas: [
        ["EX-00", "Estancia de larga duración (estudios…)", "EX-17", "Tarjeta de identidad de extranjero (TIE)"],
        ["EX-01", "Residencia no lucrativa", "EX-18", "Registro / residencia de ciudadano UE"],
        ["EX-02", "Reagrupación familiar", "EX-19", "Tarjeta de familiar de ciudadano UE"],
        ["EX-03", "Residencia y trabajo por cuenta ajena", "EX-20", "Documento art. 50 TUE (Reino Unido)"],
        ["EX-04", "Residencia para prácticas", "EX-23", "Tarjeta Acuerdo de Retirada (Brexit)"],
        ["EX-06", "Residencia y trabajo de temporada", "EX-24", "Familiar de persona española"],
        ["EX-07", "Residencia y trabajo por cuenta propia", "EX-25", "Menores (residencia / desplazamiento)"],
        ["EX-09", "Residencia con excepción de trabajo", "EX-26", "Modificación de autorización"],
        ["EX-10", "Arraigo (régimen anterior)", "EX-28", "Disposición transitoria 2ª (RD 1155/2024)"],
        ["EX-11", "Larga duración", "EX-29", "Prórroga de estancia de corta duración"],
        ["EX-13", "Autorización de regreso", "EX-31", "Arraigos (RD 1155/2024)"],
        ["EX-15", "NIE y certificados", "EX-32", "Arraigo DA 21ª — regularización 2026"],
        ["EX-16", "Cédula de inscripción / título de viaje", "", ""],
      ], nota: "Los impresos oficiales cambian: Aproba compara periódicamente las versiones publicadas con sus plantillas y actualizamos el modelo cuando cambia. Los formularios ya generados conservan el PDF que se presentó." },
      { t: "ul", items: [
        `**Genera uno tú.** ${PRUEBA} Pulsa «Generar formularios» y abre el PDF: verás las casillas rellenadas y podrás editarlas.`,
        "**Cada dato tiene origen.** Lo que aparece en el EX viene de la ficha, y lo que hay en la ficha viene de un documento leído o de lo que escribió el gestor. No hay un tercer sitio donde se teclee.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**Faltan tres modelos** de uso menos frecuente (EX-21, EX-22 y EX-30), en preparación. El resto de la serie vigente está.",
        "**Aproba no presenta.** El PDF se presenta en Mercurio o en la sede electrónica con tu certificado, como siempre.",
        "**La tasa no se paga aquí.** Se genera el impreso; el pago sigue su cauce y el justificante se adjunta al expediente.",
      ] },
    ],
    faq: [
      { q: "¿Se puede añadir un modelo a mano a un expediente?", a: "Sí. Además de los formularios asociados al servicio, el gestor puede añadir cualquiera de los 25 modelos a un expediente concreto." },
      { q: "¿Qué pasa con los campos que la IA no ha leído?", a: "Quedan vacíos y marcados en la ficha para que el gestor los complete; el formulario se regenera en un clic." },
      { q: "¿Sirven los PDF generados para Mercurio?", a: "Sí: son los impresos oficiales rellenados, en PDF, tal como Mercurio y las Oficinas los admiten." },
    ],
  },
  {
    grupo: "funciones", slug: "avisos-automaticos",
    tarjeta: "Avisos automáticos",
    titulo: "Avisos automáticos al cliente en cada paso | Aproba",
    descripcion: "Diez avisos predeterminados (documento recibido, validado, presentado, resuelto, cita…), editables y con historial en el expediente. Qué hacen y qué no.",
    h1: "Avisos automáticos: el cliente se entera sin llamarte",
    entradilla: "Cada avance del expediente genera un mensaje al cliente con el texto que el despacho haya decidido. El historial del expediente guarda cada envío. Esto es lo que se envía, cuándo y en qué idioma.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 933, alt: "Ajustes › Notificaciones al cliente: cada aviso con su interruptor y su texto editable", pie: "Ajustes › Notificaciones al cliente: los avisos con su interruptor y su texto, tal como los edita el despacho." },
    significa: [
      { t: "p", texto: "Un aviso es un email que sale solo cuando pasa algo en el expediente. El despacho no lo redacta cada vez: elige, una sola vez en Ajustes, qué avisos están activos y con qué texto. Los placeholders {nombre}, {documento} y {fecha} se rellenan en cada envío." },
      { t: "tabla", titulo: "Los diez avisos predeterminados", encabezados: ["Cuándo", "Aviso"], filas: [
        ["El cliente sube un documento", "Documento recibido"],
        ["La IA (o el gestor) lo valida", "Documento validado"],
        ["Se rechaza por ilegible o incorrecto", "Documento rechazado (con el motivo y qué repetir)"],
        ["Se generan los EX", "Formularios preparados"],
        ["Se marca la presentación", "Expediente presentado"],
        ["Llega la resolución", "Resolución favorable / desfavorable"],
        ["Hay una cita", "Cita presencial: acude el cliente / acude el gestor"],
        ["Se entrega la TIE o termina el trámite", "Trámite completado"],
      ], nota: "Además, avisos propios: un mensaje adicional colgado de cualquiera de esos eventos, con su asunto y su texto." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Cada envío deja rastro.** En el historial del expediente aparece el aviso, la fecha y el estado (enviado, o simulado si el despacho no tiene el envío activo). Lo que no se puede ver, no se afirma.",
        "**Dos familias de mensajes, y lo decimos.** Los diez avisos configurables salen con el texto que escribe el despacho, tal cual (en español, o en el idioma en que lo escriba). Las notificaciones automáticas del portal —recordatorio de documentos pendientes, seguimiento del expediente, propuesta de renovación, documento pedido— sí se envían en el idioma del cliente, entre [ocho](/cifras/8-idiomas).",
        "**Editable y desactivable.** Cada aviso se activa, se desactiva, se reescribe o se elimina (y se restaura) desde Ajustes › Notificaciones al cliente; los cambios se guardan solos.",
        `**Pruébalo con el ejemplo.** ${PRUEBA} Valida un documento y verás el aviso en el historial.`,
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**Por email.** Los avisos salen hoy por email (Resend, entrega desde la UE). El envío desde el propio WhatsApp del despacho está en preparación y no se afirma hasta que esté.",
        "**Sin email no hay aviso.** Si la ficha del cliente no tiene email, el aviso queda registrado como «sin contacto» y el gestor lo ve.",
      ] },
    ],
    faq: [
      { q: "¿El cliente puede responder al aviso?", a: "Sí: el remitente es el despacho y la respuesta llega a su buzón, no a Aproba." },
      { q: "¿Puedo poner mi logo?", a: "En los planes Pro y Business, los emails al cliente y el portal llevan el logo del despacho." },
      { q: "¿Los avisos se traducen al idioma del cliente?", a: "Los diez avisos configurables no: salen con el texto que escribe el despacho. Las notificaciones automáticas del portal (recordatorio de documentos, seguimiento, propuesta de renovación, documento pedido) sí van en el idioma del cliente. Si tu cartera es mayoritariamente de un idioma, puedes escribir los avisos en ese idioma." },
      { q: "¿Se envían avisos en la cuenta de prueba?", a: "Sí, con las mismas reglas; el expediente de ejemplo tiene un cliente ficticio, así que nada sale a una persona real hasta que creas un expediente con un email de verdad." },
    ],
  },
  {
    grupo: "funciones", slug: "tablero-de-seguimiento",
    tarjeta: "Tablero de seguimiento",
    titulo: "Tablero de seguimiento de expedientes de extranjería | Aproba",
    descripcion: "Un tablero con dos fases de trabajo, la siguiente acción en cada tarjeta y el porcentaje de completitud calculado desde los hechos del expediente. Cómo se lee.",
    h1: "Tablero de seguimiento: qué falta, qué está listo, qué se presentó",
    entradilla: "Dos columnas de trabajo, una tarjeta por expediente y en cada tarjeta la siguiente acción. La posición no la elige nadie: se deriva de lo que hay en el expediente.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 1013, alt: "Tablero de expedientes con las dos fases, Preparación y Preparado, y las tarjetas con su completitud", pie: "El tablero real: dos fases con su recuento, anillo de completitud en Preparación y chips Facturado / Sin facturar / Concedido en Preparado." },
    significa: [
      { t: "p", texto: "El tablero muestra los expedientes vivos del despacho en dos fases: **Preparación** (falta algo: el servicio, documentos, formularios) y **Preparado** (todo listo para presentar, o ya presentado y en espera). Cada tarjeta lleva la siguiente acción concreta —«subir documentos», «generar formularios», «archivar»— y un porcentaje de completitud." },
      { t: "ul", items: [
        "**La fase se calcula, no se arrastra.** Un expediente está en Preparado cuando la ficha, los documentos requeridos y los formularios están; no porque alguien moviera la tarjeta. Así el tablero no miente por olvido.",
        "**La completitud tiene desglose.** Información, documentos y formularios, cada uno con su porcentaje; el número global sin detalle no dice qué falta.",
        "**Todo el equipo ve lo mismo.** Filtros por oficina, por estado y por lo que ya salió del tablero (entregado, denegado, archivado).",
        "**Las renovaciones se anuncian.** Una vista propia lista las que vencen en los próximos seis meses ([radar de renovaciones](/funciones/radar-de-renovaciones)).",
      ] },
    ],
    afirmamos: [
      { t: "ul", items: [
        `**Se comprueba con el ejemplo.** ${PRUEBA} Verás su tarjeta en Preparado con «Generar formularios» como siguiente acción; genera los formularios y observa cómo cambia.`,
        "**Cada movimiento tiene una causa visible.** Al abrir la tarjeta, la ficha enseña el desglose (qué documento falta, qué campo está vacío) que explica la posición.",
        "**Lo que sale del tablero sigue existiendo.** «Facturar y archivar» es el único gesto de cierre; lo archivado se consulta con un filtro y se recupera.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No sabe lo que pasa fuera.** La presentación en Mercurio y la resolución las marca el gestor; el tablero no lee la sede electrónica.",
        "**Dos fases, no ocho.** Es una decisión: los tableros con muchas columnas acaban con la mitad vacía. Lo que necesita más detalle está en la ficha, no en la columna.",
      ] },
    ],
    faq: [
      { q: "¿Puedo mover una tarjeta a mano?", a: "La fase se deriva de los hechos; lo que sí decides a mano es el cierre (archivar, entregado, denegado) y el servicio del expediente." },
      { q: "¿Hay vista por persona del equipo?", a: "El tablero se filtra por oficina y por estado; cada tramitador trabaja en su oficina y los administradores ven todas." },
    ],
  },
  {
    grupo: "funciones", slug: "radar-de-renovaciones",
    tarjeta: "Radar de renovaciones",
    titulo: "Radar de renovaciones: caducidades vigiladas | Aproba",
    descripcion: "Cada TIE, pasaporte y NIE con su fecha; aviso con antelación; propuesta de renovación al cliente con dos botones (aceptar o rechazar), sin factura previa.",
    h1: "Radar de renovaciones: ese cliente vuelve a ti",
    entradilla: "Un expediente resuelto vuelve en uno, dos o cinco años. El radar (Vigía, dentro de Aproba) guarda cada caducidad, avisa antes y propone la renovación al cliente; si acepta, el expediente nuevo nace con los datos del anterior.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 853, alt: "Vencimientos: grupos Ya caducadas, Caducan en menos de 60 días, Más adelante y Renovación aceptada, con el botón Proponer renovación", pie: "La lista de Vencimientos de un despacho: cada caducidad en su grupo, el botón «Proponer renovación» y, abajo, las renovaciones ya aceptadas con su expediente." },
    significa: [
      { t: "ul", items: [
        "**Qué vigila.** La caducidad de la autorización y de la TIE en cada resolución favorable; el pasaporte y el NIE del cliente (un pasaporte caducado bloquea cualquier trámite); y las cohortes importadas con su fecha de resolución.",
        "**Cómo avisa.** La lista de Vencimientos separa lo ya caducado, lo que caduca en menos de 60 días y lo que viene más adelante.",
        "**Qué propone.** Con un clic, Aproba elige el servicio de renovación que corresponde (o pide al gestor que lo confirme o lo cree) y envía al cliente, en su idioma, el trámite, los honorarios y dos botones: aceptar o rechazar.",
        "**Qué pasa si acepta.** El expediente de renovación se crea con los datos y los documentos del anterior; el cliente sube solo lo que ha cambiado. Si rechaza, queda anotado y el gestor lo ve.",
      ] },
    ],
    afirmamos: [
      { t: "esquema", titulo: "De la caducidad a la renovación aceptada", nodos: [
        { titulo: "Vencimiento detectado", texto: "TIE, pasaporte o NIE con fecha próxima, en Vencimientos." },
        { titulo: "Servicio de renovación", texto: "Propuesto por Aproba; el gestor lo confirma o lo crea al momento.", destacado: true },
        { titulo: "Propuesta al cliente", texto: "Email con trámite, honorarios, contacto del despacho y dos botones." },
      ], destino: { titulo: "Renovación en marcha", texto: "Expediente nuevo con los datos del anterior; sin factura hasta que el cliente completa el portal." }, nota: "Para un pasaporte o un NIE, Aproba puede pedir solo el documento nuevo en lugar de proponer un trámite." },
      { t: "ul", items: [
        "**Ninguna factura antes de aceptar.** La propuesta solo pide una respuesta; el anticipo se emite cuando el cliente completa el expediente nuevo, como en cualquier expediente. Es una regla del producto, no una opción.",
        "**La respuesta queda a la vista.** Aceptada, rechazada o sin responder: en Vencimientos, con la fecha.",
        "**Se prueba con un Excel.** Importa una lista con fechas de resolución en la cuenta de prueba y verás el calendario de vencimientos, sin crear nada a mano.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No conoce lo que no está.** Si un expediente nunca entró en Aproba (ni por importación), no hay fecha que vigilar.",
        "**El cliente decide.** Una propuesta no es un expediente: sin aceptación, no se crea trabajo ni se cobra.",
      ] },
    ],
    faq: [
      { q: "¿Por qué importa esto en 2027?", a: "Las autorizaciones de la regularización extraordinaria de 2026 duran un año: cerca de 600.000 vencen casi a la vez a mediados de 2027. Un despacho con la lista y las fechas reparte el trabajo; uno sin ella lo recibe de golpe. Lo explicamos con las cifras oficiales en el artículo sobre las renovaciones de 2027." },
      { q: "¿Con cuánta antelación se envía la propuesta?", a: "Cuando el gestor la lanza desde Vencimientos; lo habitual son dos o tres meses antes de la caducidad." },
      { q: "¿Y si el servicio de renovación no existe en mi catálogo?", a: "Aproba te lo pide en el momento: lo creas en el mismo diálogo, con su precio, y queda en el catálogo para la siguiente." },
    ],
  },
  {
    grupo: "funciones", slug: "facturas-automaticas",
    tarjeta: "Facturas automáticas",
    titulo: "Facturas automáticas desde el expediente | Aproba",
    descripcion: "Anticipo y resto, tasas como suplidos sin IVA, descuentos, familias y empresas, cobro por tarjeta opcional. La factura sale del expediente y se exporta.",
    h1: "Facturas automáticas: la factura sale del expediente",
    entradilla: "Un trámite de extranjería se cobra de una manera concreta: anticipo al encargar, resto después, tasas aparte. Aproba factura así, desde el expediente, sin copiar datos a otro programa.",
    actualizado: "2026-09-13",
    captura: { w: 1600, h: 577, alt: "Bloque «Cobro del expediente»: pago inicial al firmar, pago final al terminar y el botón para solicitar el pago", pie: "El cobro dentro del expediente: anticipo al firmar, resto al terminar, descuento y suplidos a un clic; cada pago genera su factura." },
    significa: [
      { t: "ul", items: [
        "**Anticipo y resto** configurados por servicio: la primera factura se emite cuando el cliente completa el portal; la última, cuando toca.",
        "**Suplidos sin IVA.** Las tasas 790 y otros suplidos entran en la factura separados de los honorarios, con su tratamiento fiscal.",
        "**Descuentos** en porcentaje o en euros por expediente, reflejados en el portal, la hoja de encargo y la factura al céntimo.",
        "**Familias y empresas.** Precio por miembro o distinto para cada uno; o una empresa que contrata y paga mientras el trabajador sigue siendo el titular.",
        "**Cobro.** Por defecto, transferencia al IBAN del despacho; opcionalmente, tarjeta con la cuenta Stripe del propio despacho (el dinero nunca pasa por Aproba); y cobro externo (efectivo, TPV) registrado en la factura.",
        "**Exportación.** PDF por factura, CSV para Excel y ZIP de todas, para tu gestoría contable o tu programa.",
      ] },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Reglas de integridad que no se pueden desactivar.** Un número de factura nunca se reutiliza; una factura emitida no se borra (se archiva); los datos fiscales del cliente quedan congelados en cada factura, aunque la ficha cambie después. Están verificadas por pruebas automáticas en cada versión.",
        `**Mira una en el ejemplo.** ${PRUEBA} Trae su factura de ejemplo: anticipo, suplido y total, tal como la vería el cliente.`,
        "**Los cálculos son comprobables.** Honorarios × miembros, descuento, suplidos sin IVA, IVA sobre honorarios: cada línea de la factura enseña su base.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No es un programa de contabilidad.** Emite y exporta; los asientos siguen en A3, Holded o el que uses.",
        "**VeriFactu.** La obligación de facturación verificable llega el 1 de enero de 2027 (sociedades) y el 1 de julio de 2027 (autónomos). La facturación de Aproba ya cumple la base —numeración correlativa, nada se reutiliza ni se borra— y publicaremos la fecha de adaptación completa con antelación. No afirmamos hoy lo que no está.",
        "**Planes Pro y Business.** Starter no incluye la facturación integrada.",
      ] },
    ],
    faq: [
      { q: "¿Puedo emitir una factura a mano?", a: "Sí, y se integra en la misma numeración; las automáticas no la pisan." },
      { q: "¿Qué pasa si la familia cambia después de emitir?", a: "Una factura emitida no cambia. Si el expediente cambia de composición antes del pago, Aproba la realinea con una nueva y deja la anterior anulada, con rastro." },
      { q: "¿El cliente ve la factura en el portal?", a: "Sí: la ve, la descarga y, si el despacho lo ha activado, la paga con tarjeta desde ahí." },
    ],
  },

  // ═══════════════════════════════ CIFRAS ═══════════════════════════════
  {
    grupo: "cifras", slug: "de-3-horas-a-30-minutos",
    tarjeta: "3 h → 30 min por expediente",
    titulo: "De 3 horas a 30 minutos por expediente: el cálculo | Aproba",
    descripcion: "De dónde sale la cifra «3 h → 30 min por expediente»: el desglose por tarea de un expediente tipo, qué es estimación y cómo medirlo tú mismo en la prueba.",
    h1: "3 h → 30 min por expediente: de dónde sale la cifra",
    entradilla: "No es una media de clientes ni un estudio independiente: es el desglose de un expediente tipo, tarea por tarea, con lo que Aproba quita de cada una. Lo publicamos para que se pueda discutir.",
    actualizado: "2026-09-13",
    significa: [
      { t: "p", texto: "Tomamos como referencia una renovación de residencia temporal de una persona sola, con el cliente respondiendo el mismo día. Contamos solo el tiempo del despacho (no el del cliente ni el de la Administración) y solo hasta tener el expediente listo para presentar." },
      { t: "tabla", titulo: "Desglose de un expediente tipo (tiempo del despacho)", encabezados: ["Tarea", "A mano", "Con Aproba", "Qué cambia"], filas: [
        ["Pedir y recibir la documentación", "60-90 min", "5 min", "El cliente sube todo desde el móvil con la lista del trámite; se pide una vez"],
        ["Revisar cada documento", "20-30 min", "5 min", "La IA lee, clasifica y marca caducados o ilegibles; el gestor confirma"],
        ["Rellenar el EX y la tasa", "30-45 min", "2 min", "Formularios generados desde la ficha, editables"],
        ["Informar al cliente y atender llamadas", "15-30 min", "0 min", "Avisos automáticos en cada paso"],
        ["Anotar el estado y la caducidad", "5-10 min", "2 min", "Tablero y radar de renovaciones"],
        ["Preparar la factura", "10-15 min", "1 min", "Factura desde el expediente"],
        ["**Total**", "**2 h 20 – 3 h 40**", "**≈ 15-25 min**", "más tu revisión final"],
      ], nota: "Rangos redondeados. El total «a mano» de 3 horas es el centro del rango; el de 30 minutos incluye la revisión final del gestor, que no se automatiza." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**La cifra es una estimación y así la presentamos.** Depende del trámite, de la calidad de las fotos y de lo rápido que conteste el cliente. Una reagrupación con cuatro miembros y documentos en tres idiomas no tarda lo mismo que una renovación.",
        `**Puedes medirlo hoy.** ${PRUEBA} Cronometra desde que abres el expediente hasta que tienes los EX generados: el tiempo del despacho está ahí.`,
        "**Lo que sí es exacto:** con Aproba no se teclea ningún dato de un documento en un formulario, y ninguna llamada de «¿cómo va lo mío?» hace falta para saber el estado. Esas dos cosas son las que se llevan la mayor parte del tiempo del desglose.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No cuenta el criterio.** Estudiar el caso, decidir la vía y preparar un escrito de alegaciones es trabajo jurídico y no entra en la cifra.",
        "**No cuenta la espera.** Si el cliente tarda una semana en subir el padrón, el expediente tarda una semana; el tiempo del despacho sigue siendo el mismo.",
      ] },
    ],
    faq: [
      { q: "¿Tenéis datos de clientes reales?", a: "Tenemos el uso real de los despachos que trabajan con Aproba, pero no publicamos medias de clientes con tan pocas cuentas: sería una cifra bonita y poco fiable. Publicamos el desglose para que cada despacho lo compare con el suyo." },
      { q: "¿Y si mi expediente tipo es otro?", a: "Haz el mismo desglose con tu trámite más frecuente: las tareas que Aproba elimina (teclear, perseguir documentos, atender llamadas de estado) son las mismas." },
    ],
  },
  {
    grupo: "cifras", slug: "80-por-ciento-menos-errores",
    tarjeta: "−80 % errores administrativos",
    titulo: "−80 % de errores administrativos: cuáles y por qué | Aproba",
    descripcion: "Las cinco causas habituales de requerimiento por defecto de forma en extranjería, cuáles elimina Aproba por construcción y de dónde sale el 80 %.",
    h1: "−80 % errores administrativos: cuáles son y por qué desaparecen",
    entradilla: "Un requerimiento de subsanación casi nunca viene del fondo del caso: viene de un dato mal tecleado, un documento caducado o una tasa equivocada. Estas son las causas y lo que Aproba hace con cada una.",
    actualizado: "2026-09-13",
    significa: [
      { t: "p", texto: "Llamamos error administrativo al defecto de forma que provoca un requerimiento o un retraso sin que el caso tenga ningún problema de fondo. En nuestra experiencia con despachos de extranjería se concentran en cinco causas." },
      { t: "tabla", titulo: "Las cinco causas y qué hace Aproba", encabezados: ["Causa del requerimiento", "Qué la provoca", "Con Aproba"], filas: [
        ["Dato erróneo en el formulario", "Se teclea el pasaporte, la fecha o el nombre", "**Eliminada**: el dato viene de la lectura del documento, no del teclado"],
        ["Documento caducado o antiguo", "Nadie mira la fecha al recibirlo", "**Eliminada**: la caducidad se comprueba al subir y se rechaza con motivo"],
        ["Documento que falta", "La lista está en la cabeza de alguien", "**Eliminada**: el trámite tiene su lista y el expediente no está «preparado» hasta completarla"],
        ["Modelo o tasa equivocados", "EX-10 donde tocaba EX-31; 052 donde tocaba 012", "**Eliminada**: el servicio lleva su modelo y su tasa"],
        ["Prueba insuficiente o criterio", "Arraigo mal fundamentado, medios económicos justos", "**No la toca**: es trabajo jurídico"],
      ], nota: "Cuatro causas de cinco eliminadas por construcción: de ahí el 80 %. Es una proporción de causas, no una medición sobre una cartera." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Es un cálculo, no una auditoría, y lo decimos.** No hemos contado requerimientos antes y después en cien despachos; hemos identificado las causas de forma y comprobado cuáles no pueden ocurrir en Aproba. Cuando tengamos una medición sobre carteras reales, la publicaremos aquí con su fecha.",
        "**«Por construcción» significa que no depende de que nadie se acuerde.** El EX no se puede rellenar con un dato distinto del de la ficha; la ficha no se rellena tecleando lo que ya está en un documento leído; el expediente no llega a «preparado» con un documento requerido sin validar.",
        `**Se ve en el ejemplo.** ${PRUEBA} Cambia la fecha de caducidad del pasaporte en la ficha a una pasada y mira qué hace el expediente.`,
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No elimina el error de criterio**, que es justamente el que vale tus honorarios.",
        "**No lee lo que no está.** Un documento que el cliente no sube no se puede comprobar; sí aparece como pendiente hasta que llega.",
      ] },
    ],
    faq: [
      { q: "¿Qué pasa si aun así llega un requerimiento?", a: "Se registra en el expediente con su plazo, el cliente recibe la lista de lo que hay que aportar y el tablero lo devuelve a Preparación hasta subsanar." },
      { q: "¿Contáis los errores de la Administración?", a: "No: la cifra habla de los errores del expediente que presentas, no de los que comete quien lo resuelve." },
    ],
  },
  {
    grupo: "cifras", slug: "29-formularios-y-tasas-oficiales",
    tarjeta: "29 formularios y tasas oficiales en un clic",
    titulo: "29 formularios y tasas oficiales en un clic: la lista | Aproba",
    descripcion: "Los 25 modelos EX y las 4 tasas 790 (012, 052, 062, 026) que Aproba genera desde el expediente, uno por uno, y qué trámite corresponde a cada uno.",
    h1: "29 formularios y tasas oficiales: los 25 EX y las 4 tasas, uno por uno",
    entradilla: "Veinticinco son modelos EX de la serie vigente; cuatro son las tasas 790 de extranjería. Aquí está la lista completa, para que «29» no sea un número redondo sino una cuenta.",
    actualizado: "2026-09-13",
    significa: [
      { t: "datos", items: [
        { valor: "25", etiqueta: "modelos EX sobre el impreso oficial" },
        { valor: "4", etiqueta: "tasas 790: 012, 052, 062 y 026" },
        { valor: "29", etiqueta: "piezas rellenadas desde el expediente" },
      ] },
      { t: "p", texto: "La lista de los 25 modelos EX, con su trámite, está en la página de [formularios en un clic](/funciones/formularios-en-un-clic). Las cuatro tasas:" },
      { t: "tabla", titulo: "Las cuatro tasas de extranjería", encabezados: ["Tasa", "Organismo", "Trámites habituales", "Cómo la genera Aproba"], filas: [
        ["790-012", "Ministerio del Interior (Policía)", "TIE inicial y renovaciones, certificados, autorización de regreso", "Impreso oficial rellenado, campos editables"],
        ["790-052", "Oficinas de Extranjería (Delegaciones del Gobierno)", "Autorizaciones de residencia y de residencia y trabajo, arraigos, reagrupación", "Impreso oficial rellenado, campos editables"],
        ["790-062", "Oficinas de Extranjería (Delegaciones del Gobierno)", "Autorizaciones de trabajo: iniciales por cuenta ajena o propia, renovaciones, temporada (en Cataluña, las iniciales llevan la tasa de la Generalitat)", "Impreso oficial rellenado, campos editables"],
        ["790-026", "Ministerio de Justicia", "Nacionalidad española por residencia", "Generada directamente en la sede, con justificante"],
      ], nota: "Los importes los fija cada ejercicio la orden correspondiente; Aproba los actualiza en sus plantillas." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Cada pieza existe y se puede abrir.** Los 25 PDF oficiales están en la plataforma con su versión vigilada; las cuatro tasas se generan desde el expediente. En la cuenta de prueba se ven todas en la lista de formularios del expediente de ejemplo.",
        "**El trámite decide.** No hay que saber qué modelo toca: el servicio del catálogo lleva asociados su EX y su tasa; el gestor puede añadir otro a mano.",
        "**Lo que falta, se dice.** Tres modelos de uso menos frecuente (EX-21, EX-22 y EX-30) están en preparación. Cuando entren, la cifra será 31 y lo cambiaremos aquí y en la portada.",
      ] },
    ],
    faq: [
      { q: "¿Se generan en un solo clic de verdad?", a: "Sí: «Generar formularios» produce todos los del trámite a la vez, con la tasa; cada uno se abre y se edita por separado." },
      { q: "¿Y los formularios de otros organismos (DGT, Educación)?", a: "No están: Aproba se limita a extranjería y nacionalidad. Los documentos de otros organismos se adjuntan al expediente como cualquier archivo." },
    ],
  },
  {
    grupo: "cifras", slug: "8-idiomas",
    tarjeta: "8 idiomas para tus clientes, árabe incluido",
    titulo: "Portal del cliente en 8 idiomas, árabe incluido | Aproba",
    descripcion: "Español, inglés, francés, italiano, alemán, árabe, rumano y chino: dónde se aplican los ocho idiomas (portal y sus notificaciones), dónde no, y por qué esos.",
    h1: "8 idiomas para tus clientes: cuáles, dónde y por qué esos",
    entradilla: "La mayoría de los clientes de extranjería no leen bien el español, y un formulario en español menos. El portal y sus notificaciones hablan el idioma del cliente. Estos son los ocho, dónde se aplican y dónde no.",
    actualizado: "2026-09-13",
    significa: [
      { t: "tabla", titulo: "Los ocho idiomas y a quién sirven", encabezados: ["Idioma", "Comunidades habituales en los despachos"], filas: [
        ["Español", "Latinoamérica (Colombia, Venezuela, Perú, Honduras…), la mayor parte de la cartera"],
        ["Inglés", "Reino Unido, Nigeria, Pakistán, India, Filipinas, y muchos como segunda lengua"],
        ["Francés", "Senegal, Mali, Costa de Marfil, Argelia, Marruecos"],
        ["Árabe", "Marruecos (segunda nacionalidad de la regularización de 2026), Argelia, Siria"],
        ["Rumano", "Rumanía, la comunidad UE más numerosa en España"],
        ["Chino", "China"],
        ["Italiano", "Italia y ciudadanos latinoamericanos con nacionalidad italiana"],
        ["Alemán", "Alemania, Austria, Suiza"],
      ], nota: "El árabe se escribe de derecha a izquierda: el portal lo muestra así, no como texto invertido." },
      { t: "p", texto: "Dónde se aplica: el portal del cliente entero (lista de documentos, ficha, hoja de encargo, pago, instrucciones para repetir una foto) y las notificaciones automáticas del portal por email (recordatorio de documentos pendientes, seguimiento del expediente, propuesta de renovación, documento pedido). El cliente elige su idioma una vez." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Compruébalo en un minuto.** Crea un expediente en la cuenta de prueba, abre su enlace en el móvil y cambia el idioma en la parte superior del portal: todo cambia, incluidos los nombres de los documentos.",
        "**Son traducciones revisadas, no automáticas al vuelo.** Cada texto del portal existe en los ocho idiomas dentro del producto y se revisa cuando se añade una función; la cobertura se comprueba automáticamente en cada versión.",
        "**El por qué de la lista.** Colombia (25,9 %), Marruecos (13,3 %) y Venezuela (11,8 %) encabezaron las solicitudes de la regularización de 2026 según los datos oficiales de julio; el árabe es, por volumen, el primer idioma no latino de los despachos. El rumano y el chino cubren dos comunidades grandes con poco español escrito.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**La interfaz del gestor está en español y catalán**, no en los ocho idiomas: quien trabaja en el despacho lee español.",
        "**Los formularios oficiales están en español**, como exige la Administración; lo que se traduce es la explicación al cliente, no el impreso.",
        "**Los diez avisos configurables del despacho no se traducen**: salen con el texto que escribe el gestor. Lo que sí va en el idioma del cliente son las notificaciones automáticas del portal.",
        "**Urdu, wolof, ucraniano o portugués** no están todavía. Si tu cartera los necesita, dínoslo: añadir un idioma es trabajo de traducción, no de arquitectura.",
      ] },
    ],
    faq: [
      { q: "¿El cliente puede cambiar de idioma a mitad de trámite?", a: "Sí, en cualquier momento desde el portal; los avisos siguientes salen en el nuevo idioma." },
      { q: "¿Los avisos del despacho se traducen?", a: "No: los avisos configurables (predeterminados y propios) salen con el texto que escribe el gestor. Las notificaciones automáticas del portal —recordatorio de documentos, seguimiento, propuesta de renovación— sí están en los ocho idiomas." },
    ],
  },

  // ═════════════════════════════ GARANTÍAS ═════════════════════════════
  {
    grupo: "garantias", slug: "rgpd-y-dpa",
    tarjeta: "RGPD y DPA firmado",
    titulo: "RGPD y contrato de encargado del tratamiento (DPA) | Aproba",
    descripcion: "Qué significa que Aproba cumple el RGPD y firma contigo el DPA: artículo 28, qué obligaciones asume, subencargados públicos, y cómo obtener el contrato firmado.",
    h1: "RGPD y DPA firmado: qué te garantiza y cómo se comprueba",
    entradilla: "Un despacho de extranjería trata pasaportes, antecedentes y datos de salud. Quien le da un software es encargado del tratamiento y responde por escrito. Esto es lo que firmamos y dónde está.",
    actualizado: "2026-09-13",
    significa: [
      { t: "p", texto: "El despacho es el **responsable** del tratamiento de los datos de sus clientes; Aproba es el **encargado** (artículo 28 del RGPD). Esa relación exige un contrato que fije qué hace Aproba con los datos, con qué medidas, con qué subencargados y qué pasa al terminar. Ese contrato es el DPA." },
      { t: "ul", items: [
        "**Se aplica desde el primer dato.** El DPA forma parte de los Términos y se entiende aceptado al empezar a usar la plataforma, incluida la prueba gratuita: no hay un periodo «sin contrato».",
        "**Obligaciones concretas.** Tratar solo según instrucciones del despacho; confidencialidad del personal; medidas de seguridad (cifrado, control de acceso por despacho, copias); asistencia para atender derechos de los interesados; notificación de brechas sin dilación; devolución o supresión al finalizar.",
        "**Subencargados públicos.** La lista completa (alojamiento, IA, email, pagos, calendario, WhatsApp) está en la Política de privacidad y en el DPA, con finalidad, ubicación y garantía de cada uno. Los cambios se avisan y se pueden objetar.",
      ] },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**El texto es público y estable.** Está en [/legal/dpa](/legal/dpa), con fecha de última actualización; no hay una versión «para clientes» distinta de la publicada.",
        "**Firmado, si lo quieres en papel.** A petición, enviamos el DPA en PDF firmado por Aproba para que el despacho lo contrafirme y lo guarde en su registro de actividades.",
        "**Un contacto con nombre.** privacidad@aproba-software.com atiende las solicitudes de derechos y las consultas del delegado o del responsable del despacho.",
        "**Los datos del titular están en el aviso legal**: sociedad, NIF y domicilio. Un encargado que no se identifica no es un encargado.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**Aproba no es tu delegado de protección de datos** ni sustituye tu registro de actividades: te da el contrato y la información para completarlo.",
        "**Las instrucciones son tuyas.** Si un cliente tuyo ejerce un derecho ante Aproba, lo redirigimos al despacho y ayudamos a atenderlo; no decidimos por él.",
      ] },
    ],
    faq: [
      { q: "¿Hay un registro de actividades de Aproba que pueda pedir?", a: "Sí: la descripción de los tratamientos, las medidas y los subencargados figura en el DPA y en la Política de privacidad; lo que necesites en otro formato se envía a petición." },
      { q: "¿Qué pasa si hay una brecha?", a: "Aproba notifica al despacho sin dilación indebida tras conocerla, con la información necesaria para que el despacho, como responsable, valore la notificación a la AEPD." },
      { q: "¿Podéis firmar el DPA del propio despacho?", a: "Si el despacho tiene su modelo, lo revisamos; en la práctica el DPA publicado cubre los mismos puntos del artículo 28 y suele bastar." },
    ],
  },
  {
    grupo: "garantias", slug: "datos-en-la-ue",
    tarjeta: "Datos alojados en la UE",
    titulo: "Datos alojados en la Unión Europea: dónde está cada cosa | Aproba",
    descripcion: "Dónde se guardan la base de datos y los documentos (UE), cómo viajan (cifrados), qué proveedor toca qué dato y en qué casos un dato sale del EEE con garantías.",
    h1: "Datos alojados en la UE: dónde está exactamente cada cosa",
    entradilla: "«En la UE» es fácil de escribir. Aquí está el detalle: qué se guarda, dónde, con qué cifrado, y los dos casos en que un dato cruza una frontera y bajo qué garantía.",
    actualizado: "2026-09-13",
    significa: [
      { t: "tabla", titulo: "Qué dato, dónde", encabezados: ["Dato", "Dónde se guarda", "Proveedor", "Garantía"], filas: [
        ["Base de datos (clientes, expedientes, facturas)", "Unión Europea", "Supabase, región europea", "DPA del proveedor; cifrado en reposo y en tránsito"],
        ["Documentos (pasaportes, contratos, PDF generados)", "Unión Europea", "Almacenamiento privado de Supabase", "Acceso por despacho (RLS) y enlaces temporales"],
        ["Emails a los clientes", "Entrega desde la UE (eu-west-1)", "Resend", "SCC de la UE"],
        ["Aplicación web (páginas, API)", "Red global (edge)", "Vercel", "SCC de la UE; no almacena expedientes"],
        ["Lectura de documentos por IA", "Tránsito a EE. UU., sin conservación > 30 días", "Anthropic", "SCC de la UE; sin entrenamiento"],
        ["Pagos de la suscripción", "Irlanda / EE. UU.", "Stripe", "SCC; PCI-DSS nivel 1; Aproba no guarda tarjetas"],
      ], nota: "Google (Calendar/Meet) y Meta (WhatsApp) solo intervienen si el despacho conecta su propia cuenta; figuran en la lista de subencargados." },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Lo que se guarda está en la UE; lo que se procesa fuera, se dice.** Dos tratamientos cruzan el EEE: la lectura de documentos por el modelo de IA (Anthropic) y la infraestructura de pagos (Stripe). Ambos con cláusulas contractuales tipo y sin conservación de los documentos.",
        "**Cifrado de extremo a extremo del transporte y en reposo.** HTTPS obligatorio (HSTS), cifrado del almacenamiento, credenciales de terceros del despacho (Stripe, Google, WhatsApp) cifradas con clave propia.",
        "**Aislamiento por despacho.** Cada fila de la base de datos lleva su despacho y las políticas de acceso (RLS) impiden que una cuenta vea datos de otra, incluso ante un error del código.",
        "**La lista de proveedores es pública** y la misma en la [Política de privacidad](/legal/privacidad) y en el [DPA](/legal/dpa).",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**«En la UE» no significa «solo en España».** La región es europea; no garantizamos un centro de datos en territorio español.",
        "**El edge es global.** Las páginas se sirven desde la red de Vercel más cercana al usuario; los expedientes no se almacenan ahí.",
      ] },
    ],
    faq: [
      { q: "¿Se puede pedir que la IA no lea los documentos?", a: "La lectura es el núcleo del producto; sin ella, Aproba sería un gestor documental. Lo que sí garantizamos es el marco: sin entrenamiento, sin conservación más allá de 30 días, con SCC." },
      { q: "¿Hacéis copias de seguridad?", a: "Sí, automáticas, en la misma región europea, con la misma protección que los datos en vivo." },
    ],
  },
  {
    grupo: "garantias", slug: "tus-datos-no-entrenan-ia",
    tarjeta: "Tus datos no entrenan IA",
    titulo: "Tus documentos no entrenan ningún modelo de IA | Aproba",
    descripcion: "Qué proveedor lee los documentos de tus clientes, bajo qué condiciones (sin entrenamiento, retención máxima de 30 días) y cómo verificarlo en sus contratos.",
    h1: "Tus datos no entrenan IA: qué proveedor, qué condiciones, cómo verificarlo",
    entradilla: "Un pasaporte que entra en Aproba se lee para rellenar un expediente y para nada más. Ni Aproba ni el proveedor del modelo lo usan para entrenar. Esto es lo que lo garantiza y dónde está escrito.",
    actualizado: "2026-09-13",
    significa: [
      { t: "ul", items: [
        "**Quién lee.** Los documentos los lee un modelo de Anthropic (Claude) a través de su API comercial. No se usa ninguna cuenta de consumo ni herramienta gratuita.",
        "**Bajo qué condiciones.** Las condiciones comerciales de la API de Anthropic excluyen el uso de las entradas y salidas de los clientes para entrenar sus modelos, y limitan la conservación a un máximo de 30 días para fines de seguridad y abuso.",
        "**Qué hace Aproba con el resultado.** Los datos extraídos van a la ficha del cliente, en la UE. Aproba no entrena modelos propios con documentos de clientes ni cede documentos a terceros con ese fin.",
        "**Qué NO se usa.** Ninguna imagen ni dato de cliente se envía a proveedores de generación de imágenes ni a otros modelos; las ilustraciones del sitio se generan sin datos de nadie.",
      ] },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**Está en tres documentos que puedes leer.** Las condiciones comerciales de Anthropic (enlace abajo); nuestra [Política de privacidad](/legal/privacidad), que lo recoge en la lista de subencargados; y el [DPA](/legal/dpa), que lo convierte en obligación contractual con el despacho.",
        "**Es verificable por diseño.** Aproba no tiene ningún proceso de entrenamiento: no hay un modelo propio que alimentar. Lo que hay es una llamada por documento, con su respuesta, y nada más.",
        "**Si cambiara, tendrías que aceptarlo.** Cualquier cambio de proveedor o de condiciones se comunica como cambio de subencargado, con derecho a oponerse, según el DPA.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**«No entrena» no es «no procesa».** El documento se envía al proveedor para leerlo; sin eso no hay lectura. La garantía es sobre el uso y la conservación, no sobre la ausencia de tratamiento.",
        "**30 días es el máximo del proveedor**, no el tiempo habitual: el contenido no se conserva para el servicio, solo puede retenerse temporalmente por motivos de seguridad.",
      ] },
    ],
    fuentes: [
      { nombre: "Anthropic — Commercial Terms of Service", url: "https://www.anthropic.com/legal/commercial-terms" },
      { nombre: "Anthropic — Data Processing Addendum", url: "https://www.anthropic.com/legal/data-processing-addendum" },
    ],
    faq: [
      { q: "¿Y si Anthropic cambia sus condiciones?", a: "Sería un cambio de condiciones de un subencargado: te lo comunicaríamos y podrías oponerte. Elegir un proveedor con condiciones comerciales de no entrenamiento es precisamente lo que permite dar esta garantía." },
      { q: "¿Los avisos y textos también pasan por IA?", a: "No. Los avisos usan las plantillas del despacho; el asistente de ayuda del gestor responde sobre el producto, sin acceso a los expedientes." },
    ],
  },
  {
    grupo: "garantias", slug: "sin-permanencia",
    tarjeta: "Sin permanencia",
    titulo: "Sin permanencia: cancelar, exportar, tus datos | Aproba",
    descripcion: "Mes a mes, sin contrato mínimo. Cómo se cancela (desde Ajustes), qué se exporta (expedientes en ZIP, facturas en CSV y ZIP) y qué pasa con los datos después.",
    h1: "Sin permanencia: cómo te vas, qué te llevas y qué pasa con tus datos",
    entradilla: "Si Aproba no te ahorra tiempo, te vas. Sin llamadas, sin preaviso de tres meses, con tus datos. Estos son los pasos y lo que puedes exportar.",
    actualizado: "2026-09-13",
    significa: [
      { t: "ul", items: [
        "**Mes a mes.** La suscripción se renueva cada mes (o cada año, si elegiste el pago anual) y se cancela desde Ajustes › Plan; sigues teniendo acceso hasta el final del periodo pagado.",
        "**Sin tarjeta para probar.** Los 15 días de prueba no piden tarjeta: si no contratas, la cuenta simplemente deja de estar activa.",
        "**Sin penalización ni permanencia.** No hay contrato mínimo ni cuota de salida. En el pago anual, sigues teniendo acceso hasta el final del año pagado; las cuotas ya abonadas no se devuelven (Términos).",
      ] },
      { t: "tabla", titulo: "Qué te llevas", encabezados: ["Qué", "Formato", "Desde dónde"], filas: [
        ["Cada expediente: documentos, formularios generados, hoja de encargo", "ZIP", "Botón «Exportar» en la ficha del expediente"],
        ["Facturas", "CSV (Excel) y ZIP de PDF", "Pestaña Facturas › exportar"],
        ["Memoria de actividad (recuento por trámites, sin datos personales)", "PDF", "Inicio › Memoria de actividad"],
        ["Lista de clientes", "CSV", "A petición a hola@aproba-software.com, en 48 h laborables"],
      ] },
    ],
    afirmamos: [
      { t: "ul", items: [
        "**La cancelación no pasa por una persona.** Es un botón en Ajustes › Plan que abre el portal de facturación; nadie te llama para retenerte.",
        "**Lo que exportas es lo que hay.** Los ZIP contienen los archivos originales que subió el cliente y los PDF generados, no una versión reducida.",
        "**Después de la baja, los Términos mandan.** Los datos se conservan bloqueados durante los plazos de prescripción legal (facturación hasta 6 años) y se suprimen después; los datos de los clientes del despacho se devuelven o se suprimen según sus instrucciones, como fija el DPA.",
      ] },
    ],
    limites: [
      { t: "ul", items: [
        "**No hay exportación «de todo en un clic»** todavía: se exporta por expediente y por lote de facturas. Para una cartera grande, pídenos el volcado y lo preparamos.",
        "**El pago anual no se reembolsa**: al cancelar conservas el acceso hasta el final del periodo pagado, sin nuevos cargos.",
      ] },
    ],
    faq: [
      { q: "¿Puedo volver después de irme?", a: "Sí. Mientras los datos estén en el plazo de conservación, la cuenta se reactiva con todo; después, se empieza de cero." },
      { q: "¿Y si solo quiero pausar?", a: "Cancela y vuelve cuando quieras; no hay coste de reactivación." },
      { q: "¿Los clientes finales pierden su portal?", a: "Al cancelar, los enlaces del portal dejan de funcionar al terminar el periodo pagado. Conviene avisar a los clientes con expedientes abiertos." },
    ],
  },
];

export const getBeneficio = (grupo: Grupo, slug: string): Beneficio | undefined => BENEFICIOS.find((b) => b.grupo === grupo && b.slug === slug);
export const beneficiosDe = (grupo: Grupo): Beneficio[] => BENEFICIOS.filter((b) => b.grupo === grupo);
// Ruta de una tarjeta de la portada a partir de su texto (fuente única: si el texto de
// la tarjeta cambia sin cambiar aquí, el test lo detecta).
export const rutaDeTarjeta = (tarjeta: string): string => {
  const b = BENEFICIOS.find((x) => x.tarjeta === tarjeta);
  if (!b) throw new Error(`Sin página para la tarjeta «${tarjeta}»`);
  return rutaDe(b);
};
