import Link from "next/link";
import { redirect } from "next/navigation";
import { AprobaLogo, AprobaMark } from "@/components/logo";
import { SidebarNav, MobileNav } from "@/components/sidebar-nav";
import { LogoutButton } from "@/components/logout-button";
import { AvatarUploader } from "@/components/avatar-uploader";
import { FeedbackWidget } from "@/components/feedback-widget";
import { ConfirmHost } from "@/components/confirm-dialog";
import { LangProvider } from "@/components/lang-provider";
import { createSupabaseServer } from "@/lib/supabase/server";
import { stripeDisponible } from "@/lib/billing";
import { getLang, getT } from "@/lib/app-lang";

// Session + workspace réels (Supabase). Fallback mock le temps de la migration.
// Renvoie "SIN_WORKSPACE" si l'utilisateur est authentifié mais sans appartenance
// (juste après l'inscription) → l'app le redirige vers /onboarding.
async function getContexto() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const nombre = (user.user_metadata?.nombre as string) || user.email || "Usuario";
    const perfilP = supabase.from("User").select("avatarUrl").eq("id", user.id).maybeSingle();
    // Défensif : si la colonne modoPrueba n'existe pas encore (migration pas appliquée),
    // on réessaie sans elle → l'app ne casse jamais (le testeur degrade en essai normal).
    let memRes = await supabase.from("Membership").select("Workspace(nombre, Subscription(plan, estado, stripeCustomerId, stripeSubscriptionId, trialEndsAt, modoPrueba))").limit(1).maybeSingle();
    if (memRes.error) {
      memRes = await supabase.from("Membership").select("Workspace(nombre, Subscription(plan, estado, stripeCustomerId, trialEndsAt))").limit(1).maybeSingle();
    }
    const mem = memRes.data;
    const { data: perfil } = await perfilP;
    if (!mem) return "SIN_WORKSPACE" as const;
    type SubInfo = { plan?: string; estado?: string; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; trialEndsAt?: string | null; modoPrueba?: boolean | null };
    const ws = (mem as { Workspace?: { nombre?: string; Subscription?: SubInfo | SubInfo[] } } | null)?.Workspace;
    // PostgREST renvoie la relation 1-1 Subscription comme tableau (créée via index unique).
    const subRaw = ws?.Subscription;
    const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw;
    const plan = sub?.plan;
    // Garde essai / carte. Un despacho en essai sans customer Stripe :
    //  - essai TESTEUR (modoPrueba) : on laisse passer 30 j gratuits ; à l'expiration → blocage (s'abonner).
    //  - essai NORMAL : carte obligatoire d'emblée (SIN_TARJETA).
    // La démo (estado ACTIVA) est exemptée ; sans Stripe configuré, on n'impose rien.
    if (stripeDisponible() && sub?.estado === "TRIAL") {
      const expirado = sub?.trialEndsAt ? Date.parse(sub.trialEndsAt) <= Date.now() : false;
      if (!sub?.stripeCustomerId) {
        if (sub?.modoPrueba) {
          if (expirado) return "PRUEBA_EXPIRADA" as const;
        } else {
          return "SIN_TARJETA" as const;
        }
      } else if (expirado && !sub?.stripeSubscriptionId) {
        // Customer créé (checkout OUVERT) mais souscription jamais terminée : sans ce blocage,
        // commencer un paiement puis fermer l'onglet donnait un accès gratuit illimité après
        // l'essai. Ceux qui ONT une souscription restent gérés par Stripe + la réconciliation
        // (on ne verrouille jamais un payeur sur un simple retard de webhook).
        return "PRUEBA_EXPIRADA" as const;
      }
    }
    return {
      usuario: nombre,
      iniciales: nombre.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
      avatarUrl: (perfil as { avatarUrl?: string | null } | null)?.avatarUrl ?? null,
      workspace: ws?.nombre ?? "Mi despacho",
      plan: plan ? plan.charAt(0) + plan.slice(1).toLowerCase() : "Starter",
    };
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctxOrSentinel = await getContexto();
  if (ctxOrSentinel === "SIN_WORKSPACE") redirect("/onboarding");
  if (ctxOrSentinel === "SIN_TARJETA") redirect("/onboarding/pago");
  if (ctxOrSentinel === "PRUEBA_EXPIRADA") redirect("/onboarding/pago?prueba=expirada");
  // Repli neutre (jamais la démo) si le contexte échoue à charger.
  const ctx = ctxOrSentinel ?? {
    usuario: "Mi cuenta",
    iniciales: "··",
    avatarUrl: null,
    workspace: "Mi despacho",
    plan: "Starter",
  };
  const lang = await getLang();
  const t = await getT();

  return (
    <LangProvider lang={lang}>
    <div className="flex min-h-screen bg-cream-50">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex print:hidden">
        <div className="flex h-16 items-center px-5">
          <Link href="/"><AprobaLogo size={26} /></Link>
        </div>
        <SidebarNav />
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <AvatarUploader iniciales={ctx.iniciales} avatarUrl={ctx.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{ctx.usuario}</p>
              <p className="truncate text-xs text-slate-400">{ctx.workspace}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Contenu */}
      <div className="min-w-0 flex-1 md:pl-60 print:pl-0">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-cream-50/80 px-4 backdrop-blur sm:px-6 print:hidden">
          <div className="flex items-center gap-2">
            <Link href="/" className="md:hidden"><AprobaMark size={24} /></Link>
            <span className="hidden text-sm font-semibold text-slate-800 sm:inline">{ctx.workspace}</span>
            <span className="rounded-full bg-aproba-100 px-2 py-0.5 text-xs font-semibold text-aproba-700">{ctx.plan}</span>
          </div>
          <Link href="/app/expedientes/nuevo" className="rounded-lg bg-aproba-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-aproba-700 sm:px-4">
            <span className="sm:hidden">{t("+ Nuevo")}</span><span className="hidden sm:inline">{t("+ Nuevo expediente")}</span>
          </Link>
        </header>
        <main className="p-4 pb-24 sm:p-6 md:pb-6 print:p-0">{children}</main>
      </div>

      {/* Bouton de feedback flottant (beta) */}
      <FeedbackWidget />
      <ConfirmHost />

      {/* Nav mobile (bas) */}
      <MobileNav />
    </div>
    </LangProvider>
  );
}
