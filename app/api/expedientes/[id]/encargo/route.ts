import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo, generarMandato } from "@/lib/encargo";

// El GESTOR descarga la hoja de encargo / el mandato desde la ficha del expediente
// (p. ej. para imprimirlos en el despacho). Autorización: sesión + RLS — el
// expediente solo resuelve dentro de su workspace.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = new URL(req.url).searchParams.get("doc") === "mandato" ? "mandato" : "hoja";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data } = await supabase
    .from("Expediente")
    .select("id, referencia, tipo, servicioClave, workspaceId, cliente:Cliente(*)")
    .eq("id", id)
    .maybeSingle();
  const exp = data as unknown as {
    id: string; referencia: string; tipo: string; servicioClave: string | null; workspaceId: string;
    cliente: Record<string, string | null> | null;
  } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const datos = await datosEncargo(admin, exp);
  if (!datos) return NextResponse.json({ error: "Configura primero el servicio del expediente." }, { status: 409 });

  let bytes: Uint8Array;
  try {
    bytes = doc === "mandato" ? await generarMandato(datos) : await generarHojaEncargo(datos);
  } catch (e) {
    // Un dato con carácter no imprimible no debe romper la descarga con un 500 opaco.
    console.error("[encargo] generación PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el documento. Revisa que los datos no contengan caracteres extraños." }, { status: 500 });
  }
  const nombre = doc === "mandato" ? `mandato-${exp.referencia}.pdf` : `hoja-de-encargo-${exp.referencia}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
