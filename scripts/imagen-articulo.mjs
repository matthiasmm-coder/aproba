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
  "entidades-colaboradoras-extranjeria-registro-2026":
    "Ultra-premium editorial still life, cinematic macro photography. On a dark walnut desk, an open leather-bound registry ledger with cream pages; resting on it, a heavy brass seal stamp. Hovering just above the page, hundreds of tiny glowing emerald-green pins of light form the unmistakable silhouette of the map of Spain, denser over Madrid and the Mediterranean coast, casting soft green light on the paper. Deep dark green background fading to black, shallow depth of field, gentle volumetric haze, brass and cream palette with one emerald accent. No text, no letters, no logos, no flags, photorealistic, 8k, Hasselblad look.",
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
