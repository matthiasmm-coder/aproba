import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo, generarMandato } from "@/lib/encargo";

// El CLIENTE descarga desde su portal la hoja de encargo y el mandato ya
// cumplimentados (los firma y los vuelve a subir como documentos del expediente).
// Autorización: el portalToken (mismo nivel de acceso que /j). Solo si la
// gestoría tiene la función activada en Ajustes.

const SELECT = "id, referencia, tipo, servicioClave, workspaceId, cliente:Cliente(*)";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const doc = url.searchParams.get("doc") === "mandato" ? "mandato" : "hoja";
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data } = await admin.from("Expediente").select(SELECT).eq("portalToken", token).maybeSingle();
  const exp = data as unknown as {
    id: string; referencia: string; tipo: string; servicioClave: string | null; workspaceId: string;
    cliente: Record<string, string | null> | null;
  } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

  // La función debe estar activada por la gestoría (columna con repli pre-migración).
  const { data: ws } = await admin.from("Workspace").select("hojaEncargoActiva").eq("id", exp.workspaceId).maybeSingle();
  if (!(ws as { hojaEncargoActiva?: boolean } | null)?.hojaEncargoActiva) {
    return NextResponse.json({ error: "Función no activada" }, { status: 404 });
  }

  const datos = await datosEncargo(admin, exp);
  if (!datos) return NextResponse.json({ error: "Faltan datos del servicio" }, { status: 409 });

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
