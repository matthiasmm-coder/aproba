// REQUERIMIENTOS — lógica PURA (petición de Jennifer, Gesadmbcn, 21/09/2026).
//
// Un requerimiento es un plazo de la Administración para aportar algo. Es la fecha más
// crítica del oficio: si vence, el expediente se tiene por desistido. Aquí no hay ni
// red ni base de datos, solo las reglas — de ahí que todo esto sea testeable.
//
// PRINCIPIO: la gestoría manda. La app no adivina la fecha ni avisa al cliente por su
// cuenta; calcula días, ordena por urgencia y decide CUÁNDO tocar el hombro al despacho.

export const AVISAR_DIAS_DEFECTO = 3;
export const PLAZO_HABITUAL_DIAS = 10; // «usualmente nos dan 10 días hábiles»

export type EstadoRequerimiento = "PENDIENTE" | "APORTADO";

export type Requerimiento = {
  id: string;
  expedienteId: string;
  asunto: string;
  docs: string[];
  recibidoEl: string | null;
  fechaLimite: string;
  avisarDias: number;
  ultimoAviso: number | null;
  estado: EstadoRequerimiento;
  aportadoEl: string | null;
  notas: string | null;
};

// ── Días hábiles ────────────────────────────────────────────────────────────────────
// Suma N días hábiles saltando sábados y domingos. NO conoce los festivos: son
// nacionales, autonómicos Y locales, cambian cada año y por municipio. Inventarlos sería
// peor que no tenerlos, porque un festivo olvidado acorta el plazo de verdad.
// La consecuencia está elegida a propósito: al ignorar festivos la fecha sale IGUAL o
// ANTES que la real, nunca después. El error solo puede dar prisa de más, jamás de menos.
// Es una AYUDA: la fecha que vale es la que escribe la gestoría.
export function sumarDiasHabiles(desde: Date, dias: number): Date {
  const d = new Date(desde.getTime());
  let quedan = Math.max(0, Math.floor(dias));
  while (quedan > 0) {
    d.setDate(d.getDate() + 1);
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) quedan--;
  }
  return d;
}

// Día natural (sin hora) en horario local: comparar plazos es cosa de DÍAS, no de horas.
// Sin esto, un requerimiento que vence hoy a las 00:00 aparecería como «vencido» a las 9:00.
const soloDia = (f: Date | string): Date => {
  const d = typeof f === "string" ? new Date(f) : f;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Días que quedan: 0 = vence hoy, negativo = ya venció.
export function diasRestantes(fechaLimite: string | Date, hoy: Date = new Date()): number {
  return Math.round((soloDia(fechaLimite).getTime() - soloDia(hoy).getTime()) / 864e5);
}

// ── Urgencia (una sola definición para la ficha, la lista y el color) ────────────────
export type Urgencia = "VENCIDO" | "HOY" | "URGENTE" | "PROXIMO" | "TRANQUILO" | "APORTADO";

export function urgenciaDe(r: Pick<Requerimiento, "estado" | "fechaLimite" | "avisarDias">, hoy: Date = new Date()): Urgencia {
  if (r.estado === "APORTADO") return "APORTADO";
  const d = diasRestantes(r.fechaLimite, hoy);
  if (d < 0) return "VENCIDO";
  if (d === 0) return "HOY";
  if (d <= Math.min(3, r.avisarDias)) return "URGENTE";
  if (d <= r.avisarDias) return "PROXIMO";
  return "TRANQUILO";
}

// El plazo en palabras, partido en CLAVE traducible + número: así el catalán no se queda
// a medias («Quedan 4 días» es dinámico y ningún diccionario lo tiene entero).
// La pantalla hace t(clave).replace("{n}", n); el email lo monta en español (abajo).
export function plazoClave(r: Pick<Requerimiento, "estado" | "fechaLimite" | "avisarDias">, hoy: Date = new Date()): { clave: string; n: number } {
  if (r.estado === "APORTADO") return { clave: "Aportado", n: 0 };
  const d = diasRestantes(r.fechaLimite, hoy);
  if (d < 0) return d === -1 ? { clave: "Venció ayer", n: 1 } : { clave: "Venció hace {n} días", n: -d };
  if (d === 0) return { clave: "Vence hoy", n: 0 };
  if (d === 1) return { clave: "Queda 1 día", n: 1 };
  return { clave: "Quedan {n} días", n: d };
}

export function etiquetaPlazo(r: Pick<Requerimiento, "estado" | "fechaLimite" | "avisarDias">, hoy: Date = new Date()): string {
  const { clave, n } = plazoClave(r, hoy);
  return clave.replace("{n}", String(n));
}

// Orden de trabajo: lo pendiente primero y lo que antes vence arriba; lo aportado al final.
export function ordenarPorUrgencia<T extends Pick<Requerimiento, "estado" | "fechaLimite">>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === "PENDIENTE" ? -1 : 1;
    const da = new Date(a.fechaLimite).getTime(), db = new Date(b.fechaLimite).getTime();
    return a.estado === "PENDIENTE" ? da - db : db - da; // aportados: lo más reciente antes
  });
}

// ── Cuándo avisar al DESPACHO ───────────────────────────────────────────────────────
// Vigía avisa UNA vez y marca AVISADO. Aquí no vale: con diez días de plazo, un solo
// correo el primer día se pierde entre lo demás. Pero avisar cada día sería ruido, y el
// ruido se acaba ignorando — justo lo que no puede pasar con esta fecha.
//
// Hitos decrecientes: el umbral que ELIGE la gestoría, luego 3, 1, el día del vencimiento
// y uno más si se pasó. Solo se manda un hito una vez, y solo si es MENOR que el último
// enviado: la serie nunca retrocede y nunca se repite.
export function hitosAviso(avisarDias: number): number[] {
  const u = Math.max(0, Math.floor(avisarDias));
  return [...new Set([u, 3, 1, 0, -1])].filter((h) => h <= u || h <= 0).sort((a, b) => b - a);
}

// Hito a enviar HOY, o null si no toca (ya avisado, aportado, o aún lejos).
export function avisoPendiente(
  r: Pick<Requerimiento, "estado" | "fechaLimite" | "avisarDias" | "ultimoAviso">,
  hoy: Date = new Date(),
): number | null {
  if (r.estado === "APORTADO") return null;
  const d = diasRestantes(r.fechaLimite, hoy);
  if (d < -1) return null; // vencido hace tiempo: ya se avisó, no se insiste eternamente
  const candidatos = hitosAviso(r.avisarDias).filter((h) => d <= h);
  if (!candidatos.length) return null;
  // Los hitos vienen de mayor a menor y `candidatos` son los ya ALCANZADOS: el último es
  // el más avanzado. Hay que coger ese, no el primero — si no, a 1 día del plazo se
  // enviaría otra vez el hito 3 (ya mandado) y el aviso de verdad no saldría nunca.
  const hito = candidatos[candidatos.length - 1];
  if (r.ultimoAviso !== null && r.ultimoAviso !== undefined && hito >= r.ultimoAviso) return null;
  return hito;
}

// Línea del email al despacho (misma redacción que la pantalla).
export function lineaAviso(r: Pick<Requerimiento, "asunto" | "estado" | "fechaLimite" | "avisarDias">, cliente: string, hoy: Date = new Date()): string {
  const f = new Date(r.fechaLimite).toLocaleDateString("es-ES");
  return `• ${cliente} — ${r.asunto} · ${etiquetaPlazo(r, hoy).toLowerCase()} (${f})`;
}
