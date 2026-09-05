// Cohete «premium» para la ventana Aproba Despegue, con gpt-image-1 y fondo transparente.
//   OPENAI_API_KEY=… node scripts/imagen-despegue.mjs
// Escribe public/despegue-cohete.png; la ventana lo usa si existe (si no, el SVG de
// components/cohete.tsx). Nunca imprime la clave.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")])) : {};
const KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
if (!KEY) { console.error("✗ Falta OPENAI_API_KEY"); process.exit(1); }
const prompt = "Premium 3D icon of a small sleek rocket taking off, tilted 45 degrees, rendered in glossy emerald green (#0E8C5F) with mint highlights and a warm amber flame, soft studio lighting, subtle shadow, clean and minimal, product-icon style like a modern SaaS illustration. Isolated on a fully transparent background. No text, no letters, no logos.";
const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "high", background: "transparent", output_format: "png", n: 1 }) });
if (!res.ok) { console.error("✗ OpenAI", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
const j = await res.json(); const b64 = j.data?.[0]?.b64_json;
if (!b64) { console.error("✗ sin imagen"); process.exit(1); }
writeFileSync("public/despegue-cohete.png", Buffer.from(b64, "base64"));
console.log("✓ public/despegue-cohete.png");
