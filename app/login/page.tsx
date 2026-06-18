import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Entrar" };

export default function Login() {
  // La cuenta de demostración solo se muestra en desarrollo o si se activa
  // explícitamente (NEXT_PUBLIC_SHOW_DEMO_LOGIN=1) — oculta por defecto en producción.
  const mostrarDemo =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === "1";
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <AprobaLogo size={34} />
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">Entrar en Aproba</h1>
          <p className="mt-1 text-sm text-slate-500">Accede a tus expedientes.</p>

          <LoginForm />
        </div>

        {/* Cuenta de demostración — oculta en producción salvo NEXT_PUBLIC_SHOW_DEMO_LOGIN=1 */}
        {mostrarDemo && (
          <div className="mt-4 rounded-xl border border-aproba-100 bg-aproba-50 px-4 py-3 text-sm text-aproba-700">
            <p className="font-semibold">Cuenta de demostración</p>
            <p className="mt-0.5 font-mono text-xs">demo@aproba-software.com · AprobaDemo2026!</p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="font-semibold text-aproba-700 hover:underline">Empieza gratis</Link>
        </p>
      </div>
    </div>
  );
}
