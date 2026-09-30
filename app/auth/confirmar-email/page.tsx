import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { ConfirmarEmail } from "@/components/confirmar-email";
import { emailDelToken } from "@/lib/cambio-email";

// Página de servicio; título y descripción propios (ver app/forgot-password).
export const metadata = {
  title: "Confirma el nuevo email de tu cuenta",
  description: "Confirma la nueva dirección de email de tu cuenta de Aproba.",
  robots: { index: false, follow: false },
};

export default async function ConfirmarEmailPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/"><AprobaLogo size={34} /></Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">Confirma tu nuevo email</h1>
          <p className="mt-1 text-sm text-slate-500">Para tu cuenta de Aproba.</p>
          <ConfirmarEmail token={t} email={emailDelToken(t)} />
        </div>
      </div>
    </div>
  );
}
