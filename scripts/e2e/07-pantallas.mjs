// Les écrans principaux répondent sous session (protège les refontes de pages).
import { contexto, verificador, BASE } from "./_lib.mjs";

export const nombre = "07 Pantallas principales (200)";
export async function run() {
  const v = verificador(nombre);
  const { cookie } = await contexto();
  for (const ruta of ["/app", "/app/expedientes", "/app/clientes", "/app/facturas", "/app/vencimientos"]) {
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie: `${cookie}; aproba_oficina=todas` }, redirect: "manual" });
    const html = r.status === 200 ? await r.text() : "";
    v.ok(r.status === 200 && !/Application error/i.test(html), `${ruta} → ${r.status}`);
  }
  return v.resumen();
}
