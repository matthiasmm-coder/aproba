// Service worker minimal d'Aproba : suffisant pour rendre la PWA installable
// (Chrome exige un handler `fetch`). Pas de cache agressif pendant la beta — les
// déploiements sont fréquents, on évite de servir une version périmée.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Passthrough réseau : le navigateur gère la requête normalement.
  // La présence de ce handler satisfait le critère d'installabilité.
});
