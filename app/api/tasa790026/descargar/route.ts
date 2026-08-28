import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SEDE_026_INFO, descargarPlantilla026, rellenarTasa026, partirFecha, type Campos026 } from "@/lib/tasa790026";

// Tasa 790-026 — paso 2: baja un ejemplar oficial FRESCO de la Sede de Justicia (el
// Nº de justificante único lo pone su servidor), lo rellena con los campos revisados
// por el gestor y devuelve el PDF. Sin captcha: un solo POST.
// Archivo: {expedienteId}/tasa-790-026[-{clienteId}].pdf — ruta determinista, como las
// tasas nominativas de la 012. tasaPath NO se toca: esa columna y sus consumidores
// (portal, ZIP, chips) nombran «790-012»; el portal resuelve la 026 por su ruta.

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; clienteId?: string; campos?: Partial<Campos026> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const c = body.campos ?? {};
  const expedienteId = body.expedienteId ?? "";
  const clienteId = body.clienteId?.trim() || "";

  for (const k of ["numId", "apellido1", "nombre", "domicilio", "municipio", "provincia", "cp", "firmaLugar"] as const) {
    if (!String(c[k] ?? "").trim()) return NextResponse.json({ error: `Falta un dato obligatorio (${k}).` }, { status: 400 });
  }
  if (!partirFecha(String(c.fechaNac ?? ""))) return NextResponse.json({ error: "Fecha de nacimiento inválida (dd/mm/aaaa)." }, { status: 400 });
  if (!partirFecha(String(c.firmaFecha ?? ""))) return NextResponse.json({ error: "Fecha de firma inválida (dd/mm/aaaa)." }, { status: 400 });
  if (!["pasaporte", "nie", "dni"].includes(String(c.tipoDoc))) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });

  let plantilla: Uint8Array;
  try {
    plantilla = await descargarPlantilla026();
  } catch {
    return NextResponse.json(
      { error: "La Sede del Ministerio de Justicia no responde ahora mismo (no es Aproba). Tus datos quedan en el formulario: inténtalo en un rato.", fallback: SEDE_026_INFO },
      { status: 502 },
    );
  }

  let buf: Uint8Array;
  try {
    buf = await rellenarTasa026(plantilla, c as Campos026);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo rellenar el impreso." }, { status: 502 });
  }

  // Archiva la tasa para el expediente (portal del cliente + ZIP). Defensivo: RLS
  // verifica la propiedad y un fallo de guardado nunca rompe la descarga.
  if (expedienteId) {
    try {
      const { data: own } = await supabase.from("Expediente").select("id, familiaId").eq("id", expedienteId).maybeSingle();
      if (own) {
        const admin = createSupabaseAdmin();
        if (clienteId && (own as { familiaId?: string | null }).familiaId) {
          const famId = (own as { familiaId?: string | null }).familiaId as string;
          const { data: m } = await supabase.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", famId).maybeSingle();
          if (m) await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-026-${clienteId}.pdf`, buf, { contentType: "application/pdf", upsert: true });
        } else {
          await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-026.pdf`, buf, { contentType: "application/pdf", upsert: true });
        }
      }
    } catch (e) { console.warn("[tasa790026] no se pudo guardar la tasa:", e instanceof Error ? e.message : e); }
  }

  return new Response(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="tasa-790-026.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
