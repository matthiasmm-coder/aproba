// Sube la luminosidad de una cabecera SIN regenerarla (08/09/2026).
//   node scripts/aclarar-imagen.mjs public/articulos/<slug>.jpg [gamma]
// Corrección GAMMA, no brillo lineal: levanta sombras y medios y deja los blancos
// intactos, así que no quema el papel ni lava el verde del holograma. Sin gamma
// explícito se calcula por imagen a partir de su luminancia media (una ilustración
// ya clara se queda como está).
import { execFileSync } from "node:child_process";
const [, , ruta, gammaArg] = process.argv;
if (!ruta) { console.error("uso: node scripts/aclarar-imagen.mjs <ruta.jpg> [gamma]"); process.exit(1); }
const py = `
from PIL import Image, ImageStat
import sys
f = sys.argv[1]; im = Image.open(f); L = ImageStat.Stat(im.convert("L")).mean[0]
g = float(sys.argv[2]) if len(sys.argv) > 2 else max(1.0, min(1.45, 1 + (95 - L) / 170))
if g > 1.001:
    lut = [min(255, round(255 * ((i / 255) ** (1 / g)))) for i in range(256)]
    im = im.point(lut * len(im.getbands()))
    im.save(f, quality=90)
print(f"{f}: luminancia {L:.0f} → gamma {g:.2f}")
`;
console.log(execFileSync("python3", ["-c", py, ruta, ...(gammaArg ? [gammaArg] : [])], { encoding: "utf8" }).trim());
