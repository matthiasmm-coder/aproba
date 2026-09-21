import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarMandato, personaEncargo } from "@/lib/encargo";
import { trabajadorPorToken } from "@/lib/trabajador-token";

// El MANDATO de representación del trabajador, desde su enlace individual (/t/<token>):
// es él quien lo firma (es a él a quien se representa). Solo el suyo — nunca la hoja de
// encargo de la empresa ni el mandato de otro trabajador.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });
  const admin = createSupabaseAdmin();
  const tr = await trabajadorPorToken(admin, token);
  if (!tr) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const { data: ws } = await admin.from("Workspace").select("hojaEncargoActiva, mandatoPropioPath").eq("id", tr.exp.workspaceId).maybeSingle();
  const w = ws as { hojaEncargoActiva?: boolean; mandatoPropioPath?: string | null } | null;
  if (!w?.hojaEncargoActiva) return NextResponse.json({ error: "Función no activada" }, { status: 404 });

  // Mandato PROPIO del despacho: se sirve tal cual (igual que en el portal).
  if (w.mandatoPropioPath) {
    try {
      const { data: blob } = await admin.storage.from("documentos").download(w.mandatoPropioPath);
      if (blob) {
        return new Response(Buffer.from(await blob.arrayBuffer()), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="mandato-${tr.exp.referencia}.pdf"`, "Cache-Control": "no-store" },
        });
      }
    } catch { /* repli al generado */ }
  }

  const { data: expRow } = await admin.from("Expediente").select("*, cliente:Cliente(*)").eq("id", tr.exp.id).maybeSingle();
  const datos = expRow ? await datosEncargo(admin, expRow as never) : null;
  if (!datos) return NextResponse.json({ error: "Faltan datos del servicio" }, { status: 409 });

  let bytes: Uint8Array;
  try {
    bytes = await generarMandato(datos, personaEncargo({ ...tr.cliente.ficha, nombre: tr.cliente.nombre, apellidos: tr.cliente.apellidos }));
  } catch (e) {
    console.error("[trabajador encargo] PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el documento." }, { status: 500 });
  }
  const slug = `${tr.cliente.nombre} ${tr.cliente.apellidos ?? ""}`.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="mandato-${tr.exp.referencia}-${slug}.pdf"`, "Cache-Control": "no-store" },
  });
}
