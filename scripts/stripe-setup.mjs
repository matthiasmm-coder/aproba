// Crée les produits/prix Stripe d'Aproba (idempotent, mode test ou live selon la clé).
// Lancer : node scripts/stripe-setup.mjs   (lit web/.env.local → STRIPE_SECRET_KEY)
// - 3 produits « Aproba Starter/Pro/Business » avec prix mensuel EUR et lookup_key
//   stable (aproba_*_mensual) — le code résout les prix par lookup_key, jamais par ID.
// - 1 configuration du Customer Portal (moyen de paiement, facturas, anulación).
import { readFileSync } from "node:fs";
import Stripe from "stripe";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

if (!env.STRIPE_SECRET_KEY) {
  console.error("✗ STRIPE_SECRET_KEY manquante dans web/.env.local");
  process.exit(1);
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const modo = env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "TEST" : "LIVE";
console.log(`Stripe en mode ${modo}\n`);

const PLANES = [
  { lookup: "aproba_starter_mensual", nombre: "Aproba Starter", importe: 4900 },
  { lookup: "aproba_pro_mensual", nombre: "Aproba Pro", importe: 9900 },
  { lookup: "aproba_business_mensual", nombre: "Aproba Business", importe: 19900 },
];

const existentes = await stripe.prices.list({ lookup_keys: PLANES.map((p) => p.lookup), limit: 10 });
const porLookup = new Map(existentes.data.map((p) => [p.lookup_key, p]));

for (const plan of PLANES) {
  const actual = porLookup.get(plan.lookup);
  if (actual) {
    console.log(`✓ ${plan.nombre} — precio ya existe (${actual.id}, ${actual.unit_amount / 100}€/mes)`);
    if (actual.unit_amount !== plan.importe) {
      console.log(`  ⚠ importe en Stripe ${actual.unit_amount / 100}€ ≠ landing ${plan.importe / 100}€ — revisar a mano`);
    }
    continue;
  }
  const producto = await stripe.products.create({ name: plan.nombre, metadata: { app: "aproba" } });
  const precio = await stripe.prices.create({
    product: producto.id,
    unit_amount: plan.importe,
    currency: "eur",
    recurring: { interval: "month" },
    lookup_key: plan.lookup,
    transfer_lookup_key: true,
  });
  console.log(`+ ${plan.nombre} creado — ${precio.id} (${plan.importe / 100}€/mes, lookup ${plan.lookup})`);
}

// Customer Portal : configuration par défaut si le compte n'en a pas encore.
const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
if (configs.data.length === 0) {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Aproba — gestión de tu suscripción" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  console.log("+ Customer Portal configurado (pago, facturas, anulación a fin de periodo)");
} else {
  console.log("✓ Customer Portal ya configurado");
}

console.log("\nListo. El código resuelve los precios por lookup_key — nada que pegar.");
