// Étanchéité tenant : la session demo NE voit PAS les données d'un autre workspace.
import { createClient } from "@supabase/supabase-js";
import { contexto, verificador, admin, URL_SB, ANON_KEY } from "./_lib.mjs";

export const nombre = "06 RLS (étanchéité tenant)";
export async function run() {
  const v = verificador(nombre);
  const { ws, accessToken } = await contexto();
  // Un id de cliente d'un AUTRE workspace (lecture d'id uniquement, aucune écriture).
  const { data: ajeno } = await admin.from("Cliente").select("id").neq("workspaceId", ws).limit(1).maybeSingle();
  if (!ajeno) { v.ok(true, "aucun autre workspace avec clientes (rien à tester)"); return v.resumen(); }

  const sesion = createClient(URL_SB, ANON_KEY, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } });
  const { data: leido } = await sesion.from("Cliente").select("id").eq("id", ajeno.id);
  v.ok((leido ?? []).length === 0, "cliente d'un autre despacho → invisible sous session demo");

  const anon = createClient(URL_SB, ANON_KEY, { auth: { persistSession: false } });
  const { data: sinAuth } = await anon.from("Cliente").select("id").limit(1);
  v.ok((sinAuth ?? []).length === 0, "sans session → aucune ligne visible");
  return v.resumen();
}
