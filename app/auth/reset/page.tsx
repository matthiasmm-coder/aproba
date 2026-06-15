import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Nueva contraseña" };

export default function ResetPassword() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/"><AprobaLogo size={34} /></Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">Elige una nueva contraseña</h1>
          <p className="mt-1 text-sm text-slate-500">Para tu cuenta de Aproba.</p>
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
