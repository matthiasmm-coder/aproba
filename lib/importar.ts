// Import de migración — moteur DÉTERMINISTE partagé par /api/importar/{analizar,ejecutar}.
// Principe : l'IA PROPOSE le mapping (colonnes → champs Aproba, trámites → services),
// le gestor VALIDE dans l'UI, et CE code exécute — l'IA ne touche jamais aux données.
// Couvre les 3 réalités du marché : Excel/Sheets maison, exports propriétaires
// (MN Program, Sudespacho…), listes semi-structurées. Idempotent par NIE/email/referencia.

import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { normalizarFechaCsv } from "@/lib/csv-clientes";

// ── Champs cibles ────────────────────────────────────────────────────────────────────
// Ficha (colonnes Cliente, source unique lib/ficha.ts) + extras d'import.
export const CAMPOS_CLIENTE = [...FICHA_KEYS, "idioma", "fechaCaducidad"] as const;
export const CAMPOS_EXPEDIENTE = ["referencia", "tramite", "estado", "notas"] as const;
export const CAMPOS_ESPECIALES = ["nombreCompleto", "documento", "familia", "parentesco", "fechaResolucion"] as const;
export type CampoImport = (typeof CAMPOS_CLIENTE)[number] | (typeof CAMPOS_EXPEDIENTE)[number] | (typeof CAMPOS_ESPECIALES)[number];

export const TODOS_LOS_CAMPOS: CampoImport[] = [...CAMPOS_CLIENTE, ...CAMPOS_EXPEDIENTE, ...CAMPOS_ESPECIALES];

export type MapeoColumna = { indice: number; campo: CampoImport | null };
export type Mapeo = {
  columnas: MapeoColumna[];
  // Valores libres de la columna «tramite» → clave de servicio del catálogo (o null = sin expediente).
  tramites: Record<string, string | null>;
  // Valores libres de la columna «estado» → EstadoExpediente.
  estados: Record<string, string>;
  crearExpedientes: boolean;
  crearFamilias: boolean;
  // Regularización extraordinaria 2026 (RD 316/2026): la autorización dura UN AÑO desde
  // la resolución. Con este flag, una columna «fecha de resolución» genera la caducidad
  // (resolución + 1 año) y, con ella, el aviso de renovación en Vigía. Es LA razón por la
  // que un despacho quiere meter aquí su lista: ~600.000 títulos caducan a la vez en 2027.
  regularizacion2026?: boolean;
};

// Fecha ISO + 1 año (mismo día). Devuelve "" si la entrada no es una fecha ISO válida.
export function masUnAno(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y + 1, +mo - 1, +d));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

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

// ── Aplicar el mapeo a las filas (puro, testeable) ───────────────────────────────────
export type FilaImportada = {
  ficha: ClienteFicha;
  idioma: string;
  fechaCaducidad: string;      // ISO o ""
  familia: string;             // clave de agrupación libre ("" = sin familia)
  parentesco: string;
  referencia: string;
  servicio: string | null;     // clave del catálogo (null = sin expediente)
  estado: string;              // EstadoExpediente
  notas: string;
  avisos: string[];            // problemas de ESTA fila (nunca bloquean el lote)
};

export function aplicarMapeo(filas: string[][], mapeo: Mapeo): FilaImportada[] {
  const campoDe = new Map<number, CampoImport>();
  for (const c of mapeo.columnas) if (c.campo) campoDe.set(c.indice, c.campo);

  return filas.map((fila) => {
    const ficha: ClienteFicha = {};
    const out: FilaImportada = { ficha, idioma: "", fechaCaducidad: "", familia: "", parentesco: "", referencia: "", servicio: null, estado: "", notas: "", avisos: [] };
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
        default: (ficha as Record<string, string>)[campo] = v;
      }
    }

    // Regularización 2026: caducidad = resolución + 1 año (no pisa una caducidad explícita).
    if (mapeo.regularizacion2026 && resolucion && !out.fechaCaducidad) {
      const cad = masUnAno(resolucion);
      if (cad) out.fechaCaducidad = cad;
    }

    if (mapeo.crearExpedientes && tramiteBruto) {
      const servicio = mapeo.tramites[tramiteBruto];
      if (servicio) out.servicio = servicio;
      else if (servicio === undefined) out.avisos.push(`Trámite sin mapear: «${tramiteBruto}»`);
    }
    if (estadoBruto) {
      const e = mapeo.estados[estadoBruto];
      if (e && (ESTADOS_EXPEDIENTE as readonly string[]).includes(e)) out.estado = e;
      else out.avisos.push(`Estado sin mapear: «${estadoBruto}»`);
    }
    // Archivo histórico sin columna de estado → FINALIZADO (el valor está en Vigía, no en el kanban).
    if (out.servicio && !out.estado) out.estado = "FINALIZADO";

    const nie = ficha.numeroDocumento ?? "";
    if (nie && !esNie(nie) && !esDni(nie)) out.avisos.push(`NIE/DNI con formato extraño: «${nie}»`);
    if (!ficha.nombre?.trim()) out.avisos.push("Fila sin nombre");
    return out;
  });
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
