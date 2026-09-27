import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { datosEncargo, generarHojaEncargo, personaEncargo, type PersonaEncargo } from "@/lib/encargo";
import { mandatoDelExpediente } from "@/lib/mandato";
import { encargoActivoEfectivo } from "@/lib/facturacion-oficina";

// El CLIENTE descarga desde su portal la hoja de encargo y el mandato ya
// cumplimentados (los firma y los vuelve a subir como documentos del expediente).
// Autorización: el portalToken (mismo nivel de acceso que /j). Cada documento solo si
// SU interruptor está activado (Ajustes; el de la sede si tiene bloque propio).

const SELECT = "id, referencia, tipo, servicioClave, serviciosExtra, suplidosOverride, descuento, serviciosAsignacion, familiaId, workspaceId, oficinaId, cliente:Cliente(*)";
const SELECT_SIN_ASIG = SELECT.replace(", serviciosAsignacion", "");
const SELECT_SIN_DESC = SELECT_SIN_ASIG.replace(", descuento", "");
const SELECT_SIN_SUP = SELECT_SIN_DESC.replace(", suplidosOverride", "");
const SELECT_SIN_EXTRAS = SELECT_SIN_SUP.replace(", serviciosExtra", "");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const doc = url.searchParams.get("doc") === "mandato" ? "mandato" : "hoja";
  // Expediente DE EMPRESA: ?clienteId=<trabajador> → SU mandato (cada uno firma el suyo).
  const trabajadorId = url.searchParams.get("clienteId")?.trim() ?? "";
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });

  const admin = createSupabaseAdmin();
  let res = await admin.from("Expediente").select(SELECT).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(SELECT_SIN_ASIG).eq("portalToken", token).maybeSingle() as typeof res;
  if (res.error) res = await admin.from("Expediente").select(SELECT_SIN_DESC).eq("portalToken", token).maybeSingle() as typeof res;
  if (res.error) res = await admin.from("Expediente").select(SELECT_SIN_SUP).eq("portalToken", token).maybeSingle() as typeof res;
  if (res.error) res = await admin.from("Expediente").select(SELECT_SIN_EXTRAS).eq("portalToken", token).maybeSingle() as typeof res;
  const exp = res.data as unknown as {
    id: string; referencia: string; tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null;
    suplidosOverride?: { concepto: string; importe: number }[] | null; serviciosAsignacion?: unknown; familiaId?: string | null; workspaceId: string;
    oficinaId?: string | null; cliente: Record<string, string | null> | null;
  } | null;
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado" }, { status: 404 });

  // Hoja y mandato tienen cada uno su interruptor (27/09/2026), resuelto como en /j.
  const activo = await encargoActivoEfectivo(admin, exp.workspaceId, exp.oficinaId ?? null);
  if (doc === "mandato" ? !activo.mandato : !activo.hoja) {
    return NextResponse.json({ error: "Función no activada" }, { status: 404 });
  }

  const datos = await datosEncargo(admin, exp);
  if (!datos) return NextResponse.json({ error: "Faltan datos del servicio" }, { status: 409 });

  let persona: PersonaEncargo | undefined;
  let sufijo = "";
  if (doc === "mandato" && trabajadorId) {
    // Pertenencia al lote de ESTE expediente (anti-IDOR): un id ajeno no existe.
    const { data: tr } = await admin.from("ExpedienteTrabajador").select("clienteId, cliente:Cliente(*)").eq("expedienteId", exp.id).eq("clienteId", trabajadorId).maybeSingle();
    const c = tr ? ((Array.isArray(tr.cliente) ? tr.cliente[0] : tr.cliente) as Record<string, string | null> | null) : null;
    if (!c) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });
    persona = personaEncargo(c);
    sufijo = "-" + `${persona.nombre} ${persona.apellidos}`.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }
  let bytes: Uint8Array;
  try {
    // Portal del CLIENTE: mismo mandato que el gestor (lib/mandato), aplanado.
    bytes = doc === "mandato" ? (await mandatoDelExpediente(admin, exp, datos, persona, { editable: false })).bytes : await generarHojaEncargo(datos);
  } catch (e) {
    // Un dato con carácter no imprimible no debe romper la descarga con un 500 opaco.
    console.error("[encargo] generación PDF", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el documento. Revisa que los datos no contengan caracteres extraños." }, { status: 500 });
  }
  const nombre = doc === "mandato" ? `mandato-${exp.referencia}${sufijo}.pdf` : `hoja-de-encargo-${exp.referencia}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
