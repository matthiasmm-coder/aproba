import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LegalNav } from "@/components/legal-nav";
import { TITULAR } from "@/lib/legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-50">
      {/* Cabecera */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Volver al inicio">
            <AprobaLogo size={28} />
          </Link>
          <Link href="/" className="text-sm text-slate-500 transition hover:text-slate-800">
            ← Volver al inicio
          </Link>
        </div>
      </header>

      {/* Navegación entre páginas legales */}
      <div className="mx-auto max-w-3xl px-6 pt-8">
        <LegalNav />
      </div>

      {/* Contenido */}
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>

      {/* Pie */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-6 py-8 text-xs text-slate-400">
          © {new Date().getFullYear()} {TITULAR.nombreComercial}. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}
