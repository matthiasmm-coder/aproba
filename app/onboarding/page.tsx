import { redirect } from "next/navigation";
import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { OnboardingForm } from "@/components/onboarding-form";
import { createSupabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Configura tu despacho" };

// Étape post-inscription : l'utilisateur est authentifié mais n'a pas encore de
// workspace. S'il en a déjà un (membre), on le renvoie vers l'app.
export default async function Onboarding() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: mem } = await supabase.from("Membership").select("id").limit(1).maybeSingle();
  if (mem) redirect("/app");

  const nombre = (user.user_metadata?.nombre as string) || user.email || "";
  const primerNombre = nombre.split(" ")[0];

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="flex h-16 items-center justify-between px-6">
        <Link href="/"><AprobaLogo size={28} /></Link>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <div className="mb-8">
          <p className="text-sm font-semibold text-aproba-700">Casi listo{primerNombre ? `, ${primerNombre}` : ""} 👋</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900 sm:text-3xl">Configura tu despacho</h1>
          <p className="mt-2 text-slate-500">
            Serás el <strong className="font-semibold text-slate-700">administrador</strong> de este espacio: podrás invitar a tu equipo y asignar roles cuando quieras.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <OnboardingForm defaultNombre={nombre} />
        </div>
      </main>
    </div>
  );
}
