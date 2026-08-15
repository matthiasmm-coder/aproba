import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { cifrarClave, fetchEstadoCobroTarjeta } from "@/lib/cobros-tarjeta";

// Configuración del cobro con tarjeta del despacho: guarda/retira la clave secreta
// Stripe de la gestoría. La clave se CIFRA y se escribe con service_role en la tabla
// StripeCuenta (deny-all). Solo administradores (OWNER/ADMIN). El navegador nunca
// recibe la clave de vuelta: GET solo devuelve estado (configurado / modo / cola).

async function adminYWorkspace() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  if (!puedeGestionarEquipo(mem.role as string)) return { error: "Solo un administrador puede configurar el cobro con tarjeta.", status: 403 as const };
  return { admin, workspaceId: mem.workspaceId as string };
}

// ¿La oficina pedida es de MI despacho? (anti-IDOR; null = ámbito común)
async function oficinaValidada(admin: ReturnType<typeof createSupabaseAdmin>, ws: string, bruto: string | null): Promise<{ oficinaId: string | null } | { error: string }> {
  const oficinaId = (bruto ?? "").trim() || null;
  if (!oficinaId) return { oficinaId: null };
  const { data } = await admin.from("Oficina").select("id").eq("id", oficinaId).eq("workspaceId", ws).maybeSingle();
  return data ? { oficinaId } : { error: "Oficina no encontrada." };
}

export async function GET(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const v = await oficinaValidada(r.admin, r.workspaceId, new URL(req.url).searchParams.get("oficina"));
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 404 });
  return NextResponse.json(await fetchEstadoCobroTarjeta(r.admin, r.workspaceId, v.oficinaId));
}

export async function POST(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  let body: { secretKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const key = (body.secretKey ?? "").trim();
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key)) {
    return NextResponse.json({ error: "La clave no parece válida. Debe empezar por sk_live_, rk_live_, sk_test_ o rk_test_." }, { status: 400 });
  }

  let secretKeyEnc: string;
  try { secretKeyEnc = cifrarClave(key); } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cifrar la clave." }, { status: 500 });
  }

  const v = await oficinaValidada(r.admin, r.workspaceId, (body as { oficinaId?: string | null }).oficinaId ?? null);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 404 });

  // select-then-write, NUNCA upsert: la unicidad por ámbito vive en índices parciales
  // (WHERE oficinaId IS [NOT] NULL) y ON CONFLICT no puede inferirlos.
  const patch = { secretKeyEnc, activa: true, updatedAt: new Date().toISOString() };
  let q = r.admin.from("StripeCuenta").select("id").eq("workspaceId", r.workspaceId);
  q = v.oficinaId ? q.eq("oficinaId", v.oficinaId) : q.is("oficinaId", null);
  let error: { message: string } | null = null;
  try {
    const { data: filas, error: eSel } = await q.limit(1);
    if (eSel) throw eSel;
    if ((filas ?? []).length) {
      ({ error } = await r.admin.from("StripeCuenta").update(patch).eq("id", (filas as { id: string }[])[0].id));
    } else {
      ({ error } = await r.admin.from("StripeCuenta").insert({ id: crypto.randomUUID(), workspaceId: r.workspaceId, ...(v.oficinaId ? { oficinaId: v.oficinaId } : {}), ...patch }));
    }
  } catch {
    if (v.oficinaId) return NextResponse.json({ error: "Falta la migración: ejecuta supabase/oficinas-facturacion.sql para claves por oficina." }, { status: 500 });
    // esquema viejo (PK workspaceId, sin columnas id/oficinaId) → upsert de siempre
    ({ error } = await r.admin.from("StripeCuenta")
      .upsert({ workspaceId: r.workspaceId, ...patch }, { onConflict: "workspaceId" }));
  }
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar (¿falta la migración StripeCuenta?): ${error.message}` }, { status: 500 });
  }
  return NextResponse.json(await fetchEstadoCobroTarjeta(r.admin, r.workspaceId, v.oficinaId));
}

export async function DELETE(req: Request) {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const v = await oficinaValidada(r.admin, r.workspaceId, new URL(req.url).searchParams.get("oficina"));
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 404 });
  let q = r.admin.from("StripeCuenta").delete().eq("workspaceId", r.workspaceId);
  try {
    q = v.oficinaId ? q.eq("oficinaId", v.oficinaId) : q.is("oficinaId", null);
    const { error } = await q;
    if (error) throw error;
  } catch {
    if (v.oficinaId) return NextResponse.json({ error: "Falta la migración fase 6." }, { status: 500 });
    const { error } = await r.admin.from("StripeCuenta").delete().eq("workspaceId", r.workspaceId); // esquema viejo
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ configurado: false, activa: false, modo: null, cola: null });
}
