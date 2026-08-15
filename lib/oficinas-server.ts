import type { SupabaseClient } from "@supabase/supabase-js";

// MULTI-OFICINA côté serveur — l'expediente HÉRITE de l'oficina de son cliente.
//
// Pourquoi dénormaliser au lieu de faire un join à l'affichage : le board, le
// dashboard et Vencimientos filtrent par oficina à chaque rendu. Une colonne sur
// l'expediente rend ce filtre gratuit ; un join le rendrait systématique.
//
// Conséquence assumée : déplacer un cliente d'oficina doit re-estamper SES
// expedientes (c'est ce que fait `moverClienteDeOficina`). L'estampage n'est jamais
// bloquant — un despacho mono-oficina a `null` partout et ne voit aucune différence.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

// Oficina du cliente, ou null (mono-oficina, cliente sans sede, colonne pas encore migrée).
export async function oficinaDelCliente(admin: Admin, clienteId: string): Promise<string | null> {
  if (!clienteId) return null;
  try {
    const { data, error } = await admin.from("Cliente").select("oficinaId").eq("id", clienteId).maybeSingle();
    if (error || !data) return null;
    return ((data as { oficinaId?: string | null }).oficinaId ?? null) || null;
  } catch {
    return null; // migration pas passée → aucune oficina, rien ne casse
  }
}

// Déplace un cliente vers une oficina ET re-estampe ses expedientes, pour que le
// board reste cohérent. `oficinaId` null = « sans sede ».
export async function moverClienteDeOficina(admin: Admin, clienteId: string, workspaceId: string, oficinaId: string | null) {
  await admin.from("Cliente").update({ oficinaId, updatedAt: new Date().toISOString() })
    .eq("id", clienteId).eq("workspaceId", workspaceId);
  await admin.from("Expediente").update({ oficinaId })
    .eq("clienteId", clienteId).eq("workspaceId", workspaceId);
}

// L'oficina visée existe-t-elle dans CE despacho ? (anti-IDOR : jamais l'id nu du client)
export async function oficinaValida(admin: Admin, oficinaId: string, workspaceId: string): Promise<boolean> {
  if (!oficinaId) return false;
  const { data } = await admin.from("Oficina").select("id").eq("id", oficinaId).eq("workspaceId", workspaceId).maybeSingle();
  return Boolean(data);
}

// Sede du MEMBRE connecté dans ce despacho (null = « Todas »).
//
// Sert à estampiller les clients qu'il crée : sans ça, un gestor de Gran Via créait
// un client sans sede — et comme « sans sede » est visible de tous (règle assumée de
// supabase/oficinas-estanco.sql, pour ne jamais rendre une donnée invisible), Diagonal
// le voyait. L'expediente héritant du client, le trámite fuyait avec lui.
//
// Un membre sur « Todas » crée SANS sede, à dessein : il voit tout, il répartira.
// LA PASTILLE ACTIVE EST LE CONTEXTE DE TRAVAIL. Un admin sur « Oficina Barcelona »
// crée DANS Barcelona ; sur « Todas », il crée sans sede (choix explicite). Un gestor
// multi-sedes suit la même règle : sa pastille active prime, sinon sa PRIMAIRE.
// Le cookie n'est jamais cru sur parole : l'id doit être une oficina de CE despacho
// (et, pour un gestor, une de SES sedes).
export async function oficinaDelUsuario(admin: Admin, userId: string, workspaceId: string): Promise<string | null> {
  try {
    let res = await admin.from("Membership").select("role, oficinaId, oficinaIds")
      .eq("userId", userId).eq("workspaceId", workspaceId).maybeSingle();
    if (res.error) res = await admin.from("Membership").select("role, oficinaId")
      .eq("userId", userId).eq("workspaceId", workspaceId).maybeSingle();
    const m = res.data as { role?: string; oficinaId?: string | null; oficinaIds?: string[] | null } | null;
    if (!m) return null;
    const esAdmin = m.role === "OWNER" || m.role === "ADMIN";
    const misSedes = m.oficinaIds?.length ? m.oficinaIds : m.oficinaId ? [m.oficinaId] : [];

    // pastille active (cookie) — disponible dans les route handlers
    let cookieSede: string | null = null;
    try {
      const { cookies } = await import("next/headers");
      const bruto = (await cookies()).get("aproba_oficina")?.value ?? null;
      if (bruto && bruto !== "todas") cookieSede = bruto;
    } catch { cookieSede = null; /* hors requête (cron) → pas de contexte */ }

    if (cookieSede) {
      if (esAdmin) {
        if (await oficinaValida(admin, cookieSede, workspaceId)) return cookieSede;
      } else if (misSedes.includes(cookieSede)) {
        return cookieSede;
      }
    }
    if (esAdmin) return null;           // admin sur « Todas » : sans sede, explicite
    return misSedes[0] ?? null;         // gestor/asistente : sa primaire
  } catch { return null; }
}

// Contexto de CREACIÓN — como oficinaDelUsuario, pero distingue el «null legítimo»
// (despacho mono-oficina, gestor sin sedes) del «null porque estás en Todas».
//
// « Todas » es una vista de LECTURA: con ≥2 oficinas, crear desde «Todas» exige
// elegir una oficina concreta (requerida=true → la ruta rechaza con 400 y la UI
// muestra el selector). Un gestor mono-sede nunca es requerido: su sede es unívoca.
export async function contextoDeCreacion(
  admin: Admin, userId: string, workspaceId: string,
): Promise<{ sede: string | null; requerida: boolean }> {
  try {
    const { data: m } = await admin.from("Membership")
      .select("role, oficinaId, oficinaIds").eq("userId", userId).eq("workspaceId", workspaceId).limit(1).maybeSingle();
    if (!m) return { sede: null, requerida: false };
    const esAdmin = m.role === "OWNER" || m.role === "ADMIN";
    const misSedes: string[] = (m.oficinaIds as string[] | null)?.length ? (m.oficinaIds as string[]) : m.oficinaId ? [m.oficinaId as string] : [];

    let cookieSede: string | null = null;
    try {
      const { cookies } = await import("next/headers");
      const bruto = (await cookies()).get("aproba_oficina")?.value ?? null;
      if (bruto && bruto !== "todas") cookieSede = bruto;
    } catch { cookieSede = null; }
    if (cookieSede) {
      if (esAdmin) { if (await oficinaValida(admin, cookieSede, workspaceId)) return { sede: cookieSede, requerida: false }; }
      else if (misSedes.includes(cookieSede)) return { sede: cookieSede, requerida: false };
    }

    if (!esAdmin && misSedes.length === 1) return { sede: misSedes[0], requerida: false };
    if (!esAdmin && misSedes.length === 0) return { sede: null, requerida: false }; // gestor sin anclar: no hay nada que elegir

    const { data: ofis } = await admin.from("Oficina").select("id").eq("workspaceId", workspaceId).limit(2);
    const varias = (ofis ?? []).length >= 2;
    if (!varias) return { sede: null, requerida: false }; // despacho mono-oficina: como siempre
    return { sede: null, requerida: true };               // «Todas» con ≥2: hay que elegir
  } catch { return { sede: null, requerida: false }; }
}

// ¿Puede ESTE usuario estampar ESTA oficina? Admin: cualquiera del despacho;
// gestor/asistente: solo una de SUS sedes. Para validar el oficinaId explícito del body.
export async function sedeElegible(admin: Admin, userId: string, oficinaId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data: m } = await admin.from("Membership")
      .select("role, oficinaId, oficinaIds").eq("userId", userId).eq("workspaceId", workspaceId).limit(1).maybeSingle();
    if (!m) return false;
    if (m.role === "OWNER" || m.role === "ADMIN") return oficinaValida(admin, oficinaId, workspaceId);
    const mis: string[] = (m.oficinaIds as string[] | null)?.length ? (m.oficinaIds as string[]) : m.oficinaId ? [m.oficinaId as string] : [];
    return mis.includes(oficinaId) && (await oficinaValida(admin, oficinaId, workspaceId));
  } catch { return false; }
}


// Sede d'une familia, lue sur ses membres. Un proche ajouté à une familia rejoint
// SA sede, pas celle de qui l'ajoute : un admin qui complète une familia de Gran Via
// ne doit pas créer un membre orphelin visible partout.
export async function oficinaDeFamilia(admin: Admin, familiaId: string): Promise<string | null> {
  if (!familiaId) return null;
  try {
    const { data } = await admin.from("Cliente").select("oficinaId")
      .eq("familiaId", familiaId).not("oficinaId", "is", null).limit(1).maybeSingle();
    return ((data as { oficinaId?: string | null } | null)?.oficinaId ?? null) || null;
  } catch { return null; }
}
