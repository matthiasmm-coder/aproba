import type { Bloque } from "@/lib/articulos";

// PÁGINAS PÚBLICAS DE CATEGORÍA (SEO, plan del 12/09/2026) — la landing vende; estas
// páginas NOMBRAN: «software de extranjería», cada función, cada público, el precio.
// Mismo principio que los artículos: el contenido vive en código, pasa por git y usa el
// motor de bloques (tabla, esquema, datos, faq…) para que las figuras sigan el estándar.
//
// ⚠️ REGLA: lo que se afirma aquí tiene que ser verdad HOY en el producto (no en la
// hoja de ruta). Las cifras del sector llevan su fuente en el artículo enlazado.

export type PaginaPublica = {
  ruta: string;             // «/software-de-extranjeria» — también es la canónica
  titulo: string;           // <title> completo, ≤ 65 caracteres, sin sufijo
  descripcion: string;      // meta description, ≤ 160 caracteres
  etiqueta: string;         // kicker sobre el h1 («Guía», «Función», «Precios»…)
  h1: string;
  entradilla: string;
  actualizado: string;      // ISO — lastmod del sitemap y dateModified
  migas: { nombre: string; ruta: string }[];
  bloques: Bloque[];
  cta?: { titulo: string; texto: string };
  relacionadas?: string[];  // rutas de otras páginas públicas (enlazado interno)
};

// LA frase de definición: idéntica en la landing, en «Qué es Aproba», en llms.txt y en
// los datos estructurados. Un buscador (o un modelo) que la lea tres veces igual sabe
// qué categoría somos.
export const FRASE_DEFINICION =
  "Aproba es un software de extranjería para gestorías y abogados: recoge y valida con IA los documentos del cliente, genera los formularios EX y las tasas 790, sigue cada expediente y avisa de cada renovación.";

export const PRECIOS = {
  starter: { mes: 79, anual: 790, expedientes: 20, usuarios: 1 },
  pro: { mes: 149, anual: 1490, expedientes: 50, usuarios: 5 },
  business: { mes: 299, anual: 2990, oficinas: 2, oficinaExtra: 50 },
  expedienteExtra: 3,
  despegueDesde: 690,
  pruebaDias: 15,
} as const;

const faqComun: { q: string; a: string }[] = [
  { q: "¿Aproba presenta el expediente por mí?", a: "No. Aproba prepara el expediente completo (documentos validados, formularios EX y tasas rellenados, hoja de encargo y mandato firmados) y tú lo presentas en Mercurio o en la sede electrónica como siempre, con tu certificado. La presentación sigue siendo un acto del profesional." },
  { q: "¿Sirve para un despacho de una sola persona?", a: "Sí. El plan Starter (79 €/mes, 20 expedientes al mes) está pensado para autónomos. La cuenta se configura en diez minutos y no hace falta ningún informático." },
  { q: "¿Dónde se guardan los datos de mis clientes?", a: "En servidores de la Unión Europea, cifrados. Los documentos nunca se usan para entrenar modelos de IA. Firmamos el contrato de encargado del tratamiento (DPA) y la lista de subencargados es pública." },
  { q: "¿Puedo probarlo antes de pagar?", a: `Sí: ${PRECIOS.pruebaDias} días gratis, sin tarjeta, con un expediente de ejemplo ya resuelto para que veas el flujo completo desde el primer minuto.` },
];

export const PAGINAS: PaginaPublica[] = [
  // ── CASO REAL (20/09/2026) ────────────────────────────────────────
  // El despacho NO se nombra: se nombrará cuando dé su autorización (decisión de
  // Matthias, 20/09). Todas las cifras salen de su propia cuenta, medidas el 20/09/2026.
  // ⚠️ Se publica el NÚMERO de facturas, no su importe: la facturación es dato de negocio
  // del despacho, no nuestro. Si algún día se añade, que sea con su permiso expreso.
  {
    ruta: "/caso-real",
    titulo: "Un despacho real con Aproba: 105 expedientes en 12 semanas",
    descripcion: "Cifras medidas en la cuenta de un despacho de extranjería que paga Aproba desde junio de 2026: expedientes, documentos, formularios y avisos. Con el método.",
    etiqueta: "Caso real",
    h1: "Qué hace un despacho real con Aproba en doce semanas",
    entradilla: "No es una estimación ni un testimonio: son las cifras de la cuenta de un despacho de extranjería español que paga Aproba desde el 29 de junio de 2026, medidas el 20 de septiembre. El despacho no se nombra todavía — lo haremos cuando nos autorice a hacerlo.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Caso real", ruta: "/caso-real" }],
    bloques: [
      { t: "datos", items: [
        { valor: "105", etiqueta: "expedientes abiertos en 12 semanas" },
        { valor: "177", etiqueta: "documentos subidos por sus clientes desde el portal" },
        { valor: "83", etiqueta: "formularios oficiales generados" },
        { valor: "42", etiqueta: "facturas emitidas desde el expediente" },
      ] },
      { t: "p", texto: "Un despacho de extranjería abrió su cuenta el **29 de junio de 2026** y paga desde el primer día. Lo que sigue es lo que su equipo ha hecho con Aproba en doce semanas, contado desde su propia cuenta. Ningún número está redondeado ni proyectado." },
      { t: "h2", texto: "Las cifras, una a una" },
      { t: "tabla", titulo: "Medido el 20 de septiembre de 2026", encabezados: ["Qué", "Cuánto", "Qué significa"], filas: [
        ["Expedientes abiertos", "105", "Trámites reales de sus clientes, no pruebas"],
        ["Clientes en su fichero", "124", "Ficha con sus datos personales, reutilizable en cada trámite"],
        ["Documentos subidos por el cliente", "177", "Desde el portal, con el móvil; el despacho no subió ninguno"],
        ["Documentos validados por la IA", "120", "Tipo reconocido, caducidad leída, datos extraídos a la ficha"],
        ["Formularios oficiales generados", "83", "Modelos EX y tasas 790 rellenados con los datos del expediente"],
        ["Avisos enviados a sus clientes", "585", "Automáticos, en el idioma de cada cliente"],
        ["Facturas emitidas", "42", "Desde el propio expediente, con sus suplidos"],
        ["Caducidades vigiladas", "27", "TIE, pasaportes y NIE con su fecha, para proponer la renovación"],
      ], nota: "Fuente: la cuenta del despacho. Cada cifra es un recuento directo, sin muestreo." },
      { t: "h2", texto: "Dos números que dicen más que el resto" },
      { t: "p", texto: "**177 documentos subidos por sus clientes, cero por el despacho.** Es la diferencia entre perseguir papeles por WhatsApp y recibirlos clasificados: el cliente abre su enlace, ve la lista exacta de su trámite y hace las fotos con el teléfono. El registro de cada expediente dice quién subió cada documento; en este despacho, siempre el cliente." },
      { t: "p", texto: "**56 días distintos con expedientes nuevos**, entre el 29 de junio y el 20 de septiembre. De los 60 días laborables del período, se abrió trabajo nuevo en 42 — siete de cada diez —, y en otros catorce fines de semana o festivos. No es una cuenta que se probó una semana y se dejó." },
      { t: "h2", texto: "El portal, en seis idiomas" },
      { t: "barras", titulo: "Idioma elegido por sus 124 clientes", unidad: "clientes", items: [
        { etiqueta: "Español", valor: 96 },
        { etiqueta: "Inglés", valor: 19, destacado: true },
        { etiqueta: "Alemán", valor: 3 },
        { etiqueta: "Francés", valor: 3 },
        { etiqueta: "Italiano", valor: 2 },
        { etiqueta: "Chino", valor: 1 },
      ], nota: "Uno de cada cuatro clientes de este despacho no hace su trámite en español." },
      { t: "h2", texto: "Lo que estas cifras no dicen" },
      { t: "ul", items: [
        "**Es un despacho, no una muestra.** Doce semanas de una sola cuenta no permiten afirmar «los despachos ahorran X horas». Cuando tengamos más cuentas con recorrido, se publicarán igual: medidas, no estimadas.",
        "**No medimos su tiempo.** Aproba cuenta lo que pasa dentro de la aplicación; las horas que se ahorra un equipo no se pueden leer desde aquí. Cualquiera que te dé esa cifra sin haberte cronometrado se la está inventando.",
        "**No publicamos su facturación.** Las 42 facturas son suyas y su importe también: es dato de negocio del despacho, no nuestro.",
        "**Presenta el despacho, no Aproba.** Los 83 formularios salen rellenados y editables; la presentación en Mercurio o en la sede es un acto del profesional, con su certificado.",
      ] },
      { t: "nota", titulo: "Por qué no aparece el nombre", texto: "Porque todavía no nos ha autorizado a darlo. Preferimos publicar cifras verificables de un despacho anónimo que un testimonio inventado con nombre y apellidos — algo bastante común en este sector." },
      { t: "faq", items: [
        { q: "¿Se puede comprobar?", a: "Las cifras salen de la cuenta del despacho y se pueden volver a contar en cualquier momento; la fecha de medición está arriba. Cuando el despacho autorice su nombre, lo añadiremos aquí con su valoración." },
        { q: "¿Es el único cliente?", a: "No, pero sí el de más recorrido: paga desde el 29 de junio de 2026. Los demás llevan menos tiempo y sus cifras aún dirían poco." },
        { q: "¿Cuánto tardó en ponerse en marcha?", a: "Abrió expedientes el mismo día del alta. Si prefieres empezar con tus clientes ya migrados y tu equipo formado, eso es [Despegue](/despegue)." },
        { q: "¿Qué plan usa?", a: "Pro. Los planes y lo que incluye cada uno están en [precios](/precios)." },
      ] },
    ],
    cta: { titulo: "Ábrete una cuenta y mide la tuya", texto: "15 días gratis, sin tarjeta. Tu cuenta lleva el mismo registro: cada documento, cada formulario y cada aviso quedan contados." },
    relacionadas: ["/software-de-extranjeria", "/precios", "/despegue", "/para/gestorias"],
  },
  // ── PÁGINA PILAR ──────────────────────────────────────────────────────────
  {
    ruta: "/software-de-extranjeria",
    titulo: "Software de extranjería para gestorías y abogados | Aproba",
    descripcion: "Qué debe hacer un software de extranjería en 2026: documentos, formularios EX, tasas 790, seguimiento, renovaciones y facturación. Guía práctica para despachos.",
    etiqueta: "Guía",
    h1: "Software de extranjería: qué es y qué debe hacer por tu despacho",
    entradilla: "Un expediente de extranjería son documentos que llegan mal, formularios que se teclean a mano y plazos que nadie vigila. Esto es lo que un software especializado tiene que resolver, punto por punto, y cómo lo hace Aproba.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Software de extranjería", ruta: "/software-de-extranjeria" }],
    bloques: [
      { t: "p", texto: "Un **software de extranjería** es una herramienta de gestión pensada para el trabajo real de un despacho que tramita permisos de residencia, renovaciones, arraigos, reagrupaciones y nacionalidades: recoger la documentación del cliente, comprobar que sirve, rellenar los formularios oficiales, seguir el estado de cada expediente y no dejar pasar una caducidad. No es un CRM genérico con una etiqueta «extranjería», ni un gestor documental: conoce los modelos EX, las tasas 790 y los plazos de la Ley 39/2015." },
      { t: "p", texto: `${FRASE_DEFINICION} Esta página explica qué debe hacer un software así, con qué criterio elegirlo y qué hace Aproba en cada punto.` },
      { t: "datos", items: [
        { valor: "27", etiqueta: "modelos EX generados desde el expediente" },
        { valor: "5", etiqueta: "tasas 790 (006, 012, 026, 052 y 062) con los datos del cliente" },
        { valor: "8", etiqueta: "idiomas del portal del cliente, árabe incluido" },
        { valor: "15 días", etiqueta: "de prueba gratuita, sin tarjeta" },
      ] },

      { t: "h2", texto: "El problema que tiene que resolver" },
      { t: "p", texto: "En un despacho de extranjería el tiempo no se va en el derecho: se va en la logística. Documentos que llegan por WhatsApp, borrosos o caducados, y hay que pedir dos y tres veces. Formularios EX que se rellenan campo a campo, con los mismos datos que ya están en la ficha del cliente. Clientes que llaman para saber cómo va lo suyo. Y una tarjeta que caduca sin que nadie lo tenga apuntado, hasta que el cliente vuelve —o no vuelve— con el plazo pasado." },
      { t: "p", texto: "Cada uno de esos puntos es una tarea repetitiva, y las tareas repetitivas se automatizan. Lo que distingue a un software de extranjería de un programa de gestión general es que trae esa automatización ya hecha para este trabajo concreto: sabe qué documentos exige un arraigo social, qué modelo EX corresponde a una renovación de residencia temporal y qué tasa hay que pagar en cada caso." },

      { t: "h2", texto: "Ocho cosas que debe hacer un software de extranjería" },
      { t: "p", texto: "Esta lista sirve para evaluar cualquier herramienta, incluida la nuestra. Si un programa no hace alguna de estas ocho cosas, la seguirá haciendo una persona del despacho, a mano." },
      { t: "ol", items: [
        "**Recoger los documentos sin perseguir al cliente.** Un enlace que el cliente abre en el móvil, ve la lista de lo que falta para su trámite y sube las fotos. En su idioma: la mayoría de los clientes de extranjería no leen bien el español, y los formularios menos aún.",
        "**Validar cada documento en el momento.** Leer el pasaporte, el NIE, el padrón o el contrato; extraer los datos; detectar lo caducado, lo ilegible o lo que no corresponde al trámite antes de que el expediente llegue a tu mesa.",
        "**Generar los formularios oficiales.** Los modelos EX y las tasas 790 se rellenan con los datos del expediente, sin teclear y sin erratas, y quedan editables por si hay que corregir un detalle.",
        "**Seguir el expediente por estados.** Qué falta, qué está listo, qué se ha presentado, qué se ha resuelto. Con todo el equipo viendo lo mismo, no cada uno su Excel.",
        "**Avisar al cliente sin que llame.** Cada avance (documento recibido, validado, presentado, resuelto) genera un aviso automático en el idioma del cliente.",
        "**Vigilar las renovaciones.** Cada TIE, pasaporte y NIE con su fecha; un aviso con antelación; y la renovación iniciada con un clic reutilizando el expediente anterior. Es donde se decide si el cliente vuelve a ti o a otro.",
        "**Facturar el trámite tal como se cobra.** Anticipo y resto, suplidos (las tasas) sin IVA, descuentos, familias con varios miembros, empresas que pagan por su trabajador.",
        "**Cumplir con los datos.** Servidores en la UE, cifrado, contrato de encargado del tratamiento y la garantía de que los documentos no entrenan ningún modelo.",
      ] },

      { t: "h2", texto: "Cómo se trabaja con Aproba" },
      { t: "p", texto: "El flujo tiene cinco pasos y el gestor solo interviene en dos: revisar y presentar. Todo lo demás lo hace el cliente desde su móvil o lo hace el software." },
      { t: "esquema", titulo: "El recorrido de un expediente en Aproba", nodos: [
        { titulo: "Enlace al cliente", texto: "Creas el expediente, eliges el servicio y envías el enlace por WhatsApp o email." },
        { titulo: "El cliente sube todo", texto: "Desde el móvil, en su idioma, con la lista exacta de documentos del trámite.", cifra: "8 idiomas" },
        { titulo: "Validación con IA", texto: "Datos extraídos, ficha rellenada, caducados e ilegibles detectados.", destacado: true },
        { titulo: "Formularios y tasas", texto: "EX y 790 generados en un clic, editables, listos para presentar." },
      ], destino: { titulo: "Presentas, y Aproba sigue", texto: "Estados, avisos al cliente, facturación y, meses después, la renovación propuesta sola." }, nota: "Con un expediente de ejemplo ya resuelto en la cuenta de prueba, el recorrido se ve entero en cinco minutos." },

      { t: "h2", texto: "Qué hace Aproba en cada punto" },
      { t: "tabla", titulo: "Las ocho funciones, una a una", encabezados: ["Tarea", "Sin software", "Con Aproba"], filas: [
        ["Recoger documentos", "WhatsApp, email y papel; se pide varias veces", "Enlace al cliente con la lista del trámite; sube desde el móvil en 8 idiomas ([portal del cliente](/funciones/validacion-con-ia))"],
        ["Validar documentos", "A ojo, cuando se abre el expediente", "IA al subir: datos extraídos, caducados e ilegibles marcados"],
        ["Formularios EX", "A mano, campo a campo", "[27 modelos EX](/funciones/formularios-en-un-clic) generados y editables"],
        ["Tasas 790", "Impreso oficial rellenado a mano", "[790-006, 012, 026, 052 y 062](/cifras/35-formularios-y-tasas-oficiales) con los datos del expediente"],
        ["Seguimiento", "Excel o memoria", "Tablero por estados, compartido por el equipo"],
        ["Avisos al cliente", "Llamadas", "Automáticos en cada paso, en su idioma"],
        ["Renovaciones", "Cuando el cliente se acuerda", "[Vigía](/funciones/radar-de-renovaciones): fecha vigilada, aviso y renovación en un clic"],
        ["Facturación", "Programa aparte, se copia todo", "[Facturas, suplidos y cobros](/funciones/facturas-automaticas) desde el expediente"],
      ], nota: "Las funciones enlazadas tienen su propia página con el detalle." },

      { t: "h2", texto: "Con qué criterio elegir" },
      { t: "p", texto: "Cuatro preguntas separan un software de extranjería de un programa general con buenas intenciones." },
      { t: "ul", items: [
        "**¿Conoce los modelos oficiales?** Pide que te enseñen un EX-17 o un EX-03 generado, y el 790-012 correspondiente. Si la respuesta es «lo puedes adjuntar», rellena a mano.",
        "**¿Habla el idioma del cliente?** El portal del cliente tiene que estar en árabe, rumano o chino, no solo en inglés. Si el cliente no entiende qué le piden, el documento no llega.",
        "**¿Qué pasa con la renovación?** Un expediente terminado no es un expediente cerrado: en un año vuelve. Si el programa no tiene la fecha de caducidad y un aviso, la renovación se la lleva quien la recuerde.",
        "**¿Dónde están los datos?** Región de alojamiento, contrato de encargado firmado, lista de subencargados y compromiso escrito de no usar los documentos para entrenar IA. Un pasaporte es un dato personal de los que importan.",
      ] },

      { t: "h2", texto: "Lo que Aproba no hace (y por qué)" },
      { t: "p", texto: "Aproba no presenta el expediente en Mercurio ni en la sede electrónica: la presentación es un acto del profesional con su certificado y su convenio, y así debe seguir. Tampoco sustituye el criterio jurídico: te dice que un padrón tiene más de tres meses, no si el arraigo procede. Y no es un programa de contabilidad: emite las facturas del trámite y las exporta, y convive con el que ya uses." },
      { t: "p", texto: "Hay una razón para cada límite: el software vale cuando quita el trabajo repetitivo, no cuando intenta hacer el tuyo." },

      { t: "h2", texto: "Por qué 2027 cambia la urgencia" },
      { t: "p", texto: "En 2026 se presentaron 1.174.978 solicitudes de regularización extraordinaria, el 58 % a través de abogados y el 8,4 % a través de gestores administrativos. Las autorizaciones concedidas duran un año: [cerca de 600.000 renovaciones](/articulos/renovaciones-2027-regularizacion-extraordinaria) van a concentrarse a mediados de 2027. Un despacho que tenga cada expediente con su fecha de caducidad repartirá ese trabajo durante meses; uno que no la tenga lo recibirá la misma semana. Es el caso más claro de por qué la vigilancia de renovaciones no es una función accesoria." },

      { t: "h2", texto: "Precio" },
      { t: "p", texto: `Aproba cobra por volumen, no por profesión: Starter ${PRECIOS.starter.mes} €/mes (${PRECIOS.starter.expedientes} expedientes al mes), Pro ${PRECIOS.pro.mes} €/mes (${PRECIOS.pro.expedientes} expedientes, facturación y portal con tu marca) y Business ${PRECIOS.business.mes} €/mes (expedientes ilimitados, ${PRECIOS.business.oficinas} oficinas). Sin permanencia, IVA no incluido. El detalle está en [precios](/precios).` },

      { t: "faq", items: [
        { q: "¿Qué es un software de extranjería?", a: "Es un programa de gestión especializado en los trámites de extranjería de un despacho: recoge y valida los documentos del cliente, genera los formularios EX y las tasas 790, sigue cada expediente por estados, avisa al cliente y vigila las renovaciones. Se diferencia de un CRM general en que conoce los modelos y plazos oficiales." },
        { q: "¿Para quién es Aproba?", a: "Para gestorías administrativas, abogados de extranjería y despachos mixtos en España, desde un autónomo hasta un equipo con varias oficinas. Los clientes finales (los extranjeros) usan el portal en su idioma sin instalar nada." },
        ...faqComun,
        { q: "¿Qué formularios genera?", a: "27 modelos EX (autorizaciones iniciales, renovaciones, arraigos, reagrupación, larga duración, tarjeta de familiar…) y las tasas 790-006, 790-012, 790-026, 790-052 y 790-062, rellenados con los datos del expediente y editables." },
      ] },
    ],
    cta: { titulo: "Pruébalo con un expediente real", texto: "Cuenta de prueba de 15 días con un expediente de ejemplo ya resuelto. Sin tarjeta." },
    relacionadas: ["/tramites", "/formularios", "/tasas", "/precios", "/para/gestorias", "/para/abogados"],
  },
  {
    ruta: "/precios",
    titulo: "Precios de Aproba: software de extranjería desde 79 €/mes",
    descripcion: "Starter 79 €, Pro 149 € y Business 299 € al mes, por volumen de expedientes y sin permanencia. Prueba gratis 15 días. Puesta en marcha Despegue desde 690 €.",
    etiqueta: "Precios",
    h1: "Precios: por volumen de expedientes, no por profesión",
    entradilla: "Tres planes según cuántos expedientes abres al mes. Mismo producto para gestorías y abogados, sin permanencia, con 15 días de prueba sin tarjeta.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Precios", ruta: "/precios" }],
    bloques: [
      { t: "tabla", titulo: "Planes (IVA no incluido)", encabezados: ["", "Starter", "Pro", "Business"], filas: [
        ["Precio mensual", `**${PRECIOS.starter.mes} €**`, `**${PRECIOS.pro.mes} €**`, `**${PRECIOS.business.mes} €**`],
        ["Precio anual (2 meses gratis)", `${PRECIOS.starter.anual.toLocaleString("es-ES")} €`, `${PRECIOS.pro.anual.toLocaleString("es-ES")} €`, `${PRECIOS.business.anual.toLocaleString("es-ES")} €`],
        ["Expedientes al mes", `${PRECIOS.starter.expedientes}`, `${PRECIOS.pro.expedientes}`, "Ilimitados"],
        ["Expediente adicional", `${PRECIOS.expedienteExtra} €`, `${PRECIOS.expedienteExtra} €`, "—"],
        ["Usuarios", `${PRECIOS.starter.usuarios}`, `Hasta ${PRECIOS.pro.usuarios}`, "Ilimitados"],
        ["Oficinas", "1", "1", `${PRECIOS.business.oficinas} incluidas · +${PRECIOS.business.oficinaExtra} €/mes cada una más`],
        ["Portal del cliente (8 idiomas)", "Sí", "Sí, con tu marca", "Sí, con tu marca"],
        ["Validación IA y formularios EX + tasas 790", "Sí", "Sí", "Sí"],
        ["Avisos automáticos al cliente", "Sí", "Sí", "Sí"],
        ["Vigía (renovaciones)", "Sí", "Sí", "Sí"],
        ["Facturación, suplidos y cobro por tarjeta", "—", "Sí", "Sí"],
        ["Soporte", "Email", "Email", "Prioritario"],
      ], nota: "Los precios se aplican desde el 4 de septiembre de 2026. Los despachos que se dieron de alta antes conservan su tarifa." },
      { t: "p", texto: "Un expediente cuenta cuando se crea. Si un mes abres más de los incluidos, se cobran los adicionales a 3 € cada uno al final del mes; nunca se bloquea el trabajo. El plan se puede cambiar en cualquier momento desde Ajustes." },

      { t: "h2", texto: "Qué incluye cada plan" },
      { t: "h3", texto: "Starter — para autónomos" },
      { t: "p", texto: "Todo el flujo del expediente para una persona: el cliente rellena sus datos y sube documentos desde el móvil, la IA los valida, los formularios EX y las tasas 790 se generan solos, los avisos salen automáticamente y Vigía vigila las renovaciones. 20 expedientes al mes." },
      { t: "h3", texto: "Pro — para equipos en crecimiento" },
      { t: "p", texto: "Lo de Starter para hasta cinco usuarios y 50 expedientes al mes, más la facturación integrada (facturas y suplidos automáticos desde el expediente), el portal del cliente con la marca del despacho y el cobro por tarjeta opcional a tus clientes." },
      { t: "h3", texto: "Business — equipos grandes y multi-oficina" },
      { t: "p", texto: "Expedientes y usuarios ilimitados, dos oficinas incluidas con configuración propia (servicios, tarifas, avisos y datos de facturación por sede) y soporte prioritario. Cada oficina adicional, 50 €/mes." },

      { t: "h2", texto: "Despegue: puesta en marcha con tu equipo" },
      { t: "p", texto: `Si prefieres empezar con la cuenta configurada, tus clientes y expedientes en curso migrados y tu equipo formado sobre casos reales, el servicio [Despegue](/despegue) lo hace en unos días, desde ${PRECIOS.despegueDesde} € según el tamaño del equipo, con acompañamiento prioritario las primeras semanas.` },

      { t: "h2", texto: "Lo que no cambia con el plan" },
      { t: "ul", items: [
        "**Sin permanencia.** Mes a mes; exportas todo a Excel cuando quieras.",
        "**Datos en la UE**, cifrados, con contrato de encargado del tratamiento y lista pública de subencargados.",
        "**Los documentos de tus clientes no entrenan IA.**",
        "**Prueba de 15 días sin tarjeta**, con un expediente de ejemplo resuelto para ver el flujo entero.",
      ] },

      { t: "faq", items: [
        { q: "¿Hay coste por cliente final o por usuario del portal?", a: "No. Los clientes finales usan el portal sin límite y sin coste. Solo cuentan los expedientes que creas y, en Starter y Pro, el número de usuarios del despacho." },
        { q: "¿Qué pasa si supero los expedientes del plan?", a: "Se cobran los adicionales a 3 € cada uno al final del mes. No se bloquea nada. Si pasa a menudo, el siguiente plan sale más a cuenta y puedes cambiar cuando quieras." },
        { q: "¿El IVA está incluido?", a: "No. Los precios son sin IVA; la factura de Aproba lleva el 21 % y es deducible para el despacho." },
        { q: "¿Puedo pagar por año?", a: "Sí. El pago anual equivale a diez meses: 790 €, 1.490 € y 2.990 € respectivamente." },
        { q: "¿Y si no me convence?", a: "Te vas cuando quieras: no hay permanencia y exportas los datos. En la prueba de 15 días no se pide tarjeta." },
      ] },
    ],
    cta: { titulo: "Empieza con 15 días gratis", texto: "Sin tarjeta. Entras con un expediente de ejemplo ya resuelto." },
    relacionadas: ["/software-de-extranjeria", "/despegue", "/para/gestorias", "/para/abogados"],
  },
  {
    ruta: "/para/gestorias",
    titulo: "Software de extranjería para gestorías administrativas",
    descripcion: "Más expedientes de extranjería con el mismo equipo: documentos validados con IA, EX y tasas 790 automáticos, suplidos en la factura y renovaciones vigiladas.",
    etiqueta: "Para gestorías",
    h1: "Software de extranjería para gestorías administrativas",
    entradilla: "En una gestoría, extranjería compite por el tiempo con laboral, fiscal y vehículos. Aproba quita de en medio la parte repetitiva del expediente para que el mismo equipo lleve más trámites sin que se le escape una fecha.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Para gestorías", ruta: "/para/gestorias" }],
    bloques: [
      { t: "p", texto: "Una gestoría administrativa tramita extranjería con dos particularidades: el volumen (muchos expedientes parecidos, muchas renovaciones) y el equipo (varias personas tocan el mismo expediente, a veces en varias oficinas). El software tiene que servir para las dos cosas: repetir bien lo repetitivo y que todo el mundo vea lo mismo." },
      { t: "h2", texto: "Lo que cambia en el día a día" },
      { t: "ul", items: [
        "**El cliente trae los documentos él solo.** Un enlace, la lista de su trámite, fotos desde el móvil en su idioma. Si algo está caducado o borroso, la IA lo dice antes de que llegue a tu mesa. Los documentos que siguen llegando por email se reenvían a la dirección de recepción del despacho y entran solos en el expediente.",
        "**Los EX y las tasas salen del expediente.** Los [27 modelos EX](/funciones/formularios-en-un-clic) y las [tasas 790](/cifras/35-formularios-y-tasas-oficiales) se generan con los datos ya validados. La misma ficha del cliente sirve para su renovación del año siguiente.",
        "**La factura refleja cómo cobra una gestoría.** Anticipo y resto, [suplidos sin IVA](/funciones/facturas-automaticas) para las tasas, descuentos, familias con varios miembros, empresas que pagan por su trabajador. Cobro por tarjeta si quieres, sin que el dinero pase por Aproba.",
        "**Las renovaciones no se pierden.** [Vigía](/funciones/radar-de-renovaciones) tiene cada TIE, pasaporte y NIE con su fecha, avisa con antelación y propone la renovación al cliente con un botón para aceptarla.",
        "**Varias oficinas, una cuenta.** Con multi-oficina, cada sede tiene sus servicios, tarifas, avisos y datos de facturación, y los administradores ven el conjunto.",
      ] },
      { t: "h2", texto: "Números que se pueden pedir" },
      { t: "datos", items: [
        { valor: "3 h → 30 min", etiqueta: "por expediente, con el cliente subiendo sus documentos y los EX generados" },
        { valor: "25 + 3", etiqueta: "modelos EX y tasas 790 generados desde el expediente" },
        { valor: "8", etiqueta: "idiomas del portal: árabe, rumano y chino incluidos" },
      ] },
      { t: "h2", texto: "Cómo empezar sin parar la gestoría" },
      { t: "p", texto: "La cuenta se crea en diez minutos y los clientes y expedientes en curso se importan desde tu Excel o tu programa actual con un mapeo asistido. Si prefieres que lo hagamos nosotros con tu equipo, el servicio [Despegue](/despegue) configura la cuenta, migra los datos y forma al equipo sobre vuestros casos reales." },
      { t: "h2", texto: "Sobre el convenio y la presentación" },
      { t: "p", texto: "Aproba no presenta por ti: preparas el expediente completo y lo presentas en Mercurio por la puerta de Gestoría con tu certificado, como siempre. Conviene saber que los convenios de gestores administrativos y graduados sociales con el Ministerio [vencen el 11 de julio de 2027](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias) y que el campo «domicilio a efectos de notificaciones» del EX decide quién recibe la notificación; los formularios que genera Aproba lo llevan a la vista." },
      { t: "faq", items: [
        { q: "¿Sirve si llevamos laboral y fiscal con otro programa?", a: "Sí. Aproba es específico de extranjería y convive con A3, Holded o el programa de contabilidad que uses. Las facturas se exportan." },
        { q: "¿Cuántas personas pueden usarlo?", a: "Starter, una; Pro, hasta cinco; Business, sin límite y con varias oficinas. Los roles separan lo que ve un administrador de lo que ve un tramitador." },
        ...faqComun.slice(0, 1),
        ...faqComun.slice(3),
      ] },
    ],
    cta: { titulo: "Importa tu lista y mira tu calendario de renovaciones", texto: "15 días gratis, sin tarjeta. Tus expedientes en curso, importados desde Excel." },
    relacionadas: ["/software-de-extranjeria", "/precios", "/funciones/facturas-automaticas", "/despegue"],
  },
  {
    ruta: "/para/abogados",
    titulo: "Software de extranjería para abogados y despachos jurídicos",
    descripcion: "Para abogados de extranjería: documentos validados con IA, EX y tasas 790 automáticos, hoja de encargo y mandato firmados online, renovaciones vigiladas.",
    etiqueta: "Para abogados",
    h1: "Software de extranjería para abogados",
    entradilla: "El 58 % de las solicitudes de la regularización de 2026 las presentó un abogado. El trabajo jurídico no se automatiza; la recogida de documentos, los formularios y los plazos, sí.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Para abogados", ruta: "/para/abogados" }],
    bloques: [
      { t: "p", texto: "En un despacho de abogados, extranjería tiene una particularidad: cada expediente lleva detrás un criterio (qué vía, qué prueba, qué plazo) y una relación formal con el cliente (hoja de encargo, mandato, honorarios). Aproba no toca lo primero y ordena lo segundo, para que el tiempo del abogado se quede en el caso." },
      { t: "h2", texto: "Lo que se lleva Aproba" },
      { t: "ul", items: [
        "**La documentación.** El cliente recibe un enlace, ve la lista de su trámite y sube los documentos desde el móvil, en su idioma. La IA extrae los datos, rellena la ficha y marca lo caducado o ilegible. Tú abres un expediente ya completo, no una carpeta de fotos.",
        "**La hoja de encargo y el mandato.** Se generan con los datos del expediente y del despacho, y el cliente los firma desde el portal antes de empezar. Con [hoja de encargo](/funciones/validacion-con-ia) y mandato firmados, el expediente arranca con la relación formalizada.",
        "**Los formularios.** [27 modelos EX](/funciones/formularios-en-un-clic) y las [tasas 790-006, 012, 026, 052 y 062](/cifras/35-formularios-y-tasas-oficiales), rellenados y editables. La página 2 del EX (lugar, fecha, firmante) se rellena sobre el propio PDF.",
        "**Los plazos.** [Vigía](/funciones/radar-de-renovaciones) registra las caducidades y propone la renovación al cliente con antelación; el tablero muestra qué se ha presentado y qué está pendiente de resolución.",
        "**Los honorarios.** [Facturas](/funciones/facturas-automaticas) con anticipo y resto, suplidos sin IVA, descuentos y cobro por tarjeta opcional. Cada factura sale del expediente, con el snapshot fiscal del cliente.",
      ] },
      { t: "h2", texto: "Lo que no se lleva" },
      { t: "p", texto: "El criterio. Aproba no decide la vía ni valora la prueba: te dice que un certificado de antecedentes tiene más de tres meses, no si el arraigo procede. Tampoco presenta: el expediente se presenta en Mercurio por la puerta de Abogacía o por la sede electrónica con tu certificado, y las notificaciones llegan donde diga el campo «domicilio a efectos de notificaciones» del EX, que Aproba deja a la vista. Los plazos de la Ley 39/2015 —[silencio administrativo](/articulos/silencio-administrativo-extranjeria-plazos-2026), [10 días de la notificación electrónica](/articulos/notificaciones-electronicas-extranjeria-quien-recibe-10-dias)— siguen siendo tuyos; Aproba te ayuda a no perderlos de vista." },
      { t: "h2", texto: "Por qué ahora" },
      { t: "p", texto: "Las autorizaciones de la regularización extraordinaria duran un año. Si tu despacho presentó expedientes en 2026, en 2027 [vuelven casi todos a la vez](/articulos/renovaciones-2027-regularizacion-extraordinaria). Tener cada uno con su fecha de resolución y su caducidad es la diferencia entre repartir el trabajo y recibirlo la misma semana." },
      { t: "faq", items: [
        { q: "¿Puedo dar acceso a un colaborador solo a sus expedientes?", a: "Sí. Los roles de la cuenta separan administradores y tramitadores, y en Business cada oficina tiene su ámbito." },
        { q: "¿El cliente ve mis honorarios en el portal?", a: "Solo si el servicio tiene tarifa configurada. Si lo marcas «precio a consultar», el cliente no ve importes." },
        ...faqComun.slice(0, 1),
        ...faqComun.slice(2),
      ] },
    ],
    cta: { titulo: "Abre un expediente de prueba", texto: "15 días gratis, sin tarjeta, con un expediente de ejemplo ya resuelto para ver el flujo completo." },
    relacionadas: ["/software-de-extranjeria", "/precios", "/funciones/formularios-en-un-clic", "/funciones/radar-de-renovaciones"],
  },
  {
    ruta: "/despegue",
    titulo: "Aproba Despegue: puesta en marcha de tu despacho en unos días",
    descripcion: "Configuración a medida, migración de clientes y expedientes y formación del equipo sobre casos reales. Desde 690 € según el tamaño del equipo.",
    etiqueta: "Servicio",
    h1: "Despegue: tu cuenta lista, tus datos migrados y tu equipo formado",
    entradilla: "Para despachos que prefieren empezar con todo en marcha el primer día, sin dedicar horas propias a la configuración.",
    actualizado: "2026-09-20",
    migas: [{ nombre: "Despegue", ruta: "/despegue" }],
    bloques: [
      { t: "h2", texto: "Qué incluye" },
      { t: "ul", items: [
        "**Configuración a medida de la cuenta:** servicios y tarifas del despacho, documentos por trámite, textos de los avisos, cobros, hoja de encargo y equipo con sus roles.",
        "**Migración de tus datos:** clientes, familias y expedientes en curso desde tu Excel o tu programa actual, con las caducidades sembradas en Vigía.",
        "**Formación práctica del equipo**, sobre vuestra propia cuenta y vuestros casos reales, no sobre una demo.",
        "**Acompañamiento prioritario** durante las primeras semanas.",
      ] },
      { t: "h2", texto: "Precio" },
      { t: "p", texto: `Desde ${PRECIOS.despegueDesde} €, según el número de personas que hay que formar. Se presupuesta por escrito, con fechas, en menos de 24 horas laborables. El plan de suscripción se contrata aparte ([precios](/precios)).` },
      { t: "faq", items: [
        { q: "¿Cuánto dura?", a: "Depende del volumen de datos y del tamaño del equipo; el presupuesto lleva las fechas por escrito. La formación se hace en remoto, sobre vuestra cuenta." },
        { q: "¿Es obligatorio?", a: "No. La cuenta se puede configurar sola en diez minutos y la importación es autoservicio. Despegue es para quien prefiere delegarlo." },
      ] },
    ],
    cta: { titulo: "Pide presupuesto", texto: "Te respondemos con precio y fechas en menos de 24 horas laborables." },
    relacionadas: ["/precios", "/despegue", "/para/gestorias"],
  },
  {
    ruta: "/que-es-aproba",
    titulo: "Qué es Aproba: software de extranjería hecho en España",
    descripcion: "Aproba es un software de extranjería para gestorías y abogados, desarrollado en España por ExpatfrancesCKNA07 S.L. Qué hace, para quién y con qué garantías.",
    etiqueta: "Sobre Aproba",
    h1: "Qué es Aproba",
    entradilla: FRASE_DEFINICION,
    actualizado: "2026-09-20",
    migas: [{ nombre: "Qué es Aproba", ruta: "/que-es-aproba" }],
    bloques: [
      { t: "h2", texto: "En una frase" },
      { t: "p", texto: FRASE_DEFINICION },
      { t: "h2", texto: "Quién lo hace" },
      { t: "p", texto: "Aproba lo desarrolla y opera **ExpatfrancesCKNA07 S.L.**, sociedad española con sede en Malgrat de Mar (Barcelona), en producción desde 2026. Es un producto especializado: solo extranjería, solo para despachos profesionales en España." },
      { t: "h2", texto: "Qué hace" },
      { t: "ul", items: [
        "[Portal del cliente](/funciones/validacion-con-ia) en 8 idiomas: documentos desde el móvil, validados con IA.",
        "[27 modelos EX](/funciones/formularios-en-un-clic) y [tasas 790](/cifras/35-formularios-y-tasas-oficiales) generados desde el expediente.",
        "Tablero de seguimiento por estados y avisos automáticos al cliente.",
        "[Vigía](/funciones/radar-de-renovaciones): caducidades vigiladas y renovaciones propuestas.",
        "[Facturación](/funciones/facturas-automaticas) con suplidos, descuentos y cobro por tarjeta; multi-oficina; importación desde Excel.",
      ] },
      { t: "h2", texto: "Con qué garantías" },
      { t: "ul", items: [
        "Datos alojados en la Unión Europea, cifrados.",
        "Los documentos de los clientes no se usan para entrenar modelos de IA.",
        "Contrato de encargado del tratamiento (DPA) y [lista pública de subencargados](/legal/dpa).",
        "Sin permanencia; exportación completa de los datos.",
      ] },
      { t: "h2", texto: "Contacto" },
      { t: "p", texto: "hola@aproba-software.com · Aviso legal, privacidad y condiciones en las páginas legales del sitio." },
    ],
    cta: { titulo: "Ver Aproba con un expediente real", texto: "15 días gratis, sin tarjeta." },
    relacionadas: ["/software-de-extranjeria", "/precios", "/articulos"],
  },
];

export const getPagina = (ruta: string): PaginaPublica | undefined => PAGINAS.find((p) => p.ruta === ruta);
export const faqDePagina = (p: PaginaPublica): { q: string; a: string }[] => {
  const b = p.bloques.find((x) => x.t === "faq");
  return b && b.t === "faq" ? b.items : [];
};
export const textoPlanoPagina = (p: PaginaPublica): string =>
  p.bloques.map((b) => {
    if (b.t === "ul" || b.t === "ol") return b.items.join(" ");
    if (b.t === "datos") return b.items.map((d) => `${d.valor} ${d.etiqueta}`).join(" ");
    if (b.t === "tabla") return [b.titulo ?? "", ...b.encabezados, ...b.filas.flat()].join(" ");
    if (b.t === "faq") return b.items.map((x) => `${x.q} ${x.a}`).join(" ");
    if (b.t === "esquema") return [b.titulo, ...b.nodos.map((n) => `${n.titulo} ${n.texto ?? ""}`), b.destino.titulo, b.destino.texto ?? ""].join(" ");
    if (b.t === "nota") return `${b.titulo ?? ""} ${b.texto}`;
    if ("texto" in b) return b.texto;
    return "";
  }).join(" ");
