import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { puedeGestionarEquipo } from "@/lib/planes";
import { MAX_FIRMA_SUBIDA, borrarFirma, guardarFirma, leerFirma, normalizarFirma } from "@/lib/firma-despacho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FIRMA (Y SELLO) del profesional en la hoja de encargo, el presupuesto y el mandato
// (lib/firma-despacho.ts). ?oficina=<id> = la de esa sede; sin él, la del despacho.
//   GET    → la imagen (cualquier miembro: la ve en Ajustes) · 404 si no hay
//   POST   → multipart «firma» (PNG, JPEG o WebP). Solo administradores.
//   DELETE → la quita. Solo administradores.

async function contexto(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 as const };
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId, role").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return { error: "No perteneces a ningún despacho.", status: 403 as const };
  const workspaceId = mem.workspaceId as string;
  // La sede, solo si es de este despacho (anti-IDOR).
  const oficina = new URL(req.url).searchParams.get("oficina");
  let oficinaId: string | null = null;
  if (oficina) {
    const { data: of } = await admin.from("Oficina").select("id").eq("id", oficina).eq("workspaceId", workspaceId).maybeSingle();
    if (!of) return { error: "Oficina no encontrada.", status: 404 as const };
    oficinaId = of.id as string;
  }
  return { admin, workspaceId, oficinaId, esAdmin: puedeGestionarEquipo(mem.role as string) };
}

export async function GET(req: Request) {
  const c = await contexto(req);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const png = await leerFirma(c.admin, c.workspaceId, c.oficinaId);
  if (!png) return NextResponse.json({ error: "Sin firma." }, { status: 404 });
  return new NextResponse(Buffer.from(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const c = await contexto(req);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  if (!c.esAdmin) return NextResponse.json({ error: "Solo un administrador puede cambiar la firma." }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const archivo = form.get("firma");
  if (!(archivo instanceof File) || !archivo.size) return NextResponse.json({ error: "Elige la imagen de la firma." }, { status: 400 });
  if (archivo.size > MAX_FIRMA_SUBIDA) return NextResponse.json({ error: "La imagen pesa demasiado: como mucho 5 MB." }, { status: 400 });
  let png: Uint8Array;
  try { png = await normalizarFirma(new Uint8Array(await archivo.arrayBuffer())); }
  catch { return NextResponse.json({ error: "No es una imagen válida: usa un PNG o un JPG." }, { status: 400 }); }
  try {
    await guardarFirma(c.admin, c.workspaceId, c.oficinaId, png);
  } catch (e) {
    console.error("[firma] guardar:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo guardar la firma. Inténtalo de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const c = await contexto(req);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  if (!c.esAdmin) return NextResponse.json({ error: "Solo un administrador puede quitar la firma." }, { status: 403 });
  try {
    await borrarFirma(c.admin, c.workspaceId, c.oficinaId);
  } catch (e) {
    console.error("[firma] borrar:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo quitar la firma." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
