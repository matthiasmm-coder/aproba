// Avisos automáticos au client — configurables par le gestor, persistés en BASE
// (table AvisoConfig, via lib/config-browser → guardarAvisos) et lus par le backend
// d'envoi (lib/notificaciones.ts dispararAviso).

export type Canal = "whatsapp" | "email";

export type Aviso = {
  id: string; // = clave en base ; doit correspondre à la clave dispatchée par le code
  evento: string; // libellé de l'événement déclencheur
  template: string; // message, avec placeholders {nombre} {documento} {fecha}
  canal: Canal;
  activo: boolean;
};

// Avisos par défaut : proposés dans Ajustes ET utilisés en REPLI par le backend si le
// workspace n'a encore rien personnalisé (→ les avisos marchent out-of-the-box).
// Canal = email : c'est le seul qui part vraiment aujourd'hui (l'envoi WhatsApp
// automatique reste un chantier — WhatsApp Business API). Chaque clave ci-dessous est
// réellement déclenchée par le code (sinon ce serait un toggle mort).
export const DEFAULT_AVISOS: Aviso[] = [
  { id: "doc_recibido", evento: "Documento recibido", template: "Hola {nombre}, hemos recibido tu {documento}. Lo revisamos enseguida.", canal: "email", activo: true },
  { id: "doc_validado", evento: "Documento validado", template: "Tu {documento} es correcto y ha quedado validado. ✓", canal: "email", activo: true },
  { id: "doc_rechazado", evento: "Documento rechazado", template: "Tu {documento} no se lee bien. Por favor, vuelve a subirlo desde tu enlace.", canal: "email", activo: true },
  { id: "form_generado", evento: "Formularios preparados", template: "Hola {nombre}, ya hemos preparado tus formularios oficiales. Seguimos avanzando con tu trámite.", canal: "email", activo: true },
  { id: "presentado", evento: "Expediente presentado", template: "Tu expediente ya está presentado en la Administración. Te avisaremos en cuanto haya resolución.", canal: "email", activo: true },
];

// Remplit les placeholders avec des exemples (pour l'aperçu dans Ajustes).
export function rellenar(template: string): string {
  return template
    .replace(/\{nombre\}/g, "Julia")
    .replace(/\{documento\}/g, "pasaporte")
    .replace(/\{fecha\}/g, "18 de junio");
}
