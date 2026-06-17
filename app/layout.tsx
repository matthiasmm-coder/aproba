import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "Aproba — Automatiza tus expedientes de extranjería",
    template: "%s · Aproba",
  },
  description:
    "Aproba valida documentos con IA, genera los formularios EX y 790-012, y hace el seguimiento de tus expedientes. Para gestorías y abogados de extranjería en España.",
  applicationName: "Aproba",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Aproba" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
