// Catalogue de services configurable par le gestor.
// Persisté en localStorage (en attendant Supabase) pour que la config faite dans
// Ajustes se reflète dans le portail client, dans le même navigateur.

export type CitaQuien = "cliente" | "gestor";

export type Servicio = {
  id: string;
  label: string;
  desc: string;
  docs: string[];
  active: boolean;
  precio: number; // total honorarios (sin IVA) = anticipo + resto
  anticipo: number; // € sin IVA, pagadero al iniciar (a la firma)
  resto: number; // € sin IVA, pagadero al finalizar el trámite
  citaPresencial?: boolean; // ce trámite implique-t-il un rendez-vous physique ?
  citaQuien?: CitaQuien; // si oui : qui s'y rend (le client, ou le gestor pour lui)
  noIncluye?: string; // «servicios no incluidos» de la hoja de encargo (varía por trámite)
  // Tasas oficiales y otros suplidos del trámite (SIN IVA, fuera de los honorarios —
  // art. 78.Tres.3º LIVA). Van al presupuesto (portal + hoja de encargo) y a la PRIMERA
  // factura automática del expediente (anticipo si lo hay; si no, el pago final).
  suplidos?: { concepto: string; importe: number }[];
};

export const STORAGE_KEY = "aproba.servicios.v1";

// Catalogue par défaut. Les 4 premiers actifs ; les autres proposés à activer.
export const DEFAULT_SERVICIOS: Servicio[] = [
  { id: "arraigo_social", label: "Arraigo social", desc: "Residencia por arraigo", active: true, precio: 350, anticipo: 150, resto: 200, docs: ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "renovacion_tie", label: "Renovación de TIE", desc: "Renovar tu tarjeta de residencia", active: true, precio: 180, anticipo: 80, resto: 100, docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "reagrupacion", label: "Reagrupación familiar", desc: "Traer a tu familia", active: true, precio: 420, anticipo: 200, resto: 220, docs: ["Pasaporte", "Libro de familia", "Justificante de vivienda", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "nacionalidad", label: "Nacionalidad española", desc: "Solicitar la nacionalidad", active: true, precio: 600, anticipo: 300, resto: 300, docs: ["Pasaporte", "Certificado de nacimiento", "Certificado de empadronamiento", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "arraigo_laboral", label: "Arraigo laboral", desc: "Residencia por arraigo laboral", active: false, precio: 350, anticipo: 150, resto: 200, docs: ["Pasaporte", "Informe de vida laboral", "Certificado de empadronamiento", "Antecedentes penales"], citaPresencial: true, citaQuien: "cliente" },
  { id: "larga_duracion", label: "Residencia de larga duración", desc: "Residencia permanente", active: false, precio: 300, anticipo: 150, resto: 150, docs: ["TIE actual", "Certificado de empadronamiento", "Justificante de medios económicos"], citaPresencial: true, citaQuien: "cliente" },
  { id: "nie", label: "Asignación de NIE", desc: "Obtener tu número de identidad", active: false, precio: 90, anticipo: 90, resto: 0, docs: ["Pasaporte"], citaPresencial: true, citaQuien: "cliente" },
  // Trámites con sus modelos EX propios (mapeados en lib/ex-forms.ts por clave). Inactivos
  // por defecto: el despacho los activa en Ajustes si los ofrece. Conserva estas claves
  // (residencia_ue / brexit / modificacion) para que el formulario correcto se autocomplete.
  { id: "residencia_ue", label: "Residencia ciudadano UE", desc: "Tarjeta de residencia de familiar de ciudadano de la UE (RD 240/2007)", active: false, precio: 300, anticipo: 150, resto: 150, docs: ["Pasaporte", "Documento de identidad del ciudadano UE", "Certificado de empadronamiento", "Justificante del vínculo familiar"], citaPresencial: true, citaQuien: "cliente" },
  { id: "brexit", label: "Tarjeta Acuerdo de Retirada (Brexit)", desc: "Documentación para británicos y sus familiares (art. 18.4)", active: false, precio: 250, anticipo: 120, resto: 130, docs: ["Pasaporte", "Justificante de residencia anterior a 2021", "Certificado de empadronamiento"], citaPresencial: true, citaQuien: "cliente" },
  { id: "modificacion", label: "Modificación de autorización", desc: "Cambiar el tipo de autorización de residencia/trabajo", active: false, precio: 280, anticipo: 140, resto: 140, docs: ["TIE actual", "Pasaporte", "Justificante del nuevo supuesto"], citaPresencial: true, citaQuien: "cliente" },
];

// Garantit que chaque service a anticipo/resto/precio cohérents, même si la config
// a été persistée avant l'ajout du fractionnement du paiement. Invariant : precio = anticipo + resto.
function normalize(list: Servicio[]): Servicio[] {
  return list.map((s) => {
    const def = DEFAULT_SERVICIOS.find((d) => d.id === s.id);
    const precioBase = typeof s.precio === "number" ? s.precio : def?.precio ?? 0;
    const anticipo = typeof s.anticipo === "number" ? Math.max(0, s.anticipo) : def?.anticipo ?? Math.round(precioBase / 2);
    const resto = typeof s.resto === "number" ? Math.max(0, s.resto) : def?.resto ?? Math.max(0, precioBase - anticipo);
    return { ...s, anticipo, resto, precio: anticipo + resto };
  });
}

export function loadServicios(): Servicio[] {
  if (typeof window === "undefined") return DEFAULT_SERVICIOS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return normalize(parsed as Servicio[]);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SERVICIOS;
}

export function saveServicios(list: Servicio[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function newServicio(): Servicio {
  return {
    id: "srv_" + Math.random().toString(36).slice(2, 9),
    label: "",
    desc: "",
    docs: [],
    active: true,
    precio: 0,
    anticipo: 0,
    resto: 0,
    citaPresencial: false,
    citaQuien: "cliente",
  };
}
