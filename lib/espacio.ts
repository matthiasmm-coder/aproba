import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ESPACIO DEL CLIENTE — token estable por PERSONA (además del token por expediente).
// Se crea de forma perezosa e idempotente: al terminar su primer expediente
// (/api/portal/completar) o al visitar su página de seguimiento (/s). Con él, el
// cliente entra en /c/[token]: todos sus trámites + solicitar uno nuevo.

// 32 hex = 128 bits, mismo formato que los portalToken de Expediente/Familia.
const nuevoToken = () => crypto.randomUUID().replace(/-/g, "");

// Devuelve el token del espacio del cliente, creándolo si no existe. Defensivo:
// sin la migración cliente-espacio.sql (columna ausente) devuelve null y no rompe nada.
export async function asegurarEspacioToken(admin: SupabaseClient, clienteId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from("Cliente").select("espacioToken").eq("id", clienteId).maybeSingle();
    if (error || !data) return null; // columna ausente o cliente inexistente
    const actual = (data as { espacioToken?: string | null }).espacioToken;
    if (actual) return actual;
    const token = nuevoToken();
    const { error: eUp } = await admin
      .from("Cliente")
      .update({ espacioToken: token, updatedAt: new Date().toISOString() })
      .eq("id", clienteId)
      .is("espacioToken", null); // carrera: solo gana uno
    if (eUp) return null;
    // Si otro proceso ganó la carrera, devuelve el suyo.
    const { data: tras } = await admin.from("Cliente").select("espacioToken").eq("id", clienteId).maybeSingle();
    return (tras as { espacioToken?: string | null } | null)?.espacioToken ?? token;
  } catch {
    return null;
  }
}
