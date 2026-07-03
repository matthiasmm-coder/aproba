import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

// Racine du paquet web/ (ce fichier vit dans web/scripts/).
const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// Résout un chemin de module vers un fichier réel (.ts prioritaire, puis tel quel).
function aFichero(base) {
  for (const cand of [base + ".ts", base + ".tsx", base]) {
    if (existsSync(cand)) return pathToFileURL(cand).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  // next/headers fuera de Next: stub que lanza SOLO si alguien lo llama de verdad.
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript," + encodeURIComponent("export const cookies=()=>{throw new Error('next/headers fuera de Next')};export const headers=cookies;export const draftMode=cookies;"),
      shortCircuit: true,
    };
  }
  // Alias TypeScript `@/…` → racine de web/ (comme tsconfig paths).
  if (specifier.startsWith("@/")) {
    const hit = aFichero(join(RAIZ, specifier.slice(2)));
    if (hit) return { url: hit, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.(ts|js|mjs|cjs|json)$/.test(specifier)) {
    try {
      const u = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(u))) return { url: u.href, shortCircuit: true };
    } catch { /* fallthrough */ }
  }
  return next(specifier, context);
}
