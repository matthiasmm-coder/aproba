import type { MetadataRoute } from "next";

// Manifest PWA — permet aux gestorías/avocats d'installer Aproba comme une app.
// Servi par Next à /manifest.webmanifest (lien injecté automatiquement).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aproba — Expedientes de extranjería",
    short_name: "Aproba",
    description: "Valida documentos con IA, genera los formularios EX y 790-012 y haz el seguimiento de tus expedientes.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    background_color: "#fdfcfb",
    theme_color: "#0E8C5F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
