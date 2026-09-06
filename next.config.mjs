/** @type {import('next').NextConfig} */

// Cabeceras de seguridad para TODA la app (portales públicos incluidos).
// Sin CSP estricta por ahora: Next inyecta scripts inline sin nonce y una CSP mal
// calibrada rompe la app entera — pendiente de hacerse con nonces si hace falta.
const securityHeaders = [
  // HTTPS siempre (Vercel ya sirve https; esto fija el pin en el navegador).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Nada de Aproba se embebe en iframes (portales con datos de pasaporte/NIE).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  // La bandeja de entrada vive en Ajustes → Integraciones desde el 06/09/2026; la ruta
  // antigua (emails ya enviados, marcadores) redirige a la sección abierta. Redirección
  // HTTP real (307): un redirect() en la página llegaba tras el streaming del layout y
  // se convertía en un <meta refresh> de 1 s.
  async redirects() {
    return [{ source: "/app/bandeja", destination: "/app/ajustes?abrir=integraciones", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
