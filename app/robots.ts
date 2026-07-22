import type { MetadataRoute } from "next";

// Indexation : la landing et les páginas legales, jamais la app ni los portales
// (los enlaces /j //s //f llevan el token en la URL — nunca deben acabar en un índice).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/api", "/j/", "/s/", "/portal", "/onboarding", "/pagar", "/prueba", "/empezar"],
      },
    ],
    sitemap: "https://aproba-software.com/sitemap.xml",
  };
}
