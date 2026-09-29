import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reclamosDeSesion } from "./claims";

// Un faux client : seul auth.getClaims() compte ici.
const cliente = (getClaims: () => Promise<unknown>) => ({ auth: { getClaims } }) as unknown as SupabaseClient;

describe("reclamosDeSesion", () => {
  it("renvoie les claims d'une session valide", async () => {
    const r = await reclamosDeSesion(cliente(async () => ({ data: { claims: { sub: "u-1", role: "authenticated" } }, error: null })));
    expect(r?.sub).toBe("u-1");
  });

  it("pas de session → null", async () => {
    expect(await reclamosDeSesion(cliente(async () => ({ data: null, error: null })))).toBeNull();
  });

  it("erreur renvoyée (JWT invalide, refresh refusé) → null", async () => {
    expect(await reclamosDeSesion(cliente(async () => ({ data: null, error: new Error("Invalid JWT signature") })))).toBeNull();
  });

  it("erreur LANCÉE (alg « none » : getClaims lance au lieu de renvoyer) → null, pas un 500", async () => {
    expect(await reclamosDeSesion(cliente(async () => { throw new Error("Invalid alg claim"); }))).toBeNull();
  });

  it("claims sans sub → null", async () => {
    expect(await reclamosDeSesion(cliente(async () => ({ data: { claims: { role: "anon" } }, error: null })))).toBeNull();
  });
});
