import "server-only";
import crypto from "node:crypto";

// Cifrado de secretos guardados en base (claves de terceros: Stripe, Verifacti…).
// AES-256-GCM con clave derivada por scrypt de SUPABASE_SERVICE_ROLE_KEY y una sal por
// uso: un mismo secreto cifrado para Stripe no se descifra con la sal de Verifacti.
// Formato: base64( iv(12) | tag(16) | ciphertext ). Mismo algoritmo que
// scripts/verifactu-config.mjs (que debe poder cifrar sin importar TypeScript).

function claveDerivada(sal: string): Buffer | null {
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!seed) return null;
  return crypto.scryptSync(seed, sal, 32);
}

export function cifrarSecreto(plano: string, sal: string): string {
  const k = claveDerivada(sal);
  if (!k) throw new Error("Cifrado no disponible (falta SUPABASE_SERVICE_ROLE_KEY).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plano, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function descifrarSecreto(enc: string, sal: string): string | null {
  const k = claveDerivada(sal);
  if (!k) return null;
  try {
    const raw = Buffer.from(enc, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const SAL_VERIFACTI = "aproba/verifacti/v1";
