// i18n de l'interface gestor (es ↔ ca). Approche « clé = texte espagnol » : on
// enveloppe chaque chaîne visible dans t("texto en español") ; si une traduction
// catalane existe dans CA, on la renvoie, sinon on retombe sur l'espagnol (jamais cassé).
export type Lang = "es" | "ca";
export const LANG_COOKIE = "aproba.lang";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "es", label: "Español" },
  { code: "ca", label: "Català" },
];

// Traductions catalanes. Clé = chaîne espagnole exacte telle qu'écrite dans le code.
export const CA: Record<string, string> = {
  // ── Navigation / shell ──
  "Inicio": "Inici",
  "Expedientes": "Expedients",
  "Clientes": "Clients",
  "Facturas": "Factures",
  "Ajustes": "Configuració",
  "+ Nuevo expediente": "+ Nou expedient",
  "+ Nuevo": "+ Nou",

  // ── Dashboard ──
  "Hola": "Hola",
  "Resumen de tu actividad": "Resum de la teva activitat",
  "Expedientes activos": "Expedients actius",
  "Pendientes de validar": "Pendents de validar",
  "Listos para presentar": "A punt per presentar",
  "Facturado este mes": "Facturat aquest mes",
  "Tablero": "Tauler",
  "Ver todos": "Veure tots",
  "Vacío": "Buit",
  "Archivados": "Arxivats",
  "Activos": "Actius",

  // ── Ajustes ──
  "Configura tus servicios, los avisos a tus clientes y los datos de tu despacho.": "Configura els teus serveis, els avisos als teus clients i les dades del teu despatx.",
  "Servicios": "Serveis",
  "Trámites, pagos y documentos que pide cada uno": "Tràmits, pagaments i documents que demana cadascun",
  "Notificaciones al cliente": "Notificacions al client",
  "Avisos automáticos por WhatsApp o email en cada paso": "Avisos automàtics per WhatsApp o email a cada pas",
  "Plan y equipo": "Pla i equip",
  "Despacho y cuenta": "Despatx i compte",
  "Datos de tu gestoría y de tu usuario": "Dades de la teva gestoria i del teu usuari",
  "Despacho": "Despatx",
  "Cuenta": "Compte",
  "usuario": "usuari",
  "usuarios": "usuaris",
  "Nombre": "Nom",
  "Tipo": "Tipus",
  "Plan": "Pla",
  "Email": "Email",
  "Idioma": "Idioma",
  "Idioma de la interfaz": "Idioma de la interfície",
  "Elige el idioma en el que quieres ver Aproba.": "Tria l'idioma en què vols veure Aproba.",
  "Solo los administradores pueden editar los ajustes. Tu rol ({rol}) tiene acceso de solo lectura.": "Només els administradors poden editar la configuració. El teu rol ({rol}) té accés de només lectura.",
  "Las cuentas bancarias solo son accesibles para los administradores.": "Els comptes bancaris només són accessibles per als administradors.",
  "Instala Aproba como app": "Instal·la Aproba com a app",
  "Accede a Aproba desde tu pantalla de inicio, como una aplicación, sin abrir el navegador.": "Accedeix a Aproba des de la teva pantalla d'inici, com una aplicació, sense obrir el navegador.",
  "Instalar la app": "Instal·la l'app",
  "Abre Aproba en Chrome, Edge o Safari y usa la opción «Instalar» / «Añadir a la pantalla de inicio» del navegador.": "Obre Aproba a Chrome, Edge o Safari i fes servir l'opció «Instal·la» / «Afegeix a la pantalla d'inici» del navegador.",
  "En iPhone/iPad: pulsa Compartir y luego «Añadir a la pantalla de inicio».": "A l'iPhone/iPad: prem Comparteix i després «Afegeix a la pantalla d'inici».",
};

export function translate(lang: Lang, es: string): string {
  return lang === "ca" ? (CA[es] ?? es) : es;
}
