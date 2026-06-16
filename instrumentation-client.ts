import * as Sentry from "@sentry/nextjs";

// Observabilité navigateur (Sentry). NO-OP tant que NEXT_PUBLIC_SENTRY_DSN n'est
// pas défini. Installe les handlers globaux (window.onerror / unhandledrejection).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false, // jamais de PII (le portail manie passeports/NIE)
  });
}
