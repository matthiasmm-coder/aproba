import Link from "next/link";
import { AprobaLogo } from "@/components/logo";

// Chrome de las páginas «beneficio explicado» (/funciones, /cifras, /garantias): el mismo
// esqueleto sobrio que los artículos — cabecera con vuelta a la portada y pie orientado a
// conversión, porque quien llega desde un buscador no ha visto nunca la landing.
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" title="Volver al inicio">
            <AprobaLogo size={28} />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/#funciones" className="hidden text-sm font-medium text-slate-500 transition hover:text-slate-800 sm:inline">Funciones</Link>
            <Link href="/articulos" className="text-sm font-medium text-slate-500 transition hover:text-slate-800">Artículos</Link>
            <Link href="/signup?modo=prueba" className="whitespace-nowrap rounded-lg bg-aproba-600 px-2.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-aproba-700 sm:px-4">
              <span className="min-[360px]:hidden">Prueba</span>
              <span className="hidden min-[360px]:inline">Prueba 15 días gratis</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-8 text-xs text-slate-500 sm:px-6">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/" className="hover:text-slate-700">Inicio</Link>
            <Link href="/software-de-extranjeria" className="hover:text-slate-700">Software de extranjería</Link>
            <Link href="/precios" className="hover:text-slate-700">Precios</Link>
            <Link href="/para/gestorias" className="hover:text-slate-700">Para gestorías</Link>
            <Link href="/para/abogados" className="hover:text-slate-700">Para abogados</Link>
            <Link href="/articulos" className="hover:text-slate-700">Artículos</Link>
            <Link href="/legal/aviso-legal" className="hover:text-slate-700">Aviso legal</Link>
            <Link href="/legal/privacidad" className="hover:text-slate-700">Privacidad</Link>
            <Link href="/legal/dpa" className="hover:text-slate-700">DPA</Link>
            <a href="mailto:hola@aproba-software.com" className="hover:text-slate-700">Contacto</a>
          </div>
          <p className="mt-4">© {new Date().getFullYear()} Aproba. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
