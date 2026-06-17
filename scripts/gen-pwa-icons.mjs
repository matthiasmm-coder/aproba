import sharp from "sharp";

// Génère les icônes PWA depuis le logo Aproba (carré vert + α). Idempotent.
const FONT = "Geist, Inter, Helvetica, Arial, sans-serif";

// Icône standard : carré vert arrondi + α (identique au favicon, mis à l'échelle).
const rounded = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E8C5F"/><text x="16.2" y="12" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="27" font-weight="800" fill="#fff">&#945;</text></svg>`;

// Maskable / Apple : plein cadre (le masque OS arrondit), α centré dans la zone sûre.
const fullBleed = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0E8C5F"/><text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="300" font-weight="800" fill="#fff">&#945;</text></svg>`;

const out = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
await sharp(Buffer.from(rounded(192))).png().toFile(out("icon-192.png"));
await sharp(Buffer.from(rounded(512))).png().toFile(out("icon-512.png"));
await sharp(Buffer.from(fullBleed(512))).png().toFile(out("icon-maskable-512.png"));
await sharp(Buffer.from(fullBleed(180))).png().toFile(out("apple-touch-icon.png"));
console.log("PWA icons generated → public/");
