// Import de migración — moteur DÉTERMINISTE partagé par /api/importar/{analizar,ejecutar}.
// Principe : l'IA PROPOSE le mapping (colonnes → champs Aproba, trámites → services),
// le gestor VALIDE dans l'UI, et CE code exécute — l'IA ne touche jamais aux données.
// Couvre les 3 réalités du marché : Excel/Sheets maison, exports propriétaires
// (MN Program, Sudespacho…), listes semi-structurées. Idempotent par NIE/email/referencia.

import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { normalizarFechaCsv } from "@/lib/csv-clientes";
import { MESES_VALIDEZ, sumarMeses } from "@/lib/validez";
import { SERVICIO_A_TIPO } from "@/lib/tramites";

// ── Champs cibles ────────────────────────────────────────────────────────────────────
// Ficha (colonnes Cliente, source unique lib/ficha.ts) + extras d'import.
export const CAMPOS_CLIENTE = [...FICHA_KEYS, "idioma", "fechaCaducidad"] as const;
export const CAMPOS_EXPEDIENTE = ["referencia", "tramite", "estado", "notas", "importe"] as const;
export const CAMPOS_ESPECIALES = ["nombreCompleto", "documento", "familia", "parentesco", "fechaResolucion"] as const;
export type CampoImport = (typeof CAMPOS_CLIENTE)[number] | (typeof CAMPOS_EXPEDIENTE)[number] | (typeof CAMPOS_ESPECIALES)[number];

export const TODOS_LOS_CAMPOS: CampoImport[] = [...CAMPOS_CLIENTE, ...CAMPOS_EXPEDIENTE, ...CAMPOS_ESPECIALES];

export type MapeoColumna = { indice: number; campo: CampoImport | null };
export type Mapeo = {
  columnas: MapeoColumna[];
  // Valores libres de la columna «tramite» → clave de servicio del catálogo (o null = sin servicio).
  tramites: Record<string, string | null>;
  // Validez legal (MESES) de la tarjeta que produce CADA trámite → de ahí sale la renovación.
  // Se decide POR TRÁMITE, no con un interruptor global: la IA la propone según la naturaleza
  // del trámite (arraigo 12, renovación 48, larga duración 60, regularización 2026 12,
  // nacionalidad/NIE null = no caduca) y el gestor la ajusta. `null` = no genera vencimiento.
  // Clave ausente → repli sobre la validez legal del servicio mapeado del catálogo.
  validezMeses: Record<string, number | null>;
  // Valores libres de la columna «estado» → EstadoExpediente (resultado informativo del servicio).
  estados: Record<string, string>;
  // Registrar el trámite en el HISTORIAL de servicios del cliente (NO crea expediente).
  crearHistorial: boolean;
  crearFamilias: boolean;
};

// Correcciones del gestor en la pantalla de revisión (por índice de fila de datos).
export type OverrideFila = {
  nombre?: string; apellidos?: string; telefono?: string; email?: string;
  caducidad?: string;   // ISO — el gestor manda: fija la caducidad efectiva ("" = ninguna)
  excluir?: boolean;    // no importar esta fila
};

export const ESTADOS_EXPEDIENTE = [
  "BORRADOR", "DOCS_PENDIENTES", "DOCS_VALIDADOS", "FORM_GENERADO",
  "PRESENTADO", "RESUELTO", "CITA_HUELLAS", "FINALIZADO", "RECHAZADO",
] as const;

// ── Normalisations déterministes ─────────────────────────────────────────────────────
const limpiarEspacios = (s: string) => s.replace(/\s+/g, " ").trim();

// NIE X/Y/Z + 7 dígitos + letra ; DNI 8 dígitos + letra. Tout le reste = pasaporte.
export const esNie = (v: string) => /^[XYZ]\d{7}[A-Z]$/i.test(v.replace(/[\s.-]/g, ""));
export const esDni = (v: string) => /^\d{8}[A-Z]$/i.test(v.replace(/[\s.-]/g, ""));

// «GARCÍA LÓPEZ, MARÍA» → apellidos primero ; «María García López» → 1er token = nombre.
export function partirNombreCompleto(v: string): { nombre: string; apellidos: string } {
  const s = limpiarEspacios(v);
  if (!s) return { nombre: "", apellidos: "" };
  const coma = s.indexOf(",");
  if (coma !== -1) return { nombre: limpiarEspacios(s.slice(coma + 1)), apellidos: limpiarEspacios(s.slice(0, coma)) };
  const partes = s.split(" ");
  if (partes.length === 1) return { nombre: partes[0], apellidos: "" };
  return { nombre: partes[0], apellidos: partes.slice(1).join(" ") };
}

// Teléfono español sin prefijo → +34 ; internacionales se respetan tal cual.
export function normalizarTelefono(v: string): string {
  const s = v.replace(/[\s().-]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  if (/^[6789]\d{8}$/.test(s)) return `+34${s}`;
  return v.trim();
}

const SEXOS: Record<string, string> = {
  m: "M", f: "M", mujer: "M", femenino: "M", female: "M",
  h: "H", v: "H", hombre: "H", varon: "H", masculino: "H", male: "H",
  x: "X", otro: "X", "no binario": "X",
};
export function normalizarSexo(v: string): string {
  return SEXOS[v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()] ?? "";
}

const ESTADOS_CIVILES: Record<string, string> = {
  s: "S", soltero: "S", soltera: "S", "soltero/a": "S", single: "S",
  c: "C", casado: "C", casada: "C", "casado/a": "C", married: "C",
  v: "V", viudo: "V", viuda: "V", d: "D", divorciado: "D", divorciada: "D",
  sp: "Sp", separado: "Sp", separada: "Sp",
};
export function normalizarEstadoCivil(v: string): string {
  return ESTADOS_CIVILES[v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()] ?? "";
}

// Importe libre → número. «690€» → 690 ; «1.290,50 €» → 1290.5 ; «300» → 300. Formato
// español (miles «.», decimal «,») y también inglés simple. null si no hay número válido.
export function parseImporte(v: string): number | null {
  let s = v.replace(/[^\d.,-]/g, "").trim(); // quita €, espacios, letras
  if (!s) return null;
  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");
  if (tieneComa && tienePunto) {
    s = s.replace(/\./g, "").replace(",", "."); // «1.290,50» → miles «.», decimal «,»
  } else if (tieneComa) {
    s = s.replace(",", "."); // decimal español
  } else if (tienePunto) {
    // «.» solo: decimal si 1-2 dígitos tras el último punto; miles si son 3 (o varios puntos)
    const partes = s.split(".");
    if (partes.length > 2 || partes[partes.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ── Aplicar el mapeo a las filas (puro, testeable) ───────────────────────────────────
export type FilaImportada = {
  ficha: ClienteFicha;
  idioma: string;
  fechaCaducidad: string;      // ISO o "" — caducidad EXPLÍCITA (columna del Excel) → Vigía REAL
  caducidadDerivada: string;   // ISO o "" — estimada del servicio + fecha de resolución → Vigía ESTIMADA
  fechaResolucion: string;     // ISO o "" — fecha en que se realizó/resolvió el servicio
  familia: string;             // clave de agrupación libre ("" = sin familia)
  parentesco: string;
  referencia: string;
  tramite: string;             // valor libre del archivo («Arraigo social», «Regularización DA 21»…)
  servicio: string | null;     // clave del catálogo (null = sin servicio en el historial)
  estado: string;              // EstadoExpediente (resultado del servicio)
  notas: string;
  importe: number | null;      // importe facturado en el pasado (info; NO genera factura)
  excluir: boolean;            // el gestor la descartó en la revisión
  avisos: string[];            // problemas de ESTA fila (nunca bloquean el lote)
};

export function aplicarMapeo(filas: string[][], mapeo: Mapeo): FilaImportada[] {
  const campoDe = new Map<number, CampoImport>();
  for (const c of mapeo.columnas) if (c.campo) campoDe.set(c.indice, c.campo);

  return filas.map((fila) => {
    const ficha: ClienteFicha = {};
    const out: FilaImportada = { ficha, idioma: "", fechaCaducidad: "", caducidadDerivada: "", fechaResolucion: "", familia: "", parentesco: "", referencia: "", tramite: "", servicio: null, estado: "", notas: "", importe: null, excluir: false, avisos: [] };
    let tramiteBruto = "";
    let estadoBruto = "";
    let resolucion = "";

    for (const [idx, campo] of campoDe) {
      const v = limpiarEspacios(String(fila[idx] ?? ""));
      if (!v) continue;
      switch (campo) {
        case "nombreCompleto": { const p = partirNombreCompleto(v); if (p.nombre) ficha.nombre = p.nombre; if (p.apellidos) ficha.apellidos = p.apellidos; break; }
        case "documento": {
          if (esNie(v) || esDni(v)) ficha.numeroDocumento = v.replace(/[\s.-]/g, "").toUpperCase();
          else ficha.pasaporte = v;
          break;
        }
        case "numeroDocumento": ficha.numeroDocumento = v.replace(/[\s.-]/g, "").toUpperCase(); break;
        case "pasaporte": ficha.pasaporte = v; break;
        case "telefono": ficha.telefono = normalizarTelefono(v); break;
        case "sexo": { const x = normalizarSexo(v); if (x) ficha.sexo = x; else out.avisos.push(`Sexo no reconocido: «${v}»`); break; }
        case "estadoCivil": { const x = normalizarEstadoCivil(v); if (x) ficha.estadoCivil = x; break; }
        case "fechaNacimiento": { const f = normalizarFechaCsv(v); if (f) ficha.fechaNacimiento = f; else out.avisos.push(`Fecha de nacimiento no válida: «${v}»`); break; }
        case "fechaCaducidad": { const f = normalizarFechaCsv(v); if (f) out.fechaCaducidad = f; else out.avisos.push(`Caducidad no válida: «${v}»`); break; }
        case "fechaResolucion": { const f = normalizarFechaCsv(v); if (f) resolucion = f; else out.avisos.push(`Fecha de resolución no válida: «${v}»`); break; }
        case "idioma": out.idioma = v.slice(0, 2).toLowerCase(); break;
        case "familia": out.familia = v; break;
        case "parentesco": out.parentesco = v.toUpperCase(); break;
        case "referencia": out.referencia = v; break;
        case "tramite": tramiteBruto = v; break;
        case "estado": estadoBruto = v; break;
        case "notas": out.notas = v; break;
        case "importe": out.importe = parseImporte(v); break;
        default: (ficha as Record<string, string>)[campo] = v;
      }
    }

    // Servicio (del trámite libre) → historial de servicios del cliente (NO expediente).
    if (mapeo.crearHistorial && tramiteBruto) {
      const servicio = mapeo.tramites[tramiteBruto];
      if (servicio) out.servicio = servicio;
      else if (servicio === undefined) out.avisos.push(`Trámite sin mapear: «${tramiteBruto}»`);
    }
    if (estadoBruto) {
      const e = mapeo.estados[estadoBruto];
      if (e && (ESTADOS_EXPEDIENTE as readonly string[]).includes(e)) out.estado = e;
      else out.avisos.push(`Estado sin mapear: «${estadoBruto}»`);
    }
    // Servicio histórico sin estado → FINALIZADO (es pasado; el radar vive en Vigía, no en el kanban).
    if (out.servicio && !out.estado) out.estado = "FINALIZADO";

    // ── Caducidad DERIVADA (Vigía ESTIMADA) — solo si NO hay caducidad explícita ──
    // «De la naturaleza del trámite y de su fecha se deduce la renovación»: la tarjeta que
    // produce ESE trámite dura N meses → caducidad = resolución + N. La validez viene, por
    // orden: (1) la propuesta POR TRÁMITE (IA + gestor), (2) la validez legal del servicio
    // del catálogo. `null` = no caduca (nacionalidad, NIE…) → ningún vencimiento.
    out.tramite = tramiteBruto;
    out.fechaResolucion = resolucion;
    if (!out.fechaCaducidad && resolucion) {
      const propuesta = tramiteBruto ? mapeo.validezMeses?.[tramiteBruto] : undefined;
      const meses = propuesta !== undefined
        ? propuesta
        : (out.servicio ? MESES_VALIDEZ[SERVICIO_A_TIPO[out.servicio] ?? "OTRO"] ?? null : null);
      if (meses) {
        const cad = sumarMeses(resolucion, meses);
        if (cad) out.caducidadDerivada = cad;
      }
    }

    const nie = ficha.numeroDocumento ?? "";
    if (nie && !esNie(nie) && !esDni(nie)) out.avisos.push(`NIE/DNI con formato extraño: «${nie}»`);
    if (!ficha.nombre?.trim()) out.avisos.push("Fila sin nombre");
    return out;
  });
}

// Correcciones del gestor (pantalla de revisión) aplicadas DESPUÉS del mapeo. Puro: lo usan
// igual la vista previa (cliente) y el import (servidor, que es la autoridad — nunca se fía
// de los valores ya calculados por el navegador, solo de estas correcciones explícitas).
export function aplicarOverrides(filas: FilaImportada[], overrides?: Record<number, OverrideFila> | null): void {
  if (!overrides) return;
  for (const [k, ov] of Object.entries(overrides)) {
    const f = filas[Number(k)];
    if (!f || !ov) continue;
    if (typeof ov.nombre === "string") f.ficha.nombre = limpiarEspacios(ov.nombre);
    if (typeof ov.apellidos === "string") f.ficha.apellidos = limpiarEspacios(ov.apellidos) || undefined;
    if (typeof ov.telefono === "string") f.ficha.telefono = ov.telefono.trim() ? normalizarTelefono(ov.telefono) : undefined;
    if (typeof ov.email === "string") f.ficha.email = ov.email.trim() || undefined;
    if (typeof ov.caducidad === "string") {
      // Una fecha escrita por el gestor es REAL (manda sobre la estimada); vacía = sin vencimiento.
      f.fechaCaducidad = normalizarFechaCsv(ov.caducidad);
      f.caducidadDerivada = "";
    }
    if (ov.excluir) f.excluir = true;
  }
}

// Duplicados DENTRO del archivo (por NIE/pasaporte/email) — el upsert cubre los de la base.
export function marcarDuplicadosInternos(filas: FilaImportada[]): void {
  const vistos = new Map<string, number>();
  filas.forEach((f, i) => {
    for (const clave of [f.ficha.numeroDocumento, f.ficha.pasaporte, f.ficha.email]) {
      const k = (clave ?? "").trim().toLowerCase();
      if (!k) continue;
      const prev = vistos.get(k);
      if (prev !== undefined && prev !== i) { f.avisos.push(`Duplicado en el archivo (fila ${prev + 1})`); return; }
      vistos.set(k, i);
    }
  });
}
