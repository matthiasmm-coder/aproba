import { redirect } from "next/navigation";
import Link from "next/link";
import { AprobaLogo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ActivarPrueba } from "@/components/activar-prueba";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { reconciliarSuscripcion } from "@/lib/billing";

// Le titre suit le cas : dire « Activa tu prueba » à quelqu'un dont l'essai vient
// d'expirer contredit l'écran lui-même (il ne commence rien, il continue).
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ prueba?: string }> }) {
  return { title: (await searchParams)?.prueba === "expirada" ? "Continúa con Aproba" : "Activa tu prueba" };
}

// Page de récupération : la garde du layout /app envoie ici
//  - un despacho en essai NORMAL sans carte (carte requise pour démarrer l'essai 14 j) ;
//  - un essai TESTEUR expiré (?prueba=expirada) → « ta prueba a fini, abonne-toi pour continuer ».
export default async function OnboardingPago({ searchParams }: { searchParams: Promise<{ prueba?: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const expirada = (await searchParams)?.prueba === "expirada";

  // Workspace résolu SOUS SESSION (RLS) — jamais depuis un paramètre : on n'agit
  // ensuite en service_role que sur le despacho dont l'utilisateur est bien membre.
  let workspaceId: string | null = null;
  let plan: string | null = null;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  try {
    const { data } = await supabase
      .from("Membership")
      .select("workspaceId, Workspace(Subscription(plan, stripeCustomerId, stripeSubscriptionId))")
      .limit(1)
      .maybeSingle();
    workspaceId = (data as { workspaceId?: string } | null)?.workspaceId ?? null;
    const w = (data as { Workspace?: unknown } | null)?.Workspace;
    const ws = (Array.isArray(w) ? w[0] : w) as { Subscription?: unknown } | null;
    const sub = (Array.isArray(ws?.Subscription) ? ws?.Subscription[0] : ws?.Subscription) as
      { plan?: string; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null } | null;
    if (sub?.plan) plan = String(sub.plan);
    stripeCustomerId = sub?.stripeCustomerId ?? null;
    stripeSubscriptionId = sub?.stripeSubscriptionId ?? null;
  } catch { /* écran générique */ }

  // ── Auto-réparation du décalage webhook ──────────────────────────────────────
  // Stripe renvoie l'utilisateur dans l'app avant, parfois, d'avoir livré
  // `customer.subscription.created`. Sans ceci, un despacho qui VIENT de payer est
  // renvoyé sur cet écran de paiement — il croit que sa carte a échoué et paie deux
  // fois. On demande la vérité à Stripe et on ouvre l'accès si l'abonnement existe.
  // On ne redirige JAMAIS sur la seule foi de la DB (une ligne incohérente ferait
  // une boucle infinie avec le garde du layout) : uniquement après avoir confirmé
  // auprès de Stripe qu'un abonnement vivant existe ET réécrit la ligne.
  if (stripeCustomerId && workspaceId && !stripeSubscriptionId) {
    const admin = createSupabaseAdmin();
    if (await reconciliarSuscripcion(admin, workspaceId, stripeCustomerId)) redirect("/app");
  }

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
          {expirada ? (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tightest text-slate-900">Tu mes de prueba ha terminado</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Esperamos que Aproba te haya sido útil. <strong className="font-semibold text-slate-800">Para seguir accediendo a tu cuenta, activa tu suscripción.</strong> Puedes cancelar cuando quieras desde Ajustes.
              </p>
              {/* Quien choca con un muro de pago piensa primero en sus datos: decirlo explícitamente. */}
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                Tus expedientes, clientes y documentos están guardados tal y como los dejaste. Al activar tu plan lo recuperas todo al instante.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tightest text-slate-900">Empieza tu mes de prueba</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Para activar tu cuenta, añade una tarjeta. <strong className="font-semibold text-slate-800">No se cobra nada durante 1 mes.</strong> Al terminar la prueba se cobrará tu plan, y puedes cancelar cuando quieras desde Ajustes.
              </p>
            </>
          )}
          <div className="mt-6">
            <ActivarPrueba expirada={expirada} plan={plan} />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Pago seguro con Stripe
          </p>
          {/* Salida humana: un muro de pago sin puerta genera pánico, no conversión. */}
          <p className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
            ¿Dudas o algún problema con el pago?{" "}
            <a href="mailto:hola@aproba-software.com" className="font-medium text-aproba-700 hover:underline">hola@aproba-software.com</a>
          </p>
        </div>
      </main>
    </div>
  );
}
