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
    denyUrls: [
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari(-web)?-extension:\/\//i,
      /app:\/\/\/executors\//i, // script injecté vu en prod (aucun fichier de ce nom chez nous)
    ],
  });
}
