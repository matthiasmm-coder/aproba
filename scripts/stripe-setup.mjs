// Crée les produits/prix Stripe d'Aproba (idempotent, mode test ou live selon la clé).
// Lancer : node scripts/stripe-setup.mjs            (lit web/.env.local → STRIPE_SECRET_KEY)
//   ou   : STRIPE_SECRET_KEY=sk_live_… node scripts/stripe-setup.mjs   (priorité à la clé en ligne)
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

// Priorité à la clé passée en ligne de commande (ex. sk_live), sinon celle de .env.local.
const SECRET = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("✗ STRIPE_SECRET_KEY manquante (ni en ligne de commande ni dans web/.env.local)");
  process.exit(1);
}
const stripe = new Stripe(SECRET);
const modo = SECRET.startsWith("sk_test") ? "TEST" : "LIVE";
console.log(`Stripe en mode ${modo}\n`);

// Mensual + anual (2 meses gratis: anual = 10 × mensual, como en la landing).
// Ambos precios cuelgan del MISMO producto por plan.
const PLANES = [
  { lookup: "aproba_starter_mensual", anualLookup: "aproba_starter_anual", nombre: "Aproba Starter", importe: 4900, importeAnual: 49000 },
  { lookup: "aproba_pro_mensual", anualLookup: "aproba_pro_anual", nombre: "Aproba Pro", importe: 9900, importeAnual: 99000 },
  { lookup: "aproba_business_mensual", anualLookup: "aproba_business_anual", nombre: "Aproba Business", importe: 19900, importeAnual: 199000 },
];

const todosLookups = PLANES.flatMap((p) => [p.lookup, p.anualLookup]);
const existentes = await stripe.prices.list({ lookup_keys: todosLookups, limit: 20 });
const porLookup = new Map(existentes.data.map((p) => [p.lookup_key, p]));

for (const plan of PLANES) {
  const actual = porLookup.get(plan.lookup);
  let productoId;
  if (actual) {
    productoId = typeof actual.product === "string" ? actual.product : actual.product.id;
    console.log(`✓ ${plan.nombre} — precio mensual ya existe (${actual.id}, ${actual.unit_amount / 100}€/mes)`);
    if (actual.unit_amount !== plan.importe) {
      console.log(`  ⚠ importe en Stripe ${actual.unit_amount / 100}€ ≠ landing ${plan.importe / 100}€ — revisar a mano`);
    }
  } else {
    const producto = await stripe.products.create({ name: plan.nombre, metadata: { app: "aproba" } });
    productoId = producto.id;
    const precio = await stripe.prices.create({
      product: productoId,
      unit_amount: plan.importe,
      currency: "eur",
      recurring: { interval: "month" },
      lookup_key: plan.lookup,
      transfer_lookup_key: true,
    });
    console.log(`+ ${plan.nombre} creado — ${precio.id} (${plan.importe / 100}€/mes, lookup ${plan.lookup})`);
  }

  const anual = porLookup.get(plan.anualLookup);
  if (anual) {
    console.log(`✓ ${plan.nombre} — precio anual ya existe (${anual.id}, ${anual.unit_amount / 100}€/año)`);
    if (anual.unit_amount !== plan.importeAnual) {
      console.log(`  ⚠ importe anual en Stripe ${anual.unit_amount / 100}€ ≠ landing ${plan.importeAnual / 100}€ — revisar a mano`);
    }
  } else {
    const precioAnual = await stripe.prices.create({
      product: productoId,
      unit_amount: plan.importeAnual,
      currency: "eur",
      recurring: { interval: "year" },
      lookup_key: plan.anualLookup,
      transfer_lookup_key: true,
    });
    console.log(`+ ${plan.nombre} anual creado — ${precioAnual.id} (${plan.importeAnual / 100}€/año, lookup ${plan.anualLookup})`);
  }
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
