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

export async function GET() {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(await fetchEstadoCobroTarjeta(r.admin, r.workspaceId));
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

  const { error } = await r.admin
    .from("StripeCuenta")
    .upsert({ workspaceId: r.workspaceId, secretKeyEnc, activa: true, updatedAt: new Date().toISOString() }, { onConflict: "workspaceId" });
  if (error) {
    // Tabla sin migrar todavía → mensaje claro para el operador.
    return NextResponse.json({ error: `No se pudo guardar (¿falta la migración StripeCuenta?): ${error.message}` }, { status: 500 });
  }
  return NextResponse.json(await fetchEstadoCobroTarjeta(r.admin, r.workspaceId));
}

export async function DELETE() {
  const r = await adminYWorkspace();
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const { error } = await r.admin.from("StripeCuenta").delete().eq("workspaceId", r.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configurado: false, activa: false, modo: null, cola: null });
}
