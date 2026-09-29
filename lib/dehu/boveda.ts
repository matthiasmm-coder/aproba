import "server-only";
import crypto from "node:crypto";

// DEHú AUTOMÁTICA — la caja fuerte de los certificados (29/09/2026).
// El .p12 del despacho y su contraseña se guardan cifrados con AES-256-GCM. La clave
// (DEHU_CLAVE_CERTIFICADOS: 32 bytes en base64) vive SOLO en el entorno de producción de
// Vercel, a propósito distinta de SUPABASE_SERVICE_ROLE_KEY (lib/cifrado.ts): esa también
// está en los .env.local de desarrollo, y un certificado debe poder descifrarse únicamente
// en el servidor que lo usa. Sin la clave, la DEHú automática no se puede activar.
// El cifrado va atado al despacho (dato asociado): el de uno no sirve en otro.
// Formato: «v1:» + base64( iv(12) | tag(16) | ciphertext ).

export type UsoBoveda = "certificado" | "clave";

function claveMaestra(): Buffer | null {
  const b64 = process.env.DEHU_CLAVE_CERTIFICADOS?.trim();
  if (!b64) return null;
  const k = Buffer.from(b64, "base64");
  return k.length === 32 ? k : null;
}

export const bovedaDisponible = () => claveMaestra() !== null;
const aad = (workspaceId: string, uso: UsoBoveda) => Buffer.from(`aproba/dehu/${uso}/${workspaceId}`, "utf8");

export function cifrarParaDespacho(datos: Buffer, workspaceId: string, uso: UsoBoveda): string {
  const k = claveMaestra();
  if (!k) throw new Error("La caja fuerte de certificados no está configurada (DEHU_CLAVE_CERTIFICADOS).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(aad(workspaceId, uso));
  const ct = Buffer.concat([c.update(datos), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64")}`;
}

export function descifrarDelDespacho(enc: string, workspaceId: string, uso: UsoBoveda): Buffer | null {
  const k = claveMaestra();
  if (!k || !enc.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(enc.slice(3), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAAD(aad(workspaceId, uso));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
  } catch {
    return null;
  }
}
