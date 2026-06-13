// Avisos automáticos au client — configurables par le gestor, persistés en localStorage.

export type Canal = "whatsapp" | "email";

export type Aviso = {
  id: string;
  evento: string; // libellé de l'événement déclencheur
  template: string; // message, avec placeholders {nombre} {documento} {fecha}
  canal: Canal;
  activo: boolean;
};

export const STORAGE_KEY = "aproba.avisos.v1";

export const DEFAULT_AVISOS: Aviso[] = [
  { id: "doc_recibido", evento: "Documento recibido", template: "Hola {nombre}, hemos recibido tu {documento}. Lo revisamos enseguida.", canal: "whatsapp", activo: true },
  { id: "doc_validado", evento: "Documento validado", template: "Tu {documento} es correcto y ha quedado validado. ✓", canal: "whatsapp", activo: true },
  { id: "doc_rechazado", evento: "Documento rechazado", template: "Tu {documento} no se lee bien. Por favor, vuelve a subirlo desde tu enlace.", canal: "whatsapp", activo: true },
  { id: "cita_asignada", evento: "Cita asignada", template: "Tienes cita el {fecha} para la toma de huellas. No olvides tu pasaporte.", canal: "whatsapp", activo: true },
  { id: "presentado", evento: "Expediente presentado", template: "Tu expediente ya está presentado en la Administración. Te avisaremos de la resolución.", canal: "whatsapp", activo: true },
  { id: "resolucion", evento: "Resolución favorable", template: "¡Buenas noticias, {nombre}! Tu trámite ha sido resuelto favorablemente.", canal: "email", activo: false },
];

export function loadAvisos(): Aviso[] {
  if (typeof window === "undefined") return DEFAULT_AVISOS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as Aviso[];
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_AVISOS;
}

export function saveAvisos(list: Aviso[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

// Remplit les placeholders avec des exemples (pour l'aperçu).
export function rellenar(template: string): string {
  return template
    .replace(/\{nombre\}/g, "Julia")
    .replace(/\{documento\}/g, "pasaporte")
    .replace(/\{fecha\}/g, "18 de junio");
}
