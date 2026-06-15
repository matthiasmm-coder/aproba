import { redirect } from "next/navigation";
import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ActivarPrueba } from "@/components/activar-prueba";
import { createSupabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Activa tu prueba" };

// Page de récupération : la garde du layout /app envoie ici un despacho en essai
// qui n'a pas encore posé de carte. La carte est requise pour démarrer la prueba
// (essai 14 j gratuit, aucun débit avant la fin).
export default async function OnboardingPago() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="flex h-16 items-center justify-between px-6">
        <Link href="/"><AprobaLogo size={28} /></Link>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 pb-20 pt-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-aproba-50 text-aproba-600">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tightest text-slate-900">Empieza tu prueba de 14 días</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Para activar tu cuenta, añade una tarjeta. <strong className="font-semibold text-slate-800">No se cobra nada durante 14 días.</strong> Al terminar la prueba se cobrará tu plan, y puedes cancelar cuando quieras desde Ajustes.
          </p>
          <div className="mt-6">
            <ActivarPrueba />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Pago seguro con Stripe
          </p>
        </div>
      </main>
    </div>
  );
}
