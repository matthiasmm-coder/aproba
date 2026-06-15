import { readFileSync } from "node:fs";
import Stripe from "stripe";

// Charge .env.local
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
console.log("Stripe key mode:", env.STRIPE_SECRET_KEY.startsWith("sk_live") ? "LIVE" : env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "TEST" : "?", "len", env.STRIPE_SECRET_KEY.length);

const rest = (path) => fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } }).then(r => r.json());

const EMAIL = "matthias.merlemounier@gmail.com";
// 1) user
const u = await fetch(`${SUPA}/auth/v1/admin/users?page=1&per_page=200`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } }).then(r => r.json());
const user = (u.users || []).find(x => x.email === EMAIL);
console.log("\n=== USER ===", user ? { id: user.id, email: user.email } : "NOT FOUND");
if (!user) process.exit(0);

// 2) memberships
const mems = await rest(`Membership?userId=eq.${user.id}&select=id,role,workspaceId`);
console.log("\n=== MEMBERSHIPS ===", JSON.stringify(mems, null, 2));

for (const m of mems) {
  const subs = await rest(`Subscription?workspaceId=eq.${m.workspaceId}&select=*`);
  const ws = await rest(`Workspace?id=eq.${m.workspaceId}&select=nombre,tipo`);
  console.log(`\n=== WORKSPACE ${m.workspaceId} (${ws[0]?.nombre}) role=${m.role} ===`);
  const s = subs[0];
  console.log("Subscription:", s ? {
    plan: s.plan, estado: s.estado, trialEndsAt: s.trialEndsAt,
    stripeCustomerId: s.stripeCustomerId, stripeSubscriptionId: s.stripeSubscriptionId,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  } : "NONE");

  if (s?.stripeCustomerId) {
    try {
      const cust = await stripe.customers.retrieve(s.stripeCustomerId, { expand: ["invoice_settings.default_payment_method"] });
      const dpm = cust.invoice_settings?.default_payment_method;
      console.log("  customer.invoice_settings.default_payment_method:", dpm ? (typeof dpm === "string" ? dpm : `${dpm.card?.brand} ****${dpm.card?.last4}`) : "NONE");
      const pms = await stripe.paymentMethods.list({ customer: s.stripeCustomerId, type: "card", limit: 5 });
      console.log("  paymentMethods.list(card):", pms.data.length, "→", pms.data.map(p => `${p.card.brand} ****${p.card.last4} (${p.id})`));
    } catch (e) { console.log("  Stripe customer error:", e.message); }
    if (s.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(s.stripeSubscriptionId, { expand: ["default_payment_method"] });
        const sdpm = sub.default_payment_method;
        console.log("  subscription.status:", sub.status, "default_payment_method:", sdpm ? (typeof sdpm === "string" ? sdpm : `${sdpm.card?.brand} ****${sdpm.card?.last4}`) : "NONE");
      } catch (e) { console.log("  Stripe subscription error:", e.message); }
    }
  } else {
    console.log("  → pas de stripeCustomerId : aucun checkout abouti pour ce workspace.");
  }
}
