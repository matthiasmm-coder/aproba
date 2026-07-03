import "server-only";
import crypto from "node:crypto";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cobro con TARJETA de la factura del cliente final → va a la cuenta Stripe de LA
// GESTORÍA (no de la plataforma). Cada despacho pega su propia clave secreta Stripe
// (idealmente una clave RESTRINGIDA, limitada a Checkout/PaymentIntent).
//
// La clave se guarda CIFRADA (AES-256-GCM) en la tabla StripeCuenta, que tiene RLS
// «deny-all»: solo el service_role la lee/escribe (nunca el navegador). La clave de
// cifrado se deriva del SUPABASE_SERVICE_ROLE_KEY (quien lo tenga ya tiene acceso
// total, así no añadimos otra variable de entorno). Si se rota esa clave, habrá que
// volver a pegar las claves Stripe (las antiguas quedan indescifrables).
//
// Todo es OPT-IN y con repli propre: sin tabla migrada o sin clave → fetch devuelve
// null y el flujo de transferencia sigue intacto.

const encKey = (): Buffer | null => {
  const seed = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!seed) return null;
  return crypto.scryptSync(seed, "aproba/stripe-cuenta/v1", 32);
};

export function cifrarClave(plain: string): string {
  const k = encKey();
  if (!k) throw new Error("Cifrado no disponible (falta SUPABASE_SERVICE_ROLE_KEY).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function descifrarClave(enc: string): string | null {
  const k = encKey();
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

// Clave Stripe (descifrada y válida) del workspace, o null si no hay / tabla sin migrar.
export async function fetchStripeKeyDeWorkspace(admin: SupabaseClient, workspaceId: string): Promise<string | null> {
  try {
    const { data } = await admin.from("StripeCuenta").select("secretKeyEnc, activa").eq("workspaceId", workspaceId).maybeSingle();
    if (!data?.activa || !data?.secretKeyEnc) return null;
    const key = descifrarClave(data.secretKeyEnc as string);
    return key && /^(sk|rk)_/.test(key) ? key : null;
  } catch {
    return null; // tabla aún no migrada → cobro con tarjeta desactivado, sin romper nada
  }
}

// Estado para la UI de Ajustes: configurado / activo / modo / cola (sin exponer la clave).
export async function fetchEstadoCobroTarjeta(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<{ configurado: boolean; activa: boolean; modo: "live" | "test" | null; cola: string | null }> {
  const vacio = { configurado: false, activa: false, modo: null, cola: null } as const;
  try {
    const { data } = await admin.from("StripeCuenta").select("secretKeyEnc, activa").eq("workspaceId", workspaceId).maybeSingle();
    if (!data?.secretKeyEnc) return vacio;
    const key = descifrarClave(data.secretKeyEnc as string) ?? "";
    const modo = /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : null;
    return { configurado: true, activa: Boolean(data.activa), modo, cola: key ? key.slice(-4) : null };
  } catch {
    return vacio;
  }
}

// Cliente Stripe para una clave concreta (la de la gestoría), cacheado por clave.
let cache: { key: string; cli: Stripe } | null = null;
export function stripeConClave(key: string): Stripe {
  if (!cache || cache.key !== key) cache = { key, cli: new Stripe(key, { maxNetworkRetries: 2 }) };
  return cache.cli;
}

// Marca una factura como PAGADA (idempotente) y deja traza en el historial.
// Devuelve "nuevo" si la marca AHORA (transición real), "ya" si ya estaba pagada,
// null si no existe / error → el llamador sabe si debe enviar la confirmación.
export async function marcarFacturaPagada(
  admin: SupabaseClient,
  facturaId: string,
  metodo: "TARJETA" | "TRANSFERENCIA" | "EFECTIVO" = "TARJETA",
): Promise<"nuevo" | "ya" | null> {
  const { data: f } = await admin.from("Factura").select("id, estado, expedienteId, numero, total").eq("id", facturaId).maybeSingle();
  if (!f) return null;
  if (f.estado === "PAGADA") return "ya";
  // Update CONDICIONAL (.neq estado PAGADA) + .select(): si dos llamadores concurren
  // (redirect de Stripe + clic manual del gestor, o el cron), solo UNO ve la transición
  // → solo uno envía la confirmación al cliente.
  const { data: upd, error } = await admin
    .from("Factura")
    .update({ estado: "PAGADA", metodoPago: metodo })
    .eq("id", facturaId)
    .neq("estado", "PAGADA")
    .select("id");
  if (error) return null;
  if (!upd?.length) return "ya"; // otro llamador la marcó entre el select y el update
  if (f.expedienteId) {
    const via = metodo === "TARJETA" ? "con tarjeta" : metodo === "EFECTIVO" ? "en efectivo" : "por transferencia";
    const emoji = metodo === "TARJETA" ? "💳" : "🏦";
    await admin.from("ExpedienteEvento").insert({
      id: crypto.randomUUID(),
      expedienteId: f.expedienteId,
      tipo: "COMENTARIO",
      descripcion: `${emoji} Factura ${f.numero} pagada ${via} (${Number(f.total).toFixed(2).replace(".", ",")} €)`,
    });
  }
  return "nuevo";
}
