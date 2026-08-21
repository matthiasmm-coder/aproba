import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetallePorToken } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente, formularioParaMiembro, type ExtraFormulario } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { rellenarOficial, formulariosDelTramite } from "@/lib/ex-forms";

export const runtime = "nodejs";

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
// Mismo orden de estados que la página de seguimiento.

// GET ?tipo=EX-17 → el cliente descarga el formulario oficial relleno con SUS datos.
// El portalToken ES la credencial. Solo se sirve si (1) los formularios ya están
// generados y (2) el modelo corresponde al trámite de ese expediente.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";

  const exp = await fetchExpedienteDetallePorToken(token);
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  // Sin puerta de ESTADO. La resolución de más abajo ya es 100 % factual (si el
  // formulario/la tasa no existe, devuelve 404), y la puerta anterior contradecía al
  // propio portal: /s enseña los botones en cuanto el fichero existe, y esta ruta los
  // rechazaba con un 403 mientras el estado no hubiera avanzado — 29 expedientes
  // estaban exactamente en ese caso. Además tasaPath NUNCA se escribe en el flujo
  // familiar (la tasa del miembro vive en el storage), así que una puerta sobre él
  // habría roto la descarga de TODAS las familias.
  // Expediente FAMILIAR: ?clienteId=<miembro> → formulario relleno con LOS DATOS DE ESE
  // solicitante (anti-IDOR: el miembro debe pertenecer a la familia del expediente).
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";

  // El modelo debe estar en lo que el gestor generó (selección persistida) — y con
  // curación POR MIEMBRO, en lo generado para ESE miembro (un miembro no descarga el
  // formulario de otro con sus datos). Replis en cadena si faltan las columnas.
  // permitidos === null ⇔ columnas ilegibles (pre-migración) → modelos del trámite.
  // Con columnas legibles, la VERDAD es lo persistido: nada generado → nada que servir.
  let permitidos: string[] | null = null;
  try {
    const admin = createSupabaseAdmin();
    let res = await admin.from("Expediente").select("formulariosGenerados, formulariosPorMiembro").eq("portalToken", token).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select("formulariosGenerados").eq("portalToken", token).maybeSingle() as typeof res;
    const row = res.data as { formulariosGenerados?: string[] | null; formulariosPorMiembro?: unknown } | null;
    if (!res.error && row) {
      const pm = row.formulariosPorMiembro && typeof row.formulariosPorMiembro === "object" && !Array.isArray(row.formulariosPorMiembro)
        ? (row.formulariosPorMiembro as Record<string, string[]>) : null;
      if (clienteId && pm) permitidos = Array.isArray(pm[clienteId]) ? pm[clienteId] : [];
      else permitidos = Array.isArray(row.formulariosGenerados) ? row.formulariosGenerados : [];
    }
  } catch { /* repli */ }
  const lista = permitidos === null ? formulariosDelTramite(exp.tipoEnum, [exp.servicioClave, ...exp.serviciosExtra]) : permitidos;
  if (!lista.includes(tipo)) {
    return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });
  }
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

  // Casilla p.2 forzada por el gestor → el cliente descarga el MISMO formulario.
  const { fetchP2Overrides } = await import("@/lib/p2-overrides");
  const p2o = await fetchP2Overrides(createSupabaseAdmin(), exp.id);
  const pdf = await rellenarOficial(tipo, datos, p2o[tipo] ?? exp.tipoEnum, extra);
  if (!pdf) return NextResponse.json({ error: "Formulario no disponible." }, { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${limpiar(tipo)}_${limpiar(exp.referencia)}${sufijo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
