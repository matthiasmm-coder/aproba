// Avisos automáticos au client — configurables par le gestor, persistés en BASE
// (table AvisoConfig, via lib/config-browser → guardarAvisos) et lus par le backend
// d'envoi (lib/notificaciones.ts dispararAviso).

export type Canal = "whatsapp" | "email";

// Canal GLOBAL de los avisos al cliente, por workspace (Workspace.canalAvisos —
// migración supabase/whatsapp-canal.sql). Lo honran todas las notificaciones al
// cliente (lib/notificaciones.ts); se elige en Ajustes → Notificaciones al cliente.
// (Distinto del campo legacy per-aviso `canal` de AvisoConfig, que ya no se usa.)
export type CanalAvisos = "EMAIL" | "WHATSAPP" | "AMBOS";

export const esCanalAvisos = (v: unknown): v is CanalAvisos =>
  v === "EMAIL" || v === "WHATSAPP" || v === "AMBOS";

export type Aviso = {
  id: string; // = clave en base ; doit correspondre à la clave dispatchée par le code
  evento: string; // libellé de l'événement déclencheur (et sujet de l'email)
  template: string; // message, avec placeholders {nombre} {documento} {fecha}
  canal: Canal;
  activo: boolean;
  // Aviso PERSONALIZADO (pedido de Sandra/LexPats, 31/08/2026): mensaje adicional que
  // se dispara con el MISMO evento real que un predeterminado. La clave empieza por
  // «custom_» y eventoBase apunta a la clave del predeterminado que le da el disparo.
  eventoBase?: string | null;
  // Predeterminado «eliminado» por el gestor: ni se muestra ni se envía, restaurable.
  // No se borra la fila — sin ella, el repli a DEFAULT_AVISOS lo resucitaría.
  oculto?: boolean;
};

export const esCustom = (a: { id: string }) => a.id.startsWith("custom_");
export const nuevaClaveCustom = () => `custom_${Math.random().toString(36).slice(2, 8)}`;

// Avisos par défaut : proposés dans Ajustes ET utilisés en REPLI par le backend si le
// workspace n'a encore rien personnalisé (→ les avisos marchent out-of-the-box).
// Le champ `canal` per-aviso est LEGACY (ignoré à l'envoi) : le canal réel est global
// au workspace (CanalAvisos ci-dessus). Chaque clave ci-dessous est réellement
// déclenchée par le code (sinon ce serait un toggle mort).
export const DEFAULT_AVISOS: Aviso[] = [
  { id: "doc_recibido", evento: "Documento recibido", template: "Hola {nombre}, hemos recibido tu {documento}. Lo revisamos enseguida.", canal: "email", activo: true },
  { id: "doc_validado", evento: "Documento validado", template: "Tu {documento} es correcto y ha quedado validado. ✓", canal: "email", activo: true },
  { id: "doc_rechazado", evento: "Documento rechazado", template: "Tu {documento} no se lee bien. Por favor, vuelve a subirlo desde tu enlace.", canal: "email", activo: true },
  { id: "form_generado", evento: "Formularios preparados", template: "Hola {nombre}, ya hemos preparado tus formularios oficiales. Seguimos avanzando con tu trámite.", canal: "email", activo: true },
  { id: "presentado", evento: "Expediente presentado", template: "Tu expediente ya está presentado en la Administración. Te avisaremos en cuanto haya resolución.", canal: "email", activo: true },
  { id: "resuelto_favorable", evento: "Resolución favorable", template: "¡Buenas noticias, {nombre}! Tu trámite ha sido resuelto favorablemente. Te explicamos enseguida los siguientes pasos.", canal: "email", activo: true },
  // Denegación = mauvaise nouvelle : désactivé par défaut (souvent annoncé en personne par le gestor).
  { id: "denegado", evento: "Resolución desfavorable", template: "Tu solicitud ha tenido una resolución desfavorable. Te contactamos para revisar juntos las opciones (recurso, nueva solicitud…).", canal: "email", activo: false },
  // Cita présentielle — deux variantes selon qui s'y rend (le {fecha} est assemblé par
  // la route : date + heure + lieu pour le client, juste la date pour le gestor).
  { id: "cita_cliente", evento: "Cita presencial (acude el cliente)", template: "Hola {nombre}, tienes una cita presencial {fecha}. Debes acudir en persona. {notas}", canal: "email", activo: true },
  { id: "cita_gestor", evento: "Cita presencial (acude el gestor)", template: "Hola {nombre}, hemos solicitado tu cita {fecha}. Nosotros nos encargamos de acudir en tu nombre y te mantendremos informado.", canal: "email", activo: true },
  { id: "tie_entregado", evento: "Trámite completado", template: "¡Enhorabuena, {nombre}! Tu trámite ha quedado completado. Te avisamos de los últimos pasos si los hubiera.", canal: "email", activo: true },
];

// Fusión filas de AvisoConfig → lista para Ajustes y para el envío. Pura (testeable):
//  · predeterminados: DEFAULT_AVISOS con overrides de la fila (template/activo/oculto);
//  · personalizados: filas custom_ añadidas al final, en su orden;
//  · filas con clave desconocida y sin eventoBase: ignoradas (datos huérfanos).
export type FilaAviso = {
  clave: string; evento: string; template: string; canal: string; activo: boolean;
  orden: number; eventoBase?: string | null; oculto?: boolean | null;
};
export function combinarAvisos(filas: FilaAviso[]): Aviso[] {
  const base = DEFAULT_AVISOS.map((d) => {
    const f = filas.find((x) => x.clave === d.id);
    return f
      ? { ...d, template: f.template, canal: (f.canal as Canal) ?? d.canal, activo: f.activo, oculto: f.oculto === true }
      : d;
  });
  const customs = filas
    .filter((f) => esCustom({ id: f.clave }) && DEFAULT_AVISOS.some((d) => d.id === f.eventoBase))
    .sort((a, b) => a.orden - b.orden)
    .map((f): Aviso => ({
      id: f.clave, evento: f.evento, template: f.template, canal: "email",
      activo: f.activo, eventoBase: f.eventoBase, oculto: false,
    }));
  return [...base, ...customs];
}

// Remplit les placeholders avec des exemples (pour l'aperçu dans Ajustes).
export function rellenar(template: string): string {
  return template
    .replace(/\{nombre\}/g, "Julia")
    .replace(/\{documento\}/g, "pasaporte")
    .replace(/\{fecha\}/g, "18 de junio");
}
