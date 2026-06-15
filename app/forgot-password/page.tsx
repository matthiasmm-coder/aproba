import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Recuperar contraseña" };

export default function ForgotPassword() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/"><AprobaLogo size={34} /></Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">¿Olvidaste tu contraseña?</h1>
          <p className="mt-1 text-sm text-slate-500">Te enviamos un enlace para crear una nueva.</p>
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
