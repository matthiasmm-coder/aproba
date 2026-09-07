// Imagen de cabecera de un artículo con gpt-image-1 (05/09/2026).
//   OPENAI_API_KEY=… node scripts/imagen-articulo.mjs <slug> [--medium]
// Lee la clave del entorno o, si no, de .env.local (nunca la imprime). Guarda
// public/articulos/<slug>.jpg en 1536×1024 (única salida paisaje del modelo), que es
// exactamente el tamaño que esperan el índice y el og:image. Sin texto en la imagen: los
// modelos lo deforman, y el título ya lo pone la página.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const slug = process.argv[2];
if (!slug) { console.error("uso: node scripts/imagen-articulo.mjs <slug>"); process.exit(1); }
const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")])) : {};
const KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
if (!KEY) { console.error("✗ Falta OPENAI_API_KEY (entorno o .env.local)"); process.exit(1); }

// Un prompt por artículo: misma serie visual que las seis cabeceras anteriores —
// bodegón fotográfico, luz de estudio, fondo verde muy oscuro, latón y papel crema, un
// acento de luz verde. Nada de texto ni banderas.
const PROMPTS = {
  "errores-documentales-retrasan-expediente-extranjeria":
    "SUBJECT: overhead top-down shot: several blank cream documents and a burgundy passport spread on the desk, a brass-rimmed magnifying glass resting over one document, magnifying a spot marked by a small amber sticky tab. Ultra-premium editorial still life, cinematic macro photography, bright and airy studio lighting: soft daylight from a large window on the left, gentle warm fill light, luminous high-key mood, no deep shadows. Light honey-walnut desk. Background: a pale sage-green wall softly lit and slightly out of focus. Brass glowing warm, cream paper bright, shallow depth of field, subtle film grain, hyper-detailed textures of brass, glass, paper and wood, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "subsanacion-regularizacion-plazo":
    "SUBJECT: a paper desk calendar page with a blank grid and one square circled in green ink, a brass hourglass almost empty with the last sand falling, and a sealed cream envelope with a brass wax seal, all on the desk. Ultra-premium editorial still life, cinematic macro photography, bright and airy studio lighting: soft daylight from a large window on the left, gentle warm fill light, luminous high-key mood, no deep shadows. Light honey-walnut desk. Background: a pale sage-green wall softly lit and slightly out of focus. Brass glowing warm, cream paper bright, shallow depth of field, subtle film grain, hyper-detailed textures of brass, glass, paper and wood, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "renovaciones-2027-regularizacion-extraordinaria":
    "SUBJECT: an enormous sweeping curved stack of hundreds of cream paper folders arranged like a cresting wave, looming over a small desk in the foreground that holds only a blank brass-framed desk calendar and a brass pen. Ultra-premium editorial still life, cinematic macro photography, bright and airy studio lighting: soft daylight from a large window on the left, gentle warm fill light, luminous high-key mood, no deep shadows. Light honey-walnut desk. Background: a pale sage-green wall softly lit and slightly out of focus. Brass glowing warm, cream paper bright, shallow depth of field, subtle film grain, hyper-detailed textures of brass, glass, paper and wood, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "verifactu-despachos-extranjeria-fechas-2027":
    "An elegant cream paper invoice sheet with faint ruled lines rests on a white marble desk. From its right edge, the paper itself transforms upward into a smooth flowing ribbon of emerald light that curves gracefully through the air and resolves, at its end, into a single clean glowing green square outline hovering above the desk. The transformation is seamless: paper becomes light in a continuous silky sweep. Rendered as long-exposure light painting: the light is a CONTINUOUS, SILKY, FLOWING RIBBON of luminous emerald-green energy with soft motion blur and smooth gradients, like liquid glass or a silk scarf caught in slow motion. Absolutely NO scattered dots, NO confetti, NO pixel cubes, NO sparkles, NO glitter, NO particle spray: one single elegant unbroken stream of light with soft glow and gentle bokeh. Bright, luminous, high-key scene, premium editorial photography, hyper-detailed, cinematic depth of field, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "honorarios-extranjeria-cuanto-cobrar-2026":
    "Ultra-premium editorial still life, bright high-key daylight, luminous and airy. An antique brass balance scale standing on a white marble counter in front of a softly lit pale mint-green linen backdrop: on the left pan, folded official documents tied with a dark green ribbon and a brass wax seal; on the right pan, a small stack of gold coins; a thin ray of emerald light glints on the brass beam. Eye-level, centered, shallow depth of field, hyper-detailed, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "nacionalidad-por-residencia-plazos-tasas-2026":
    "An open burgundy passport with blank cream pages on a white marble desk; from between its pages rises one continuous silky ribbon of emerald light that curves upward in a graceful S-shape and wraps once around an antique brass pocket watch standing open on a small stand to the right. Rendered as long-exposure light painting: the light is a CONTINUOUS, SILKY, FLOWING RIBBON of luminous emerald-green energy with soft motion blur and smooth gradients, like liquid glass or a silk scarf caught in slow motion. Absolutely NO scattered dots, NO confetti, NO pixel cubes, NO sparkles, NO glitter, NO particle spray: one single elegant unbroken stream of light with soft glow and gentle bokeh. Bright, luminous, high-key scene, premium editorial photography, hyper-detailed, cinematic depth of field, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
  "silencio-administrativo-extranjeria-plazos-2026":
    "Ultra-premium editorial still life, cinematic macro photography, bright and airy studio lighting: soft daylight from a large window on the left, gentle warm fill light, luminous high-key mood, no deep shadows. On a light honey-walnut desk: a tall brass hourglass with pale sand mid-flow, beside a closed cream-colored dossier folder tied with a dark green ribbon and a brass wax seal, and a small antique brass desk bell resting silent. Background: a pale sage-green wall softly lit and slightly out of focus, the brass glowing warm, the paper bright cream, shallow depth of field, subtle film grain, hyper-detailed textures of brass, glass, paper and wood, 3:2 composition with the hourglass slightly left of center. No text, no letters, no numbers, no flags, no people.",
  "entidades-colaboradoras-extranjeria-registro-2026":
    "An open leather-bound registry ledger with blank cream pages on a white marble table, a brass hand stamp beside it. Above the pages, a smooth flowing ribbon of emerald light rises and loops elegantly through the air, tracing the outline of the Iberian Peninsula as one single continuous glowing line, like neon drawn in a single stroke, its reflection glowing softly on the paper. Rendered as long-exposure light painting: the light is a CONTINUOUS, SILKY, FLOWING RIBBON of luminous emerald-green energy with soft motion blur and smooth gradients, like liquid glass or a silk scarf caught in slow motion. Absolutely NO scattered dots, NO confetti, NO pixel cubes, NO sparkles, NO glitter, NO particle spray: one single elegant unbroken stream of light with soft glow and gentle bokeh. Bright, luminous, high-key scene, premium editorial photography, hyper-detailed, cinematic depth of field, 3:2 composition. No text, no letters, no numbers, no flags, no people.",
};
const prompt = PROMPTS[slug];
if (!prompt) { console.error(`✗ No hay prompt para «${slug}» — añádelo en PROMPTS`); process.exit(1); }
const quality = process.argv.includes("--medium") ? "medium" : "high";

const res = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", quality, n: 1 }),
});
if (!res.ok) { console.error("✗ OpenAI", res.status, (await res.text()).slice(0, 400)); process.exit(1); }
const j = await res.json();
const b64 = j.data?.[0]?.b64_json;
if (!b64) { console.error("✗ respuesta sin imagen"); process.exit(1); }
const png = `/tmp/${slug}.png`;
writeFileSync(png, Buffer.from(b64, "base64"));
const out = `public/articulos/${slug}.jpg`;
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", png, "--out", out], { stdio: "ignore" });
console.log(`✓ ${out} (${quality})`);
