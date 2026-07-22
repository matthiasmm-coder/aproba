import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  metadataBase: new URL("https://aproba-software.com"),
  title: {
    default: "Aproba — Automatiza tus expedientes de extranjería",
    template: "%s · Aproba",
  },
  description:
    "Aproba valida documentos con IA, genera los formularios EX y 790-012, y hace el seguimiento de tus expedientes. Para gestorías y abogados de extranjería en España.",
  applicationName: "Aproba",
  // Tarjeta al compartir el enlace (WhatsApp, LinkedIn, email…) — antes el enlace salía desnudo.
  openGraph: {
    type: "website",
    siteName: "Aproba",
    locale: "es_ES",
    url: "/",
    title: "Aproba — Automatiza tus expedientes de extranjería",
    description: "La IA valida los documentos, genera los formularios oficiales y vigila cada renovación. Para gestorías y abogados de extranjería.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Aproba — automatiza tus expedientes de extranjería" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aproba — Automatiza tus expedientes de extranjería",
    description: "La IA valida los documentos, genera los formularios oficiales y vigila cada renovación.",
    images: ["/og.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Aproba" },
  // Favicon: PNG determinista generado desde la marca de la plataforma (el SVG con <text>
  // dependía de la fuente del sistema y salía una «a» en vez del α). app/favicon.ico cubre
  // los navegadores que piden /favicon.ico directamente.
  icons: { icon: "/icon.png?v=2", apple: "/apple-touch-icon.png?v=2" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin esto, env(safe-area-inset-*) vale 0 en iPhone y la tab bar queda bajo la barra home.
  viewportFit: "cover",
  themeColor: "#0E8C5F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <CookieNotice />
        <PwaRegister />
      </body>
    </html>
  );
}
