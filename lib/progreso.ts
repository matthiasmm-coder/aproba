import { labelADocTipo } from "@/lib/tramites";

// CICLO DE VIDA DEL EXPEDIENTE — 5 estados persistidos + progresión DERIVADA.
//
// Por qué (21/08/2026). Medición sobre los 83 expedientes de clientes reales: 29 tenían
// su formulario oficial YA generado mientras su estado decía que no habían llegado ahí,
// y 43 estaban parados en «documentos pendientes» con 23 días de media. La causa no era
// la pereza del gestor: el ciclo era LINEAL (docs → validados → formularios → presentado)
// y exigía que TODOS los documentos estuvieran validados para dejar avanzar, cuando en la
// realidad el despacho rellena el EX en cuanto tiene la identidad del cliente y genera la
// tasa para que la pague mientras reúne el resto. El producto pedía validar un estado del
// mundo antes de dejar trabajar a quien ya estaba trabajando.
//
// REGLA: el estado REFLEJA el avance, no lo guía. Solo se pide un clic para lo que el
// producto NO PUEDE saber (que el despacho ha ido a presentar, que ha llegado la
// resolución, que la tarjeta está entregada). Todo lo demás se calcula aquí, a la lectura,
// desde hechos que YA están en base. Máximo 3 clics por expediente.
//
// Este módulo es PURO: no lee la base, no escribe nada. Recibe hechos, devuelve la
// lectura. Así el board, la ficha, el stepper, el dashboard, los crons y el portal del
// cliente comparten UNA sola definición en vez de deducir cada uno la suya.

// ── Los 5 estados ────────────────────────────────────────────────────────────
export type Estado5 = "EN_PREPARACION" | "PRESENTADO" | "RESUELTO" | "RECHAZADO" | "FINALIZADO";

export const ESTADOS_5: Estado5[] = ["EN_PREPARACION", "PRESENTADO", "RESUELTO", "RECHAZADO", "FINALIZADO"];

// Los 9 valores antiguos siguen VIVOS en el enum de Postgres (un enum no pierde valores)
// y en las filas que aún no ha tocado el remap. Todo lector normaliza: así el despliegue
// del código no depende de que la UPDATE de migración haya corrido ya.
// ⚠️ Esto NO cubre los filtros que corren en SQL (.eq/.in de PostgREST): esos usan .in()
// con los valores legado — ver cron/recordatorios y lib/data/citas.ts.
const LEGADO: Record<string, Estado5> = {
  BORRADOR: "EN_PREPARACION",
  DOCS_PENDIENTES: "EN_PREPARACION",
  DOCS_VALIDADOS: "EN_PREPARACION",
  FORM_GENERADO: "EN_PREPARACION",
  CITA_HUELLAS: "RESUELTO", // la cita deja de ser un estado: es un hecho (fechaCita)
};

export function normalizarEstado(v: string | null | undefined): Estado5 {
  const s = String(v ?? "").toUpperCase();
  if ((ESTADOS_5 as string[]).includes(s)) return s as Estado5;
  return LEGADO[s] ?? "EN_PREPARACION";
}

const RANGO: Record<Estado5, number> = { EN_PREPARACION: 0, PRESENTADO: 1, RESUELTO: 2, RECHAZADO: 2, FINALIZADO: 3 };
export const yaPresentado = (e: Estado5): boolean => RANGO[e] >= 1;

export const ESTADO5_META: Record<Estado5, { label: string; dot: string; pill: string }> = {
  EN_PREPARACION: { label: "En preparación", dot: "bg-amber-500", pill: "bg-amber-100 text-amber-700" },
  PRESENTADO: { label: "Presentado", dot: "bg-indigo-500", pill: "bg-indigo-100 text-indigo-700" },
  RESUELTO: { label: "Resolución favorable", dot: "bg-aproba-600", pill: "bg-aproba-100 text-aproba-700" },
  RECHAZADO: { label: "Denegado", dot: "bg-red-500", pill: "bg-red-100 text-red-700" },
  FINALIZADO: { label: "Finalizado", dot: "bg-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
};

// La píldora de estado de CUALQUIER pantalla pasa por aquí. Sin esto, el tablero
// seguía pintando «Borrador», «Docs validados» o «Formularios listos» —los 9 estados
// viejos— porque leía el valor BRUTO de la base contra el mapa antiguo: la reforma
// estaba en las columnas y en la acción siguiente, pero no en lo que el gestor lee.
export function metaDeEstado(v: string | null | undefined): { label: string; dot: string; pill: string } {
  return ESTADO5_META[normalizarEstado(v)];
}

// ── Los hechos que alimentan el cálculo ──────────────────────────────────────
export type Hechos = {
  estado: string;                 // valor bruto de la base (nuevo o legado)
  serviciosResueltos: number;     // servicios del expediente encontrados en el catálogo
  docsRequeridos: string[];       // labels requeridos (union servicio principal + extras)
  tiposValidados: string[];       // docTipos con al menos un Documento VALIDADO
  docsTotales: number;            // documentos subidos (excluidos encargo/mandato)
  docsValidados: number;
  // Curación de formularios HECHA: [] explícito («ningún modelo aplica») cuenta como
  // hecha — si no, un servicio sin formulario oficial se queda en bucle mudo.
  formulariosCurados: boolean;
  tieneTasa: boolean;
  encargoFirmado: boolean;
  encargoAplica: boolean;
  anticipoPagado: boolean;
  citaPresencial: boolean;
  fechaCita: string | null;
  arrancado: boolean;             // el cliente entró o hay algún documento: el trámite vive
  // MODO MANUAL (22/08): el despacho trabaja el expediente internamente y NUNCA se le
  // pide enviar un enlace — ni aquí, ni en la ficha, ni en los recordatorios. Sin este
  // hecho, un expediente sin portal se quedaba pidiendo «Enviar enlace al cliente»
  // para siempre, que es exactamente lo que NO hay que hacer en ese modo.
  modoManual?: boolean;
  // Validación MANUAL del gestor (un botón en la ficha): declara que Información,
  // Documentos y Formularios están OK. Sube la completitud a 100 % y mete el
  // expediente en «Listo para presentar». Existe porque el producto NO puede saberlo
  // todo: papeles que el cliente trajo en mano, campos que no aplican a ese trámite…
  validadoManual?: boolean;
  // Denominador de «Información»: campos de la ficha del cliente rellenos / total.
  fichaRellenos?: number;
  fichaTotal?: number;
  // Marcador de migración: el estado antiguo YA afirmaba públicamente «docs validados»
  // (forzar_validados). Sin él, 18 clientes reales verían su seguimiento RETROCEDER.
  docsDadosPorValidados?: boolean;
};

export type Progreso = {
  estado: Estado5;
  fase: FaseKey;
  docs: { requeridos: number; recibidos: number; faltan: string[]; completo: boolean };
  hitos: { arrancado: boolean; docs: boolean; formularios: boolean; presentado: boolean; resuelto: boolean; cerrado: boolean };
  accion: { label: string; espera: boolean; clave: AccionClave };
  score: number; // orden dentro de la fase (0-100)
  // Completitud del expediente en % — media de las TRES secciones que el gestor mira
  // antes de presentar: Información (campos de la ficha), Documentos (requeridos
  // validados) y Formularios (generados). `desglose` alimenta el tooltip: un número
  // global sin detalle no dice qué falta.
  completitud: { pct: number; info: number; docs: number; formularios: number; manual: boolean };
};

export type FaseKey = "recepcion" | "preparacion" | "presentacion" | "cierre";
export type AccionClave =
  | "elegir_servicio" | "subir_docs" | "generar_formularios" | "presentar"
  | "esperando_resolucion" | "finalizar" | "cerrado" | "denegado";

// Mismas etiquetas que BOARD_PHASES (lib/types.ts) — si divergen, el tablero y esto
// dirían nombres distintos de la misma fase. Ver allí el aviso del desfase clave/etiqueta.
export const FASES: { key: FaseKey; label: string }[] = [
  { key: "recepcion", label: "Preparación" },
  { key: "preparacion", label: "Listo para presentar" },
  { key: "presentacion", label: "Presentado" },
  { key: "cierre", label: "Resultado" },
];

// ── ¿Están los documentos completos? ─────────────────────────────────────────
// Misma regla EXACTA que la antigua reconciliarProgresoDocs (comparación por docTipo,
// tolerante a dos labels que mapean el mismo tipo), pero como cálculo puro y SIN el
// guard que excluía a las familias — su exclusión es justamente lo que las dejaba
// atascadas en «documentos pendientes» para siempre.
export function docsCompletos(h: Pick<Hechos, "docsRequeridos" | "tiposValidados" | "docsTotales" | "docsValidados">): {
  requeridos: number; recibidos: number; faltan: string[]; completo: boolean;
} {
  const validados = new Set(h.tiposValidados);
  const faltan = h.docsRequeridos.filter((label) => !validados.has(labelADocTipo(label)));
  // Sin requisitos configurados no se puede afirmar «completo» por vacuidad: se cae al
  // criterio de «todo lo subido está validado», y solo si hay algo subido.
  const completo = h.docsRequeridos.length > 0
    ? faltan.length === 0
    : h.docsTotales > 0 && h.docsValidados === h.docsTotales;
  return {
    requeridos: h.docsRequeridos.length,
    recibidos: Math.max(0, h.docsRequeridos.length - faltan.length),
    faltan,
    completo,
  };
}

// ── La lectura completa ──────────────────────────────────────────────────────
export function calcularProgreso(h: Hechos): Progreso {
  const estado = normalizarEstado(h.estado);
  const docs = docsCompletos(h);
  const post = yaPresentado(estado);

  // HITOS MONOTONES. Un expediente presentado ha pasado por todo lo anterior, y un
  // expediente cuyo estado antiguo ya afirmaba «validado» no puede des-afirmarlo: el
  // cliente vio ese hito marcado en su seguimiento. Retroceder sería mentirle al revés.
  const hitoDocs = docs.completo || Boolean(h.docsDadosPorValidados) || post;
  const hitoForm = h.formulariosCurados || h.tieneTasa || post;

  const hitos = {
    arrancado: h.arrancado || docs.recibidos > 0 || hitoForm || post,
    docs: hitoDocs,
    formularios: hitoForm,
    presentado: post,
    resuelto: estado === "RESUELTO" || estado === "FINALIZADO",
    cerrado: estado === "FINALIZADO",
  };

  const completitud = completitudDe(h, docs, hitoForm, post);
  // La validación manual también EMPUJA de fase: es su sentido — «esto ya está listo».
  return {
    estado,
    fase: faseDe(estado, hitoDocs || Boolean(h.validadoManual), hitoForm),
    docs, hitos,
    accion: accionSiguiente(h, estado, docs, hitoForm),
    score: scoreDe(estado, docs, hitoForm, h),
    completitud,
  };
}

// La frontera Recepción/Preparación ya no puede ser una pertenencia de estado (los cuatro
// estados antiguos se fusionaron): se deriva del avance real.
export function faseDe(estado: Estado5, hitoDocs: boolean, hitoForm: boolean): FaseKey {
  if (estado === "FINALIZADO") return "cierre";
  if (estado === "PRESENTADO" || estado === "RESUELTO" || estado === "RECHAZADO") return "presentacion";
  return hitoDocs || hitoForm ? "preparacion" : "recepcion";
}

// Qué toca hacer ahora. `espera: true` = la pelota no está en el tejado del despacho.
function accionSiguiente(h: Hechos, estado: Estado5, docs: ReturnType<typeof docsCompletos>, hitoForm: boolean): Progreso["accion"] {
  if (estado === "FINALIZADO") return { label: "Expediente cerrado", espera: true, clave: "cerrado" };
  if (estado === "RECHAZADO") return { label: "Expediente denegado", espera: true, clave: "denegado" };
  if (estado === "RESUELTO") {
    // La cita es un HECHO del expediente resuelto, no una etapa (medición 22/08: en 79
    // expedientes reales nadie recorrió la cola del ciclo — cada parada declarativa de
    // más era una razón para no llegar al final). La única acción tras la resolución es
    // cerrar cuando la tarjeta está entregada; agendar/editar la cita queda a mano en la
    // ficha como gesto secundario.
    return { label: "Finalizar trámite", espera: false, clave: "finalizar" };
  }
  if (estado === "PRESENTADO") return { label: "Esperando resolución", espera: true, clave: "esperando_resolucion" };

  // MODO MANUAL: nunca se pide el enlace. Lo que toca es aportar los documentos uno
  // mismo (o preparar ya, si el servicio no exige ninguno).
  if (h.modoManual) {
    if (!hitoForm && docs.faltan.length > 0 && h.docsTotales === 0) {
      return { label: "Subir los documentos", espera: false, clave: "subir_docs" };
    }
    if (!hitoForm) return { label: "Generar formularios", espera: false, clave: "generar_formularios" };
    return { label: "Presentar en Mercurio", espera: false, clave: "presentar" };
  }

  // EN_PREPARACION: el orden importa. Sin servicio resuelto no hay documentos que pedir
  // — decir «esperando documentos» ahí sería mentir sobre quién bloquea.
  if (h.serviciosResueltos === 0) return { label: "Enviar enlace al cliente", espera: false, clave: "elegir_servicio" };
  // Nada ha llegado todavía: la pelota está en el DESPACHO (mandar el enlace), no en el
  // cliente. Decir «esperando documentos» de un expediente que nunca arrancó culpa al
  // cliente de un silencio que nadie le ha pedido romper.
  // Estrecho a propósito: NADA ha pasado (ni entrada del cliente, ni un solo documento
  // subido, ni formularios/tasa). En cuanto hay cualquier avance, la lectura normal manda.
  if (!h.arrancado && !hitoForm && h.docsTotales === 0 && docs.recibidos === 0) {
    return { label: "Enviar enlace al cliente", espera: false, clave: "elegir_servicio" };
  }
  // «Esperando documentos» YA NO es una acción (22/08). Lo era, y contradecía a la ficha
  // sobre el mismo expediente: la tarjeta decía «espera al cliente» mientras la ficha
  // decía «Generar formularios». La regla única: la línea de acción nombra SIEMPRE el
  // siguiente gesto del gestor (los papeles que faltan nunca impiden preparar — es lo
  // que hacen los despachos reales); quién debe qué se lee en los HECHOS: la barra
  // recibidos/requeridos y el botón «Recordar», que sale de docs.faltan, no de aquí.
  // El gris de espera queda solo donde el gestor no puede hacer nada: tras presentar.
  if (!hitoForm) return { label: "Generar formularios", espera: false, clave: "generar_formularios" };
  return { label: "Presentar en Mercurio", espera: false, clave: "presentar" };
}

// ── Completitud (0-100) ──────────────────────────────────────────────────────
// Media simple de tres partes iguales. Nada de ponderaciones invisibles: el gestor
// tiene que poder mirar el número y reconstruir de dónde sale.
//  · Información  → campos rellenos / total de la ficha del cliente
//  · Documentos   → requeridos validados / requeridos (sin requisitos: 1 si hay algo
//                   subido y todo validado, si no 0 — nunca «completo por vacío»)
//  · Formularios  → 1 si hay modelos o tasa generados, 0 si no
// Presentado o validado a mano ⇒ 100 %: el trabajo previo ya está hecho, y seguir
// enseñando «67 %» sobre un expediente depositado sería mentir al revés.
function completitudDe(h: Hechos, docs: ReturnType<typeof docsCompletos>, hitoForm: boolean, post: boolean): Progreso["completitud"] {
  const manual = Boolean(h.validadoManual);
  const total = h.fichaTotal ?? 0;
  const info = total > 0 ? Math.min(1, (h.fichaRellenos ?? 0) / total) : 0;
  const dcs = docs.requeridos > 0
    ? docs.recibidos / docs.requeridos
    : (docs.completo ? 1 : 0);
  const frm = hitoForm ? 1 : 0;
  if (manual || post) return { pct: 100, info: 1, docs: 1, formularios: 1, manual };
  return { pct: Math.round(((info + dcs + frm) / 3) * 100), info, docs: dcs, formularios: frm, manual };
}

// Orden dentro de una fase: sustituye al antiguo ORDEN por estado, que ya no discrimina.
function scoreDe(estado: Estado5, docs: ReturnType<typeof docsCompletos>, hitoForm: boolean, h: Hechos): number {
  if (estado === "FINALIZADO") return 100;
  if (estado === "RECHAZADO") return 95;
  if (estado === "RESUELTO") return h.fechaCita ? 90 : 85;
  if (estado === "PRESENTADO") return 80;
  let s = 0;
  if (h.arrancado) s += 10;
  if (docs.requeridos > 0) s += Math.round((docs.recibidos / docs.requeridos) * 40);
  else if (docs.completo) s += 40;
  if (docs.completo) s += 10;
  if (hitoForm) s += 15;
  if (h.tieneTasa) s += 5;
  return Math.min(75, s);
}
