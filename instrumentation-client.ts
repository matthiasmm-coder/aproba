import * as Sentry from "@sentry/nextjs";

// Observabilité navigateur (Sentry). NO-OP tant que NEXT_PUBLIC_SENTRY_DSN n'est
// pas défini. Installe les handlers globaux (window.onerror / unhandledrejection).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false, // jamais de PII (le portail manie passeports/NIE)
    // Bruit des extensions de navigateur des usagers : leurs scripts injectés plantent
    // SUR notre page et Sentry nous le facture comme si c'était nous (cas réel 13/08 :
    // «executors/200.js» → TypeError M_ID chez un cliente). On écarte les frames dont
    // l'URL n'est pas la nôtre — jamais nos propres erreurs.
    // Algunos errores de extensión NO traen fichero propio: se atribuyen a nuestra
    // página y denyUrls no los ve (caso real 19/08: «Invalid call to
    // runtime.sendMessage(). Tab not found.», la API de extensiones hablando con una
    // pestaña ya cerrada). Se filtran por mensaje. Ninguno de estos textos puede
    // salir de nuestro código: son del navegador o de sus extensiones.
    ignoreErrors: [
      /runtime\.sendMessage/i,          // extensión hablando con una pestaña cerrada
      /Extension context invalidated/i,  // extensión recargada mientras la página vivía
      /message port closed before a response/i,
      /ResizeObserver loop/i,            // ruido clásico del navegador, sin impacto
      /Non-Error promise rejection captured with value: undefined/i,
    ],
    denyUrls: [
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari(-web)?-extension:\/\//i,
      /app:\/\/\/executors\//i, // script injecté vu en prod (aucun fichier de ce nom chez nous)
    ],
  });
}
