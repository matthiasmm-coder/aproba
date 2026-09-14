// Observabilité navigateur (Sentry). NO-OP tant que NEXT_PUBLIC_SENTRY_DSN n'est
// pas défini. Installe les handlers globaux (window.onerror / unhandledrejection).
//
// Import DYNAMIQUE et conditionné au DSN (14/09/2026) : avec `import * as Sentry` en tête
// de fichier, Next mettait tout le SDK (~70 Ko gzip) dans le chunk partagé de TOUTES les
// pages, DSN ou pas — un tiers du JS initial de la landing pour un init qui ne tournait
// jamais. Ici, sans DSN le code est mort et le SDK n'est jamais téléchargé ; avec DSN il
// se charge juste après l'hydratation (les erreurs des toutes premières millisecondes
// peuvent lui échapper, compromis assumé).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  // Les erreurs survenues avant l'arrivée du SDK sont mises en file et rejouées à l'init.
  const cola: unknown[] = [];
  const onError = (e: ErrorEvent) => { cola.push(e.error ?? e.message); };
  const onRechazo = (e: PromiseRejectionEvent) => { cola.push(e.reason); };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRechazo);
  // webpackExports : sans lui, import() embarque TOUT l'espace de noms du SDK (replay,
  // feedback, tracing… ~190 Ko gzip au lieu de ~90) — vu en prod le 14/09.
  const cargar = () => import(/* webpackExports: ["init", "captureException"] */ "@sentry/nextjs").then((Sentry) => { Sentry.init({
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
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRechazo);
    for (const e of cola.splice(0)) Sentry.captureException(e);
  }).catch(() => {});
  // Chargé 2,5 s après `load`, dans un creux d'inactivité : lancé dès l'hydratation, le SDK
  // partait avant le LCP observé et Lighthouse/PSI le comptait dans le LCP (3,5 s vs 1,3 s).
  // Les erreurs de l'intervalle sont dans `cola` : rien n'est perdu.
  const enHueco = () => window.setTimeout(() => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cargar, { timeout: 5000 }); else cargar(); }, 2500);
  if (document.readyState === "complete") enHueco(); else window.addEventListener("load", enHueco, { once: true });
}
