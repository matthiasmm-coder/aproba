// NOTIFICACIONES DE LA DEHú (Matthias, 28/09/2026) — módulo PURO.
//
// Qué es cada notificación que entra (lectura de la IA, normalizada a la defensiva), a qué
// expediente PROPONEMOS vincularla y qué plazo le calculamos. La propuesta es solo eso: el
// gestor confirma. Lo usan la importación de PDF (app/api/dehu), los avisos por email de la
// DEHú (lib/email-entrante-procesar.ts), la pestaña DEHú y la campana.

import { PLAZO_HABITUAL_DIAS, sumarDiasHabiles } from "@/lib/requerimientos";

export const TIPOS_NOTIFICACION = [
  "REQUERIMIENTO", "RESOLUCION_FAVORABLE", "RESOLUCION_DESFAVORABLE", "ARCHIVO", "CITACION", "ACUSE", "OTRA", "AVISO", "VERIFICACION",
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];
export const ESTADOS_NOTIFICACION = ["PENDIENTE", "VINCULADA", "GESTIONADA", "IGNORADA"] as const;
export type EstadoNotificacion = (typeof ESTADOS_NOTIFICACION)[number];
// LEMA = la DEHú automática (Gran Destinatario, lib/dehu/sincronizar.ts, 29/09/2026).
export type OrigenNotificacion = "PDF" | "AVISO_EMAIL" | "LEMA";

// Etiquetas en pantalla (claves de t(): traducidas en lib/app-i18n.ts).
export const TIPO_NOTIFICACION_LABEL: Record<TipoNotificacion, string> = {
  REQUERIMIENTO: "Requerimiento",
  RESOLUCION_FAVORABLE: "Resolución favorable",
  RESOLUCION_DESFAVORABLE: "Resolución desfavorable",
  ARCHIVO: "Archivo o desistimiento",
  CITACION: "Citación",
  ACUSE: "Justificante de notificación",
  OTRA: "Comunicación",
  AVISO: "Aviso de la DEHú",
  VERIFICACION: "Verificación de la dirección",
};

// Pasados 10 días naturales desde la puesta a disposición sin abrirla, la notificación se
// entiende rechazada (art. 43.2 de la Ley 39/2015) y el procedimiento sigue.
export const DIAS_PARA_ABRIR = 10;
// URL oficial, la ÚNICA a la que mandamos al gestor: nunca un enlace sacado de un email
// (los avisos falsos de la DEHú son un clásico del phishing).
export const URL_DEHU = "https://dehu.redsara.es";
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_ENTRADAS_ZIP = 40;

export type PlazoTipo = "HABILES" | "NATURALES" | "MESES";
export type TasaLeida = { modelo: string; importe: number | null };
export type CitaLeida = { fecha: string; hora: string | null; lugar: string | null };
export type NotificacionLeida = {
  esNotificacion: boolean;
  tipo: TipoNotificacion;
  organismo: string | null;
  asunto: string | null;
  resumen: string | null;
  titularNombre: string | null;      // la persona extranjera del procedimiento, nunca el representante
  nie: string | null;
  pasaporte: string | null;
  empresaNombre: string | null;      // autorizaciones por cuenta ajena: la empresa solicitante
  empresaNif: string | null;
  numeroExpediente: string | null;
  fechaActo: string | null;               // AAAA-MM-DD
  fechaPuestaDisposicion: string | null;  // AAAA-MM-DD, si trae el justificante
  fechaNotificacion: string | null;       // AAAA-MM-DD: acceso / comparecencia, si consta
  plazo: number | null;
  plazoTipo: PlazoTipo | null;
  documentos: string[];
  tasas: TasaLeida[];
  cita: CitaLeida | null;
  identificador: string | null;      // identificador de la notificación en la DEHú / Notific@
  csv: string | null;                // código seguro de verificación del documento
  confianza: number;
  legible: boolean;
};

const txt = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};
export const fechaValida = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

// NIE (X/Y/Z + 7 cifras + letra) o DNI (8 cifras + letra), sin espacios ni guiones.
export function normalizarDocumentoId(v: unknown): string | null {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[\s.\-/]/g, "") : "";
  return /^[XYZ]\d{7}[A-Z]$/.test(s) || /^\d{8}[A-Z]$/.test(s) ? s : null;
}
// NIF de empresa (letra + 7 cifras + control) o de persona.
export function normalizarNif(v: unknown): string | null {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[\s.\-/]/g, "") : "";
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s) ? s : normalizarDocumentoId(s);
}
const pasaporteDe = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[\s.\-/]/g, "") : "";
  return /^[A-Z0-9]{5,20}$/.test(s) ? s : null;
};
const horaDe = (v: unknown): string | null => {
  const m = typeof v === "string" ? /^(\d{1,2})[:.h](\d{2})/.exec(v.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
};
const numeroDe = (v: unknown): string | null => {
  const s = txt(v, 60);
  return s ? s.toUpperCase() : null;
};

export function normalizarNotificacionLeida(c: Record<string, unknown> | null | undefined): NotificacionLeida {
  const x = c ?? {};
  const tipoCrudo = String(x.tipo ?? "").toUpperCase().trim();
  // AVISO y VERIFICACION son de los emails, nunca de un PDF.
  const tipo = (TIPOS_NOTIFICACION as readonly string[]).includes(tipoCrudo) && tipoCrudo !== "AVISO" && tipoCrudo !== "VERIFICACION"
    ? (tipoCrudo as TipoNotificacion) : "OTRA";
  const plazo = Math.round(Number(x.plazo ?? x.plazo_dias));
  const plazoTipoCrudo = String(x.plazo_tipo ?? "").toUpperCase().replace("Á", "A");
  const plazoTipo: PlazoTipo | null = plazoTipoCrudo === "HABILES" || plazoTipoCrudo === "NATURALES" || plazoTipoCrudo === "MESES" ? plazoTipoCrudo : null;
  const plazoOk = Number.isFinite(plazo) && plazo >= 1 && plazo <= (plazoTipo === "MESES" ? 12 : 120) ? plazo : null;
  const docs = Array.isArray(x.documentos)
    ? x.documentos.map((d) => txt(d, 200)).filter((d): d is string => Boolean(d)).slice(0, 20) : [];
  const tasas = Array.isArray(x.tasas)
    ? (x.tasas as unknown[]).map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        const modelo = txt(o.modelo, 30);
        const imp = Number(o.importe);
        return modelo ? { modelo, importe: Number.isFinite(imp) && imp > 0 && imp < 10000 ? Math.round(imp * 100) / 100 : null } : null;
      }).filter((t): t is TasaLeida => Boolean(t)).slice(0, 5)
    : [];
  const citaCruda = (x.cita ?? null) as Record<string, unknown> | null;
  const citaFecha = fechaValida(citaCruda?.fecha);
  const conf = Number(x.confianza);
  return {
    esNotificacion: x.es_notificacion !== false,
    tipo,
    organismo: txt(x.organismo, 200),
    asunto: txt(x.asunto, 200),
    resumen: txt(x.resumen, 600),
    titularNombre: txt(x.titular_nombre, 160),
    nie: normalizarDocumentoId(x.nie),
    pasaporte: pasaporteDe(x.pasaporte),
    empresaNombre: txt(x.empresa_nombre, 160),
    empresaNif: normalizarNif(x.empresa_nif),
    numeroExpediente: numeroDe(x.numero_expediente),
    fechaActo: fechaValida(x.fecha_acto),
    fechaPuestaDisposicion: fechaValida(x.fecha_puesta_disposicion),
    fechaNotificacion: fechaValida(x.fecha_notificacion),
    plazo: plazoOk,
    plazoTipo: plazoOk ? (plazoTipo ?? "HABILES") : null,
    documentos: docs,
    tasas,
    cita: citaFecha ? { fecha: citaFecha, hora: horaDe(citaCruda?.hora), lugar: txt(citaCruda?.lugar, 200) } : null,
    identificador: numeroDe(x.identificador),
    csv: numeroDe(x.csv),
    confianza: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    legible: x.legible !== false,
  };
}

// ── Plazos (art. 30 Ley 39/2015) ─────────────────────────────────────────────
// Se cuentan desde el día siguiente a la notificación. Días sin más = hábiles; en
// naturales o meses, si el último día cae en sábado o domingo pasa al lunes; un mes
// acaba el mismo día del mes siguiente (o el último, si ese día no existe). Los festivos
// NO se saltan (como el resto de Aproba): la interfaz lo dice.
const DIA = 86_400_000;
function siguienteHabil(d: Date): Date {
  const r = new Date(d.getTime());
  while (r.getUTCDay() === 0 || r.getUTCDay() === 6) r.setTime(r.getTime() + DIA);
  return r;
}
function sumarMeses(d: Date, n: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dia = d.getUTCDate();
  const ultimo = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + n, Math.min(dia, ultimo), 12));
}

// Plazo que PROPONEMOS (el gestor lo corrige): el del documento desde que se notificó; un
// requerimiento sin plazo legible, los 10 días hábiles habituales. Sin fecha de acceso en
// el PDF se cuenta desde `hoy` (la interfaz lo avisa).
export function fechaLimiteSugerida(n: Pick<NotificacionLeida, "tipo" | "plazo" | "plazoTipo" | "fechaNotificacion">, hoy: Date = new Date()): Date | null {
  const cantidad = n.plazo ?? (n.tipo === "REQUERIMIENTO" ? PLAZO_HABITUAL_DIAS : null);
  if (!cantidad) return null;
  const tipo: PlazoTipo = n.plazo ? (n.plazoTipo ?? "HABILES") : "HABILES";
  const desde = n.fechaNotificacion ? new Date(`${n.fechaNotificacion}T12:00:00Z`) : hoy;
  if (tipo === "NATURALES") return siguienteHabil(new Date(desde.getTime() + cantidad * DIA));
  if (tipo === "MESES") return siguienteHabil(sumarMeses(desde, cantidad));
  return sumarDiasHabiles(desde, cantidad);
}

// Aviso de la DEHú: plazo para ABRIRLA, 10 días naturales desde la puesta a disposición.
export function limiteParaAbrir(puestaDisposicion: Date): Date {
  return new Date(puestaDisposicion.getTime() + DIAS_PARA_ABRIR * DIA);
}

// ── A qué expediente proponemos vincularla ──────────────────────────────────
export type PersonaCandidata = { clienteId: string; nombre: string; nie: string | null; pasaporte: string | null };
export type ExpedienteCandidato = {
  id: string; referencia: string; numeroOficial: string | null; vivo: boolean; creadoAt: string;
  personas: PersonaCandidata[]; // titular, miembros de la familia y, en uno de empresa, sus trabajadores
  empresaNif?: string | null;
};
// `candidatos`: si la persona tiene varios expedientes (vivos, o todos archivados), sus ids
// para que el gestor elija en un clic — no se elige por él.
export type Sugerencia = { expedienteId: string | null; clienteId: string | null; motivo: string; candidatos?: string[] };
// Por qué se propone un expediente (se enseña traducido: claves de t()).
export const MOTIVOS_SUGERENCIA = ["nº de expediente", "NIE", "pasaporte", "nombre", "NIF de la empresa", "aviso vinculado"] as const;
const [M_NUMERO, M_NIE, M_PASAPORTE, M_NOMBRE, M_NIF] = MOTIVOS_SUGERENCIA;

export const normalizarNombre = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
const docNorm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
// El nº oficial se escribe con o sin espacios, puntos, guiones o barras: se compara sin ellos.
export const claveNumero = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[\s.\-/_]/g, "");

// Orden de confianza: nº de expediente oficial > NIE > pasaporte > nombre completo > NIF de
// la empresa. Si la persona aparece en varios expedientes, preferimos el vivo más reciente;
// si hay empate de vivos, no elegimos (clienteId sí, expediente no): mejor preguntar que
// vincular mal.
export function sugerirExpediente(
  n: Pick<NotificacionLeida, "numeroExpediente" | "nie" | "pasaporte" | "titularNombre"> & { empresaNif?: string | null },
  cands: ExpedienteCandidato[],
): Sugerencia | null {
  const num = claveNumero(n.numeroExpediente);
  if (num.length >= 5) {
    const porNumero = cands.filter((e) => e.numeroOficial && claveNumero(e.numeroOficial) === num);
    if (porNumero.length === 1) return { expedienteId: porNumero[0].id, clienteId: porNumero[0].personas[0]?.clienteId ?? null, motivo: M_NUMERO };
  }
  const elegir = (coinciden: { e: ExpedienteCandidato; p: PersonaCandidata }[], motivo: string): Sugerencia | null => {
    if (!coinciden.length) return null;
    const clientes = new Set(coinciden.map((c) => c.p.clienteId));
    if (clientes.size > 1) return null; // dos personas distintas con el mismo dato: no adivinamos
    const vivos = coinciden.filter((c) => c.e.vivo).sort((a, b) => b.e.creadoAt.localeCompare(a.e.creadoAt));
    const lista = vivos.length ? vivos : [...coinciden].sort((a, b) => b.e.creadoAt.localeCompare(a.e.creadoAt));
    const ids = [...new Set(lista.map((c) => c.e.id))];
    return ids.length === 1
      ? { expedienteId: ids[0], clienteId: lista[0].p.clienteId, motivo }
      : { expedienteId: null, clienteId: lista[0].p.clienteId, motivo, candidatos: ids.slice(0, 6) };
  };
  const todos = cands.flatMap((e) => e.personas.map((p) => ({ e, p })));
  if (n.nie) {
    const r = elegir(todos.filter((c) => c.p.nie && docNorm(c.p.nie) === n.nie), M_NIE);
    if (r) return r;
  }
  if (n.pasaporte) {
    const r = elegir(todos.filter((c) => c.p.pasaporte && docNorm(c.p.pasaporte) === n.pasaporte), M_PASAPORTE);
    if (r) return r;
  }
  const nombre = normalizarNombre(n.titularNombre);
  if (nombre && nombre.split(" ").length >= 2) {
    const r = elegir(todos.filter((c) => normalizarNombre(c.p.nombre) === nombre), M_NOMBRE);
    if (r) return r;
  }
  if (n.empresaNif) {
    const deEmpresa = cands.filter((e) => e.empresaNif && docNorm(e.empresaNif) === n.empresaNif);
    const vivos = deEmpresa.filter((e) => e.vivo);
    if (vivos.length === 1) return { expedienteId: vivos[0].id, clienteId: vivos[0].personas[0]?.clienteId ?? null, motivo: M_NIF };
  }
  return null;
}

// ── Avisos por email de la DEHú ─────────────────────────────────────────────
// Filtro BARATO antes de pagar una lectura con IA: menciona la DEHú o Notific@ (o viene de
// un dominio público y habla de una notificación). Lo decide después la IA (leerAvisoDehu).
export function esCandidatoAvisoDehu(e: { remitente: string | null; asunto: string | null; texto: string | null }): boolean {
  const cuerpo = `${e.asunto ?? ""} ${e.texto ?? ""}`;
  if (/\bdeh[uú]\b|direcci[oó]n electr[oó]nica habilitada|notific@/i.test(cuerpo)) return true;
  const dominio = String(e.remitente ?? "").toLowerCase().split("@")[1] ?? "";
  return /(^|\.)(redsara\.es|gob\.es)$/.test(dominio) && /notificaci[oó]n|comunicaci[oó]n|verific/i.test(cuerpo);
}

export type AvisoLeido = {
  esAviso: boolean;          // aviso de notificación o comunicación puesta a disposición
  esVerificacion: boolean;   // la DEHú pide verificar esta dirección de aviso
  organismo: string | null;
  concepto: string | null;
  titularNombre: string | null;
  nie: string | null;
  numeroExpediente: string | null;
  identificador: string | null;
  fechaPuestaDisposicion: string | null; // AAAA-MM-DD
  fechaLimite: string | null;            // si el email dice hasta cuándo se puede abrir
  codigo: string | null;     // código de verificación, si lo trae
};
export function normalizarAvisoLeido(c: Record<string, unknown> | null | undefined): AvisoLeido {
  const x = c ?? {};
  const codigo = txt(x.codigo, 40);
  return {
    esAviso: x.es_aviso === true,
    esVerificacion: x.es_verificacion === true,
    organismo: txt(x.organismo, 200),
    concepto: txt(x.concepto, 300),
    titularNombre: txt(x.titular_nombre, 160),
    nie: normalizarDocumentoId(x.nie),
    numeroExpediente: numeroDe(x.numero_expediente),
    identificador: numeroDe(x.identificador),
    fechaPuestaDisposicion: fechaValida(x.fecha_puesta_disposicion),
    fechaLimite: fechaValida(x.fecha_limite),
    // Un código es una cadena corta sin espacios; un enlace NUNCA pasa por aquí.
    codigo: codigo && /^[A-Za-z0-9-]{3,40}$/.test(codigo) ? codigo : null,
  };
}

// ¿Qué aviso pendiente queda resuelto al importar el PDF de su notificación? Por
// identificador, nº de expediente o NIE; si no, la misma puesta a disposición del mismo
// organismo (varios iguales son intercambiables: comparten plazo, se cierra el más antiguo).
export type AvisoPendiente = {
  id: string; organismo: string | null; fechaPuestaDisposicion: string | null; identificador: string | null;
  numeroExpediente: string | null; nie: string | null; createdAt: string;
};
export function avisoQueCierra(
  n: Pick<NotificacionLeida, "identificador" | "numeroExpediente" | "nie" | "organismo" | "fechaPuestaDisposicion">,
  avisos: AvisoPendiente[],
): string | null {
  const antiguo = (l: AvisoPendiente[]) => [...l].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null;
  if (n.identificador) {
    const m = avisos.filter((a) => a.identificador && claveNumero(a.identificador) === claveNumero(n.identificador));
    if (m.length) return antiguo(m);
  }
  if (n.numeroExpediente) {
    const m = avisos.filter((a) => a.numeroExpediente && claveNumero(a.numeroExpediente) === claveNumero(n.numeroExpediente));
    if (m.length) return antiguo(m);
  }
  if (n.nie) {
    const m = avisos.filter((a) => a.nie === n.nie);
    if (m.length) return antiguo(m);
  }
  if (n.fechaPuestaDisposicion) {
    const mismoDia = avisos.filter((a) => a.fechaPuestaDisposicion === n.fechaPuestaDisposicion);
    const org = normalizarNombre(n.organismo);
    const mismoOrg = org ? mismoDia.filter((a) => {
      const o = normalizarNombre(a.organismo);
      return Boolean(o) && (o.includes(org) || org.includes(o));
    }) : [];
    if (mismoOrg.length) return antiguo(mismoOrg);
    if (mismoDia.length === 1 && !mismoDia[0].organismo) return mismoDia[0].id;
  }
  return null;
}

// Etiqueta corta para el historial del expediente.
export function etiquetaNotificacion(n: { tipo: string; fechaNotificacion?: string | null; fechaActo?: string | null }): string {
  const base = TIPO_NOTIFICACION_LABEL[n.tipo as TipoNotificacion] ?? "Notificación";
  const f = n.fechaNotificacion ?? n.fechaActo ?? null;
  const fechaTxt = f ? ` ${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "";
  return `DEHú · ${base}${fechaTxt}`.slice(0, 80);
}

// Días que quedan hasta una fecha (negativo = vencido), por días de calendario.
export function diasHasta(fecha: string | Date, hoy: Date = new Date()): number {
  const f = new Date(fecha);
  const a = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const b = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((a - b) / DIA);
}

// ── Fila tal como la ven la pestaña DEHú y la ficha ─────────────────────────
export type NotificacionDehu = {
  id: string; origen: OrigenNotificacion; estado: EstadoNotificacion; tipo: TipoNotificacion;
  organismo: string | null; asunto: string | null; resumen: string | null;
  titularNombre: string | null; nie: string | null; pasaporte: string | null; numeroExpediente: string | null;
  empresaNombre: string | null; empresaNif: string | null;
  fechaActo: string | null; fechaNotificacion: string | null; fechaPuestaDisposicion: string | null;
  plazo: number | null; plazoTipo: PlazoTipo | null; fechaLimite: string | null;
  plazoDesdeHoy: boolean;            // el PDF no traía la fecha de acceso: contado desde la importación
  documentos: string[]; tasas: TasaLeida[]; cita: CitaLeida | null;
  nombreArchivo: string | null; tieneArchivo: boolean;
  expedienteId: string | null; clienteId: string | null;
  sugerencia: Sugerencia | null;
  requerimientoId: string | null;
  noEsNotificacion: boolean;         // la IA no la reconoció (queda en «Ignoradas»)
  confianza: number | null;
  codigo: string | null;             // código de verificación de la dirección de aviso
  cerradaPor: string | null;         // aviso resuelto al importar el PDF de su notificación
  // DEHú automática: comunicación (1) o notificación (2), y lo que la DEHú dice de ella.
  dehu: { tipoEnvio: 1 | 2; estadoDehu: string | null; abiertaAt: string | null } | null;
  gestionadaAt: string | null; gestionadaPor: string | null; createdAt: string;
};

export const COLS_NOTIFICACION = "id, origen, estado, tipo, organismo, asunto, resumen, titularNombre, nie, pasaporte, numeroExpediente, fechaActo, fechaNotificacion, fechaPuestaDisposicion, plazo, plazoTipo, fechaLimite, documentos, tasas, storagePath, nombreArchivo, expedienteId, clienteId, expedienteSugeridoId, motivoSugerencia, requerimientoId, iaDatos, aviso, confianza, gestionadaAt, gestionadaPor, createdAt";

export function mapFilaNotificacion(r: Record<string, unknown>): NotificacionDehu {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const ia = (r.iaDatos ?? {}) as Record<string, unknown>;
  const av = (r.aviso ?? {}) as Record<string, unknown>;
  const tipo = (TIPOS_NOTIFICACION as readonly string[]).includes(String(r.tipo)) ? (r.tipo as TipoNotificacion) : "OTRA";
  const estado = (ESTADOS_NOTIFICACION as readonly string[]).includes(String(r.estado)) ? (r.estado as EstadoNotificacion) : "PENDIENTE";
  const plazoTipo = r.plazoTipo === "HABILES" || r.plazoTipo === "NATURALES" || r.plazoTipo === "MESES" ? r.plazoTipo : null;
  const sugId = s(r.expedienteSugeridoId);
  const sugIa = (ia.sugerencia ?? null) as Record<string, unknown> | null;
  const sugCli = s(sugIa?.clienteId);
  const candidatos = Array.isArray(sugIa?.candidatos) ? (sugIa.candidatos as unknown[]).map(String) : [];
  const cita = (ia.cita ?? null) as CitaLeida | null;
  return {
    id: String(r.id), origen: r.origen === "AVISO_EMAIL" ? "AVISO_EMAIL" : r.origen === "LEMA" ? "LEMA" : "PDF", estado, tipo,
    organismo: s(r.organismo), asunto: s(r.asunto), resumen: s(r.resumen),
    titularNombre: s(r.titularNombre), nie: s(r.nie), pasaporte: s(r.pasaporte), numeroExpediente: s(r.numeroExpediente),
    empresaNombre: s(ia.empresaNombre), empresaNif: s(ia.empresaNif),
    fechaActo: s(r.fechaActo)?.slice(0, 10) ?? null, fechaNotificacion: s(r.fechaNotificacion)?.slice(0, 10) ?? null,
    fechaPuestaDisposicion: s(r.fechaPuestaDisposicion)?.slice(0, 10) ?? null,
    plazo: r.plazo === null || r.plazo === undefined ? null : Number(r.plazo), plazoTipo, fechaLimite: s(r.fechaLimite),
    plazoDesdeHoy: ia.plazoDesdeHoy === true,
    documentos: Array.isArray(r.documentos) ? (r.documentos as unknown[]).map(String) : [],
    tasas: Array.isArray(r.tasas) ? (r.tasas as TasaLeida[]) : [],
    cita: cita && typeof cita.fecha === "string" ? cita : null,
    nombreArchivo: s(r.nombreArchivo), tieneArchivo: Boolean(r.storagePath),
    expedienteId: s(r.expedienteId), clienteId: s(r.clienteId),
    sugerencia: sugId || sugCli ? { expedienteId: sugId, clienteId: sugCli, motivo: s(r.motivoSugerencia) ?? "", ...(candidatos.length ? { candidatos } : {}) } : null,
    requerimientoId: s(r.requerimientoId),
    noEsNotificacion: ia.noEsNotificacion === true,
    confianza: r.confianza === null || r.confianza === undefined ? null : Number(r.confianza),
    codigo: s(av.codigo), cerradaPor: s(av.cerradaPor),
    dehu: r.origen === "LEMA" ? { tipoEnvio: av.tipoEnvio === 1 ? 1 : 2, estadoDehu: s(av.estadoDehu), abiertaAt: s(av.abiertaAt) } : null,
    gestionadaAt: s(r.gestionadaAt), gestionadaPor: s(r.gestionadaPor), createdAt: String(r.createdAt ?? ""),
  };
}
