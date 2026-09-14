// Genera app/fonts/GeistMono-landing.woff2: la MISMA Geist Mono variable (100–900) del paquete
// `geist`, recortada a ASCII imprimible + acentos del español + unos signos. La portada solo
// usa la mono para cifras y referencias de las maquetas (EXP-2026-0042, «01»…): con el fichero
// completo (70 KB) la fuente competía con CSS/JS por el ancho de banda en móvil. La app sigue
// con la fuente completa (root layout); la portada aplica esta variante vía la misma variable
// CSS --font-geist-mono (app/page.tsx), así que `font-mono` no cambia de aspecto.
//
//   npm i subset-font  (en cualquier carpeta temporal)  →  node scripts/subset-geist-mono.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.env.SUBSET_FONT_DIR ? process.env.SUBSET_FONT_DIR + "/" : import.meta.url);
const subsetFont = require("subset-font");
const origen = new URL("../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2", import.meta.url);
const destino = new URL("../app/fonts/GeistMono-landing.woff2", import.meta.url);
let texto = "";
for (let c = 0x20; c <= 0x7e; c++) texto += String.fromCharCode(c);
texto += "áéíóúüñÁÉÍÓÚÜÑ¿¡«»–—·€ºª";
// La portada solo usa los pesos 400 y 600 (font-mono normal / font-semibold): se recorta el eje
// de peso a 400–600 para que las tablas de variación (lo que más pesa) sean mínimas.
const buf = await subsetFont(readFileSync(origen), texto, { targetFormat: "woff2", variationAxes: { wght: { min: 400, max: 600 } } });
writeFileSync(destino, buf);
console.log(`GeistMono-landing.woff2: ${buf.length} B (origen ${readFileSync(origen).length} B), ${texto.length} caracteres`);
