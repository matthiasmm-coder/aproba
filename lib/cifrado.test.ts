import { describe, expect, it } from "vitest";
import { cifrarConSeed } from "../scripts/verifactu-config.mjs";
import { descifrarSecreto, cifrarSecreto, SAL_VERIFACTI } from "./cifrado";

// El script de consola (mjs, sin TypeScript) y la app deben cifrar/descifrar lo mismo:
// una clave guardada por scripts/verifactu-config.mjs la lee lib/verifactu-envio.ts.
describe("cifrado de secretos", () => {
  const seed = "seed-de-prueba-solo-test";
  it("lo cifrado por el script se descifra en la app (misma derivación y sal)", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = seed;
    const enc = cifrarConSeed("vf_test_1234567890abcdef", seed);
    expect(descifrarSecreto(enc, SAL_VERIFACTI)).toBe("vf_test_1234567890abcdef");
  });
  it("ida y vuelta en la app; otra sal no descifra", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = seed;
    const enc = cifrarSecreto("secreto", SAL_VERIFACTI);
    expect(descifrarSecreto(enc, SAL_VERIFACTI)).toBe("secreto");
    expect(descifrarSecreto(enc, "otra/sal")).toBeNull();
    expect(descifrarSecreto("no-es-base64-valido", SAL_VERIFACTI)).toBeNull();
  });
});
