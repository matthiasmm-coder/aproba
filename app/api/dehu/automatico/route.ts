import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { ConexionRechazada, conectarDehu, desconectarDehu, estadoDehuAutomatica } from "@/lib/dehu/sincronizar";
import type { Entorno } from "@/lib/dehu/soap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // conectar hace una primera consulta real a la DEHú

// DEHú AUTOMÁTICA — conexión del despacho (lib/dehu/sincronizar.ts).
//   GET    → estado (cualquier miembro; nunca el certificado).
//   POST   → multipart: certificado (.p12/.pfx) + clave (+ entorno). Solo administradores.
//            Se guarda SOLO si la DEHú lo acepta en una primera consulta.
//   DELETE → retira y borra el certificado. Solo administradores.
const MAX_P12 = 64 * 1024;

async function miembro() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  return { admin, userId: user.id, workspaceId: mem.workspaceId as string, esAdmin: puedeGestionarEquipo(mem.role as string) };
}

export async function GET() {
  const m = await miembro();
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
  const estado = await estadoDehuAutomatica(m.admin, m.workspaceId);
  return NextResponse.json({ ...estado, puedeGestionar: m.esAdmin }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const m = await miembro();
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
  if (!m.esAdmin) return NextResponse.json({ error: "Solo un administrador puede conectar la DEHú." }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const archivo = form.get("certificado");
  const clave = String(form.get("clave") ?? "");
  const entorno: Entorno = form.get("entorno") === "PRUEBAS" ? "PRUEBAS" : "PRODUCCION";
  if (!(archivo instanceof File) || !archivo.size) return NextResponse.json({ error: "Elige el archivo del certificado (.p12 o .pfx)." }, { status: 400 });
  if (archivo.size > MAX_P12) return NextResponse.json({ error: "Ese archivo es demasiado grande para ser un certificado." }, { status: 400 });
  if (!clave) return NextResponse.json({ error: "Escribe la contraseña del certificado." }, { status: 400 });
  try {
    const estado = await conectarDehu(m.admin, { workspaceId: m.workspaceId, p12: Buffer.from(await archivo.arrayBuffer()), clave, entorno, userId: m.userId });
    return NextResponse.json({ ...estado, puedeGestionar: true });
  } catch (e) {
    if (e instanceof ConexionRechazada) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[dehu automatico] conectar:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo conectar la DEHú. Inténtalo de nuevo." }, { status: 500 });
  }
}

export async function DELETE() {
  const m = await miembro();
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
  if (!m.esAdmin) return NextResponse.json({ error: "Solo un administrador puede desconectar la DEHú." }, { status: 403 });
  try {
    await desconectarDehu(m.admin, m.workspaceId, m.userId);
    return NextResponse.json({ ...(await estadoDehuAutomatica(m.admin, m.workspaceId)), puedeGestionar: true });
  } catch (e) {
    console.error("[dehu automatico] desconectar:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo desconectar. Inténtalo de nuevo." }, { status: 500 });
  }
}
