import { redirect } from "next/navigation";
import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { OnboardingForm } from "@/components/onboarding-form";
import { createSupabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Configura tu despacho" };

// Étape post-inscription : l'utilisateur est authentifié mais n'a pas encore de
// workspace. S'il en a déjà un (membre), on le renvoie vers l'app…
// …SAUF (05/09/2026) si ce workspace vient d'être créé à l'étape 1 du wizard et que
// l'essai n'a pas encore de carte : on REPREND le wizard à l'étape 2 avec ce qui est
// déjà en base, au lieu de renvoyer vers l'app et son mur de paiement. Un testeur
// (modoPrueba) ou un despacho avec client Stripe a fini son alta → l'app, comme avant.
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
          <h1 className="mt-1 text-2xl font-bold tracking-tightest text-slate-900 sm:text-3xl">Crea tu despacho</h1>
          <p className="mt-2 text-slate-500">
            Un minuto. Todo lo demás lo harás dentro, paso a paso, con un expediente de ejemplo ya resuelto esperándote.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <OnboardingForm defaultNombre={nombre} />
        </div>
      </main>
    </div>
  );
}
