// Textos del aviso de cookies, aparte del diccionario del portal (lib/portal-i18n.ts).
// Motivo: el aviso vive en el root layout (todas las páginas) y al importar makeT arrastraba
// el diccionario entero de 8 idiomas (~46 KB gzip) a la carga inicial de la portada, para
// tres frases. lib/cookie-textos.test.ts garantiza que siguen siendo las mismas del portal.
export type LangCookie = "es" | "en" | "fr" | "it" | "de" | "ar" | "ro" | "zh";
export const LANGS_COOKIE: LangCookie[] = ["es", "en", "fr", "it", "de", "ar", "ro", "zh"];
export const esLangCookie = (v: string | null | undefined): v is LangCookie => Boolean(v && (LANGS_COOKIE as string[]).includes(v));
// Como detectarLang del portal: prefijo de navigator.language si es uno de los 8, si no «es».
export function detectarLangCookie(): LangCookie {
  if (typeof navigator === "undefined") return "es";
  const n = (navigator.language || "es").slice(0, 2).toLowerCase();
  return esLangCookie(n) ? n : "es";
}
type Frases = { texto: string; politica: string; ok: string };
const TEXTOS: Partial<Record<LangCookie, Frases>> = {
  es: { texto: "Usamos solo cookies técnicas necesarias para que la plataforma funcione. Más información en la", politica: "Política de cookies", ok: "Entendido" },
  en: { texto: "We only use technical cookies needed for the platform to work. More information in the", politica: "Cookie policy", ok: "Got it" },
  fr: { texto: "Nous n'utilisons que des cookies techniques nécessaires au fonctionnement de la plateforme. Plus d'informations dans la", politica: "Politique de cookies", ok: "Compris" },
  it: { texto: "Usiamo solo cookie tecnici necessari al funzionamento della piattaforma. Maggiori informazioni nella", politica: "Politica dei cookie", ok: "Capito" },
  de: { texto: "Wir verwenden nur technisch notwendige Cookies. Mehr Informationen in der", politica: "Cookie-Richtlinie", ok: "Verstanden" },
};
// Mismo repliegue que el portal (pick → tr.es): ar/ro/zh no tienen estas frases y ven el español.
export const textosCookie = (lang: LangCookie): Frases => TEXTOS[lang] ?? TEXTOS.es!;
