import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Empieza gratis" };

export default function Signup() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <AprobaLogo size={34} />
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-slate-500">Empieza a gestionar tus expedientes de extranjería en minutos.</p>

          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-aproba-700 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
