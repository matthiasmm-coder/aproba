// CAMBIO DE TARIFAS con precio heredado.
//   · 04/09/2026: subida 49/99/199 → 79/149/299 (los antiguos pasaron a «…_v1»).
//   · 01/10/2026: Business 299 → 249 €/mes (2.990 → 2.490 €/año). Las etiquetas «_v1»
//     YA existen (Juan, Jennifer): el precio de 299 € NO se reetiqueta —le quitaría la
//     suya a Jennifer—; solo pierde la canónica, que pasa al precio nuevo. Nadie cobra a
//     299 € (comprobado el 01/10: Business = Jennifer, heredada, y dos pruebas sin pago).
//
// Regla que hay que respetar: **una suscripción viva NUNCA se reprecia sola**. En Stripe
// un abono apunta a un objeto Price concreto; crear otro precio no lo toca. Lo único que
// se mueve es la ETIQUETA (lookup_key), que es lo que el código resuelve al contratar.
//
// Por cada plan y ciclo:
//   1. el precio ACTUAL conserva su id y su importe, y pasa a la etiqueta «…_v1»
//      → los despachos de lib/billing.ts WS_PRECIO_HEREDADO se seguirán facturando ahí;
//   2. se crea un precio NUEVO con el importe nuevo y la etiqueta canónica
//      → todo alta futura paga la tarifa nueva.
// El precio antiguo NO se archiva jamás: archivarlo rompería los abonos que cuelgan de él.
//
// Uso:
//   node scripts/stripe-subir-precios.mjs                      # simulacro (no toca nada)
//   STRIPE_SECRET_KEY=sk_live_… node scripts/stripe-subir-precios.mjs --aplicar
//
// Después de aplicarlo hay que desplegar los precios mostrados (lib/planes.ts y app/page.tsx):
// mientras Stripe cobre 99 € y la web anuncie 149 €, se cobra de menos.

import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(raiz, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const DEL_ENTORNO = Boolean(process.env.STRIPE_SECRET_KEY);
const SECRET = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY;
if (!SECRET) { console.error("✗ Falta STRIPE_SECRET_KEY"); process.exit(1); }
const stripe = new Stripe(SECRET);
const MODO = SECRET.startsWith("sk_test") ? "TEST" : "LIVE";
const APLICAR = process.argv.includes("--aplicar");

// Trampa vivida el 04/09: si el comando se parte en dos líneas, `STRIPE_SECRET_KEY=…`
// queda como variable de shell (no exportada), node no la ve y el script caía en la
// clave de .env.local — es decir, «aplicaba» en TEST creyendo estar en producción.
// Aplicar exige ahora que la clave venga del entorno; leer el simulacro sigue libre.
if (APLICAR && !DEL_ENTORNO) {
  console.error("✗ --aplicar exige pasar la clave en el MISMO comando (una sola línea):");
  console.error("    STRIPE_SECRET_KEY=rk_live_… node scripts/stripe-subir-precios.mjs --aplicar");
  console.error(`  Sin ella se usaría la de .env.local (${MODO}), que no es lo que quieres.`);
  console.error("  Para aplicar a propósito en TEST: STRIPE_SECRET_KEY=$(grep ^STRIPE_SECRET_KEY .env.local | cut -d= -f2- | tr -d '\"') node scripts/stripe-subir-precios.mjs --aplicar");
  process.exit(1);
}
const SUFIJO = "_v1";

// Importes NUEVOS en céntimos. Anual = 10 × mensual («2 meses gratis», como la landing).
const PLANES = [
  { lookup: "aproba_starter_mensual", anualLookup: "aproba_starter_anual", nombre: "Starter", importe: 7900, importeAnual: 79000 },
  { lookup: "aproba_pro_mensual", anualLookup: "aproba_pro_anual", nombre: "Pro", importe: 14900, importeAnual: 149000 },
  { lookup: "aproba_business_mensual", anualLookup: "aproba_business_anual", nombre: "Business", importe: 24900, importeAnual: 249000 },
];

console.log(`Stripe en modo ${MODO} · ${APLICAR ? "APLICANDO" : "simulacro (--aplicar para ejecutar)"}\n`);

const canonicas = PLANES.flatMap((p) => [p.lookup, p.anualLookup]);
const heredadas = canonicas.map((lk) => lk + SUFIJO);
// Stripe limita lookup_keys a 10 por petición → por tandas.
async function buscarPrecios(claves) {
  const out = [];
  for (let i = 0; i < claves.length; i += 10) {
    const r = await stripe.prices.list({ lookup_keys: claves.slice(i, i + 10), limit: 20 });
    out.push(...r.data);
  }
  return out;
}
const porLookup = new Map((await buscarPrecios([...canonicas, ...heredadas])).map((p) => [p.lookup_key, p]));
// Foto de las heredadas ANTES: al final se comprueba que ninguna se ha movido.
const heredadasAntes = new Map(heredadas.filter((lk) => porLookup.has(lk)).map((lk) => [lk, `${porLookup.get(lk).id}:${porLookup.get(lk).unit_amount}`]));

let cambios = 0;
for (const plan of PLANES) {
  for (const [lk, importe, ciclo] of [[plan.lookup, plan.importe, "mensual"], [plan.anualLookup, plan.importeAnual, "anual"]]) {
    const actual = porLookup.get(lk);
    const yaHeredado = porLookup.get(lk + SUFIJO);
    const etiqueta = `${plan.nombre} ${ciclo}`.padEnd(20);

    if (!actual) { console.log(`⚠ ${etiqueta} no existe la etiqueta «${lk}» — ejecuta antes scripts/stripe-setup.mjs`); continue; }
    if (actual.unit_amount === importe) { console.log(`· ${etiqueta} ya está a ${importe / 100} € (${actual.id})`); continue; }
    console.log(`→ ${etiqueta} ${actual.unit_amount / 100} € → ${importe / 100} €`);
    // El precio heredado solo tiene sentido en una SUBIDA (el cliente antiguo conserva el
    // suyo, más barato). En una bajada nadie quiere quedarse en el caro: no se etiqueta.
    const subida = importe > actual.unit_amount;
    if (yaHeredado) {
      // La heredada ya existe: es la de otros clientes y NO se toca. El precio actual solo
      // pierde la etiqueta canónica (sigue activo para quien colgara de él).
      console.log(`    heredado : «${lk + SUFIJO}» (${yaHeredado.id}, ${yaHeredado.unit_amount / 100} €) se conserva intacto`);
      console.log(`    antiguo  : ${actual.id} (${actual.unit_amount / 100} €) se queda sin etiqueta, activo`);
    } else if (subida) {
      console.log(`    heredado : ${actual.id} conserva ${actual.unit_amount / 100} € y pasa a «${lk + SUFIJO}»`);
    } else {
      console.log(`    antiguo  : ${actual.id} (${actual.unit_amount / 100} €) se queda sin etiqueta, activo (bajada: sin heredado)`);
    }
    console.log(`    nuevo    : precio a ${importe / 100} € con la etiqueta «${lk}»`);
    cambios++;
    if (!APLICAR) continue;

    // 1) el precio actual (el de los clientes existentes) solo cambia de etiqueta
    if (!yaHeredado && subida) await stripe.prices.update(actual.id, { lookup_key: lk + SUFIJO, transfer_lookup_key: true });
    // 2) el precio nuevo se queda la etiqueta canónica, en el MISMO producto
    const creado = await stripe.prices.create({
      product: typeof actual.product === "string" ? actual.product : actual.product.id,
      unit_amount: importe,
      currency: "eur",
      recurring: { interval: ciclo === "anual" ? "year" : "month" },
      ...(actual.tax_behavior && actual.tax_behavior !== "unspecified" ? { tax_behavior: actual.tax_behavior } : {}),
      lookup_key: lk,
      transfer_lookup_key: true,
    });
    console.log(`    ✓ creado ${creado.id}`);
  }
}

console.log(`\n${cambios} precio(s) por cambiar.`);
if (!APLICAR) { console.log("Simulacro: no se ha tocado nada."); process.exit(0); }

// Verificación: quién cobra qué después del cambio.
const final = await buscarPrecios([...canonicas, ...heredadas]);
console.log("\nEstado final:");
for (const p of final.sort((a, b) => (a.lookup_key ?? "").localeCompare(b.lookup_key ?? ""))) {
  console.log(`  ${String(p.lookup_key).padEnd(30)} ${String(p.unit_amount / 100).padStart(7)} €  ${p.id}`);
}
const movidas = [...heredadasAntes].filter(([lk, firma]) => { const p = final.find((x) => x.lookup_key === lk); return !p || `${p.id}:${p.unit_amount}` !== firma; });
if (movidas.length) { console.error(`\n✗ ¡Etiquetas heredadas cambiadas!: ${movidas.map(([lk]) => lk).join(", ")} — revisar en el dashboard YA.`); process.exit(1); }
console.log(`\n✓ Las ${heredadasAntes.size} etiquetas heredadas («${SUFIJO}») siguen en su precio y su importe.`);
console.log("Las suscripciones vivas NO se han tocado: siguen apuntando a su objeto Price.");
console.log("Siguiente paso: desplegar los precios mostrados (lib/planes.ts y app/page.tsx).");
