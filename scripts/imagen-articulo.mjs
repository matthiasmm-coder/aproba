// Imagen de cabecera de un artículo con gpt-image-1 (05/09/2026).
//   OPENAI_API_KEY=… node scripts/imagen-articulo.mjs <slug> [--medium]
// Lee la clave del entorno o, si no, de .env.local (nunca la imprime). Guarda
// public/articulos/<slug>.jpg en 1536×1024 (única salida paisaje del modelo), que es
// exactamente el tamaño que esperan el índice y el og:image. Sin texto en la imagen: los
// modelos lo deforman, y el título ya lo pone la página.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

// ⚠️ Las cabeceras publicadas son estas imágenes ORIGINALES con una pasada de
// luminosidad (scripts/aclarar-imagen.mjs). Si se regenera una, aplicar esa pasada
// después para que siga en serie con las demás.
const slug = process.argv[2];
if (!slug) { console.error("uso: node scripts/imagen-articulo.mjs <slug>"); process.exit(1); }
const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")])) : {};
const KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
if (!KEY) { console.error("✗ Falta OPENAI_API_KEY (entorno o .env.local)"); process.exit(1); }

// Un prompt por artículo: misma serie visual que las seis cabeceras anteriores —
// bodegón fotográfico, luz de estudio, fondo verde muy oscuro, latón y papel crema, un
// acento de luz verde. Nada de texto ni banderas.
const PROMPTS = {
  "notificaciones-electronicas-extranjeria-quien-recibe-10-dias":
    "Ultra-premium editorial still life, cinematic macro photography, bright airy studio light, high-key exposure, shallow depth of field. On a white Carrara marble desk with subtle grey veins: a single cream-coloured paper envelope, slightly open, sealed with a small emerald-green wax seal, resting at an angle; beside it a brass fountain pen and a small brass desk bell. From the open flap of the envelope rises a crisp, high-contrast, VIVID EMERALD-GREEN holographic circuit graphic with sharp vector-like edges and solid saturated colour: fine printed-circuit-board traces and solder pads climbing upward and converging into a node-and-line network diagram that forms the clean outline of a notification bell, drawn in solid glowing green lines, floating a few centimetres above the envelope. Think printed-circuit-board artwork and network diagrams: fine traces, node dots, wireframe grid, scan lines. The graphic is made ONLY of lines, dots and geometric shapes. NO soft smoke, NO magic sparkle, NO silk ribbon, NO confetti, NO particle spray. Background: a pale sage-green wall softly out of focus, daylight from a large window on the left, gentle soft shadows. Palette: bright white marble, cream paper, warm brass, vivid emerald green. STRICT RULE: the image contains ZERO typography. The envelope and every paper surface must be COMPLETELY BLANK — NO printed words, NO heading, NO address, NO stamp with letters. The holographic graphic must contain NO letters, NO words, NO labels, NO numbers, NO captions — do not write any word inside or under the bell. No flags, no people, no screens. 3:2 landscape composition, the envelope and bell graphic centred with breathing room.",
  "silencio-administrativo-extranjeria-plazos-2026":
    "Ultra-premium editorial still life, cinematic macro photography, studio lighting. On a dark walnut desk: a tall brass hourglass with pale sand mid-flow, beside a closed cream-colored dossier folder tied with a dark green ribbon and a brass wax seal, and a small antique brass desk bell resting silent. Deep bottle-green background fading to black, a single soft emerald light rim-lighting the glass of the hourglass, shallow depth of field, subtle film grain, hyper-detailed textures of brass, glass, paper and wood, 3:2 composition with the hourglass slightly left of center. No text, no letters, no numbers, no flags, no people.",
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
