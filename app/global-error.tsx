"use client";

import { useEffect } from "react";

// Error boundary RACINE (remplace tout le document si le layout lui-même crashe).
// Doit rendre ses propres <html>/<body>. Styles inline (le CSS global peut ne pas
// être chargé à ce stade). Brancher Sentry.captureException ici aussi plus tard.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdfcfb", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>Algo ha fallado</h1>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>Ha ocurrido un error inesperado. Vuelve a intentarlo en unos segundos.</p>
          <button onClick={() => reset()} style={{ marginTop: 16, background: "#0E8C5F", color: "#fff", border: 0, padding: "10px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Reintentar</button>
        </div>
      </body>
    </html>
  );
}
