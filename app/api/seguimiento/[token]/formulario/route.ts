import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetallePorToken } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente, formularioParaMiembro, type ExtraFormulario } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { rellenarOficial, formulariosDelTramite } from "@/lib/ex-forms";

export const runtime = "nodejs";

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
// Mismo orden de estados que la página de seguimiento.
const ORDEN: Record<string, number> = {
  BORRADOR: 0, DOCS_PENDIENTES: 1, DOCS_VALIDADOS: 2, FORM_GENERADO: 3,
  PRESENTADO: 4, RESUELTO: 5, CITA_HUELLAS: 6, FINALIZADO: 7, RECHAZADO: 4,
};

// GET ?tipo=EX-17 → el cliente descarga el formulario oficial relleno con SUS datos.
// El portalToken ES la credencial. Solo se sirve si (1) los formularios ya están
// generados y (2) el modelo corresponde al trámite de ese expediente.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";

  const exp = await fetchExpedienteDetallePorToken(token);
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if ((ORDEN[exp.estado] ?? 0) < ORDEN.FORM_GENERADO) {
    return NextResponse.json({ error: "Los formularios aún no están listos." }, { status: 403 });
  }
  // El modelo debe estar en lo que el gestor generó (selección persistida). Repli sobre
  // los modelos del trámite si la columna aún no existe (antes de la migración).
  let permitidos: string[] | null = null;
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from("Expediente").select("formulariosGenerados").eq("portalToken", token).maybeSingle();
    const fg = (data as { formulariosGenerados?: string[] | null } | null)?.formulariosGenerados;
    if (!error && Array.isArray(fg)) permitidos = fg;
  } catch { /* repli */ }
  const lista = permitidos && permitidos.length ? permitidos : formulariosDelTramite(exp.tipoEnum, exp.servicioClave);
  if (!lista.includes(tipo)) {
    return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });
  }

  // Expediente FAMILIAR: ?clienteId=<miembro> → formulario relleno con LOS DATOS DE ESE
  // solicitante (anti-IDOR: el miembro debe pertenecer a la familia del expediente).
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";
  let datos = datosNormalizados(exp);
  let extra: ExtraFormulario | undefined;
  let sufijo = "";
  if (clienteId && exp.familiaId) {
    const admin = createSupabaseAdmin();
    const { data: m } = await admin.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
    if (!m) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    const row = m as unknown as Record<string, string | null>;
    const ficha: ClienteFicha = {};
    for (const k of FICHA_KEYS) { const v = row[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
    const nombreCompleto = `${row.nombre ?? ""} ${row.apellidos ?? ""}`.trim();
    const datosMiembro = datosDeCliente(ficha, nombreCompleto, row.telefono, row.email);
    sufijo = nombreCompleto ? `_${limpiar(nombreCompleto)}` : "";
    ({ datos, extra } = formularioParaMiembro(tipo, datosNormalizados(exp), datosMiembro, ficha.fechaNacimiento));
  }

  const pdf = await rellenarOficial(tipo, datos, exp.tipoEnum, extra);
  if (!pdf) return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${limpiar(tipo)}_${limpiar(exp.referencia)}${sufijo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
