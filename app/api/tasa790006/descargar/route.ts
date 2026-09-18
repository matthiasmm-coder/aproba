import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SEDE_006_INFO, descargarPlantilla006, rellenarTasa006, partirFecha006, type Campos006 } from "@/lib/tasa790006";

// Tasa 790-006 — paso 2: baja un ejemplar oficial FRESCO de la Sede de Justicia (el Nº de
// justificante único lo pone su servidor), lo rellena con los campos revisados por el
// gestor y devuelve el PDF. Sin captcha: un solo POST.
// Archivo: {expedienteId}/tasa-790-006[-{clienteId}].pdf — ruta determinista, como la 026.
// tasaPath NO se toca: esa columna y sus consumidores nombran «790-012».

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let body: { expedienteId?: string; clienteId?: string; campos?: Partial<Campos006> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Petición inválida." }, { status: 400 }); }
  const c = body.campos ?? {};
  const expedienteId = body.expedienteId ?? "";
  const clienteId = body.clienteId?.trim() || "";

  for (const k of ["numId", "apellido1", "nombre", "domicilio", "municipio", "provincia", "cp", "firmaLugar"] as const) {
    if (!String(c[k] ?? "").trim()) return NextResponse.json({ error: `Falta un dato obligatorio (${k}).` }, { status: 400 });
  }
  if (!partirFecha006(String(c.fechaNac ?? ""))) return NextResponse.json({ error: "Fecha de nacimiento inválida (dd/mm/aaaa)." }, { status: 400 });
  if (!partirFecha006(String(c.firmaFecha ?? ""))) return NextResponse.json({ error: "Fecha de firma inválida (dd/mm/aaaa)." }, { status: 400 });

  let plantilla: Uint8Array;
  try {
    plantilla = await descargarPlantilla006();
  } catch {
    return NextResponse.json(
      { error: "La Sede del Ministerio de Justicia no responde ahora mismo (no es Aproba). Tus datos quedan en el formulario: inténtalo en un rato.", fallback: SEDE_006_INFO },
      { status: 502 },
    );
  }

  // Dos ejemplares: EDITABLE para el gestor (los campos oficiales siguen vivos) y
  // APLANADO para el archivo del expediente y el portal del cliente.
  let buf: Uint8Array;
  let editable: Uint8Array;
  try {
    editable = await rellenarTasa006(plantilla, c as Campos006, { editable: true });
    buf = await rellenarTasa006(plantilla, c as Campos006);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo rellenar el impreso." }, { status: 502 });
  }

  // Archiva la tasa del expediente (portal del cliente + ZIP). Defensivo: RLS verifica la
  // propiedad y un fallo de guardado nunca rompe la descarga.
  if (expedienteId) {
    try {
      const { data: own } = await supabase.from("Expediente").select("id, familiaId").eq("id", expedienteId).maybeSingle();
      if (own) {
        const admin = createSupabaseAdmin();
        const famId = (own as { familiaId?: string | null }).familiaId;
        if (clienteId && famId) {
          const { data: m } = await supabase.from("Cliente").select("id").eq("id", clienteId).eq("familiaId", famId).maybeSingle();
          if (m) await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-006-${clienteId}.pdf`, buf, { contentType: "application/pdf", upsert: true });
        } else {
          await admin.storage.from("documentos").upload(`${expedienteId}/tasa-790-006.pdf`, buf, { contentType: "application/pdf", upsert: true });
        }
      }
    } catch (e) { console.warn("[tasa790006] no se pudo guardar la tasa:", e instanceof Error ? e.message : e); }
  }

  return new Response(Buffer.from(editable), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="tasa-790-006.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
