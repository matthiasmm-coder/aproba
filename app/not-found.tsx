import Link from "next/link";
import { AprobaLogo } from "@/components/logo";

export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 text-center">
      <Link href="/"><AprobaLogo size={32} /></Link>
      <p className="mt-10 text-7xl font-bold tracking-tightest text-aproba-600">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-800">Página no encontrada</h1>
      <p className="mt-2 max-w-sm leading-relaxed text-slate-500">La página que buscas no existe o se ha movido.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400">Volver al inicio</Link>
        <Link href="/app" className="rounded-lg bg-aproba-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aproba-700">Ir a la app</Link>
      </div>
    </div>
  );
}
