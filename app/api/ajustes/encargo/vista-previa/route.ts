import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MODELOS_VISTA_PREVIA, vistaPreviaEncargo, type ModeloVistaPrevia } from "@/lib/vista-previa-encargo";

// Ajustes › Hoja de encargo y mandato › «Ver con un cliente de ejemplo» (01/10/2026): la hoja
// de encargo, el presupuesto o un mandato del despacho, con un cliente inventado
// (lib/vista-previa-encargo.ts).
//   ?doc=hoja|presupuesto|mandato  ·  &modelo=extranjeria|nacionalidad|general|siempre (mandato)
//   &oficina=<id> (catálogo y bloque de esa sede)  ·  &servicio=<clave> (si no, el primero activo)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("doc");
  const doc = q === "mandato" ? "mandato" : q === "presupuesto" ? "presupuesto" : "hoja";
  const modeloQ = url.searchParams.get("modelo") ?? "";
  const modelo = (MODELOS_VISTA_PREVIA as readonly string[]).includes(modeloQ) ? (modeloQ as ModeloVistaPrevia) : null;

  const supa = await createSupabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data: mem } = await admin.from("Membership").select("workspaceId").eq("userId", user.id).limit(1).maybeSingle();
  if (!mem) return NextResponse.json({ error: "No se encontró tu despacho." }, { status: 403 });
  const workspaceId = (mem as { workspaceId: string }).workspaceId;

  // La sede se valida contra MI despacho (anti-IDOR): nadie ve los documentos del vecino.
  const oficinaId = url.searchParams.get("oficina")?.trim() || null;
  if (oficinaId) {
    const { data: of } = await admin.from("Oficina").select("id").eq("id", oficinaId).eq("workspaceId", workspaceId).maybeSingle();
    if (!of) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });
  }

  let r;
  try {
    r = await vistaPreviaEncargo(admin, { workspaceId, oficinaId, doc, modelo, servicio: url.searchParams.get("servicio") });
  } catch (e) {
    console.error("[vista-previa encargo]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar la vista previa. Revisa que los datos no contengan caracteres extraños." }, { status: 500 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return new Response(Buffer.from(r.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.nombre}"`, "Cache-Control": "no-store" },
  });
}
