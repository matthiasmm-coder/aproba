// IndexNow: avisa a Bing (y a los buscadores que comparten el protocolo) de las URL
// nuevas o cambiadas, en el momento. Google no lo usa; para Google está el sitemap y
// Search Console. Uso:
//   node scripts/indexnow.mjs                       → todas las URL del sitemap
//   node scripts/indexnow.mjs /articulos/mi-slug …  → solo esas rutas
// La clave no es secreta (el protocolo la publica en /<clave>.txt); vive en public/.
const HOST = "aproba-software.com";
const KEY = "a4042eb7e6e4f6711561cff65db75d63";
const BASE = `https://${HOST}`;
let rutas = process.argv.slice(2);
if (!rutas.length) {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  rutas = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(BASE, ""));
}
const urlList = rutas.map((r) => (r.startsWith("http") ? r : `${BASE}${r}`));
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow → ${res.status} ${res.statusText} · ${urlList.length} URL`);
if (!res.ok) console.log((await res.text()).slice(0, 300));
