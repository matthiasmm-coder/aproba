import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";

export const metadata: Metadata = {
  title: {
    default: "Aproba — Automatiza tus expedientes de extranjería",
    template: "%s · Aproba",
  },
  description:
    "Aproba valida documentos con IA, genera los formularios EX y 790-012, y hace el seguimiento de tus expedientes. Para gestorías y abogados de extranjería en España.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
