import * as Sentry from "@sentry/nextjs";

// Observabilité serveur (Sentry). NO-OP tant que SENTRY_DSN n'est pas défini :
// crée un compte Sentry gratuit → projet Next.js → colle le DSN serveur dans
// SENTRY_DSN (Vercel, Production). Source maps = amélioration ultérieure (withSentryConfig + SENTRY_AUTH_TOKEN).
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      // Ne pas envoyer de corps de requête (peuvent contenir des PII : passeports, NIE).
      sendDefaultPii: false,
    });
  }
}

// Capture automatiquement les erreurs des Server Components / route handlers (Next 15).
export const onRequestError = Sentry.captureRequestError;
