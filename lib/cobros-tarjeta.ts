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

// Fila StripeCuenta de un ámbito (oficina concreta, o la común del despacho).
// Tres generaciones de esquema conviven: (ws, oficinaId) tras la migración fase 6,
// (ws) con columna oficinaId pero fila única, y la tabla vieja sin columna. El
// maybeSingle() de antes PETARÍA con dos filas (común + oficina) → limit(1) ordenado.
async function filaStripe(admin: SupabaseClient, workspaceId: string, oficinaId: string | null): Promise<{ secretKeyEnc?: string; activa?: boolean } | null> {
  try {
    let q = admin.from("StripeCuenta").select("secretKeyEnc, activa, oficinaId").eq("workspaceId", workspaceId);
    q = oficinaId ? q.eq("oficinaId", oficinaId) : q.is("oficinaId", null);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    return ((data ?? [])[0] as { secretKeyEnc?: string; activa?: boolean } | undefined) ?? null;
  } catch {
    if (oficinaId) return null; // columna sin migrar → no existen claves por oficina
    try {
      const { data } = await admin.from("StripeCuenta").select("secretKeyEnc, activa").eq("workspaceId", workspaceId).limit(1);
      return ((data ?? [])[0] as { secretKeyEnc?: string; activa?: boolean } | undefined) ?? null;
    } catch { return null; }
  }
}

// Clave Stripe (descifrada y válida) del ámbito: la de la oficina si existe, si no
// la común del despacho. Sin oficina → común, exactamente el comportamiento de siempre.
export async function fetchStripeKeyDeWorkspace(admin: SupabaseClient, workspaceId: string, oficinaId: string | null = null): Promise<string | null> {
  const leer = async (sede: string | null) => {
    const fila = await filaStripe(admin, workspaceId, sede);
    if (!fila?.activa || !fila?.secretKeyEnc) return null;
    const key = descifrarClave(fila.secretKeyEnc as string);
    return key && /^(sk|rk)_/.test(key) ? key : null;
  };
  return (oficinaId ? await leer(oficinaId) : null) ?? await leer(null);
}

// Estado para la UI de Ajustes: configurado / activo / modo / cola (sin exponer la clave).
// Con oficinaId, el estado es EL DE ESA SEDE (sin cascada: la UI muestra lo que hay).
export async function fetchEstadoCobroTarjeta(
  admin: SupabaseClient,
  workspaceId: string,
  oficinaId: string | null = null,
): Promise<{ configurado: boolean; activa: boolean; modo: "live" | "test" | null; cola: string | null }> {
  const vacio = { configurado: false, activa: false, modo: null, cola: null } as const;
  const fila = await filaStripe(admin, workspaceId, oficinaId);
  if (!fila?.secretKeyEnc) return vacio;
  const key = descifrarClave(fila.secretKeyEnc as string) ?? "";
  const modo = /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : null;
  return { configurado: true, activa: Boolean(fila.activa), modo, cola: key ? key.slice(-4) : null };
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
  // Una ANULADA no puede transitar a PAGADA (webhook rezagado, cron, doble clic): el dinero
  // recibido sobre una factura anulada es una devolución pendiente, no un cobro.
  if (f.estado === "ANULADA") return null;
  // Update CONDICIONAL (.neq estado PAGADA) + .select(): si dos llamadores concurren
  // (redirect de Stripe + clic manual del gestor, o el cron), solo UNO ve la transición
  // → solo uno envía la confirmación al cliente.
  const { data: upd, error } = await admin
    .from("Factura")
    .update({ estado: "PAGADA", metodoPago: metodo })
    .eq("id", facturaId)
    .neq("estado", "PAGADA")
    .neq("estado", "ANULADA")
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
