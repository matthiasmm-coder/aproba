import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetallePorToken } from "@/lib/data/expedientes";
import { datosNormalizados, datosDeCliente, formularioParaMiembro, type ExtraFormulario } from "@/lib/formularios";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";
import { rellenarOficial, formulariosDelTramite } from "@/lib/ex-forms";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { crearZip, nombreSeguro, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const maxDuration = 60; // regenera varios PDFs + baja la tasa del storage

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
const ORDEN: Record<string, number> = {
  BORRADOR: 0, DOCS_PENDIENTES: 1, DOCS_VALIDADOS: 2, FORM_GENERADO: 3,
  PRESENTADO: 4, RESUELTO: 5, CITA_HUELLAS: 6, FINALIZADO: 7, RECHAZADO: 4,
};

// GET [?clienteId=<miembro>] → TODOS los formularios generados (de ese miembro en un
// expediente familiar, o del expediente individual) + su tasa 790, en un único ZIP.
// Mismas reglas que /formulario: portalToken = credencial, estado FORM_GENERADO mínimo,
// solo la selección que el gestor generó (por miembro si existe), anti-IDOR en clienteId.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clienteId = new URL(req.url).searchParams.get("clienteId")?.trim() || "";

  const exp = await fetchExpedienteDetallePorToken(token);
  if (!exp) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if ((ORDEN[exp.estado] ?? 0) < ORDEN.FORM_GENERADO) {
    return NextResponse.json({ error: "Los formularios aún no están listos." }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  // Selección generada por el gestor (por miembro si la migración existe; replis en cadena).
  let flat: string[] | null = null;
  let pm: Record<string, string[]> | null = null;
  let tasaPath: string | null = null;
  try {
    let res = await admin.from("Expediente").select("formulariosGenerados, formulariosPorMiembro, tasaPath").eq("portalToken", token).maybeSingle();
    if (res.error) res = await admin.from("Expediente").select("formulariosGenerados, tasaPath").eq("portalToken", token).maybeSingle() as typeof res;
    const row = res.data as { formulariosGenerados?: string[] | null; formulariosPorMiembro?: unknown; tasaPath?: string | null } | null;
    if (!res.error && row) {
      if (Array.isArray(row.formulariosGenerados)) flat = row.formulariosGenerados;
      if (row.formulariosPorMiembro && typeof row.formulariosPorMiembro === "object" && !Array.isArray(row.formulariosPorMiembro)) {
        pm = row.formulariosPorMiembro as Record<string, string[]>;
      }
      tasaPath = row.tasaPath ?? null;
    }
  } catch { /* repli */ }
  const base = flat && flat.length ? flat : formulariosDelTramite(exp.tipoEnum, [exp.servicioClave, ...exp.serviciosExtra]);

  // Datos + lista del MIEMBRO (familiar) o del titular (individual).
  let lista = base;
  let datosTitular = datosNormalizados(exp);
  let miembro: { datos: ReturnType<typeof datosDeCliente>; fechaNacimiento?: string; nombre: string } | null = null;
  let sufijo = "";
  if (clienteId && exp.familiaId) {
    const { data: m } = await admin.from("Cliente").select(FICHA_KEYS.join(", ")).eq("id", clienteId).eq("familiaId", exp.familiaId).maybeSingle();
    if (!m) return NextResponse.json({ error: "Miembro no encontrado." }, { status: 404 });
    const row = m as unknown as Record<string, string | null>;
    const ficha: ClienteFicha = {};
    for (const k of FICHA_KEYS) { const v = row[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
    const nombreCompleto = `${row.nombre ?? ""} ${row.apellidos ?? ""}`.trim();
    miembro = { datos: datosDeCliente(ficha, nombreCompleto, row.telefono, row.email), fechaNacimiento: ficha.fechaNacimiento, nombre: nombreCompleto };
    sufijo = nombreCompleto ? `_${limpiar(nombreCompleto)}` : "";
    if (pm) lista = Array.isArray(pm[clienteId]) ? pm[clienteId] : [];
  }

  const p2o = await fetchP2Overrides(admin, exp.id);
  const entries: ZipEntry[] = [];
  for (const code of lista) {
    try {
      let datos = datosTitular;
      let extra: ExtraFormulario | undefined;
      if (miembro) ({ datos, extra } = formularioParaMiembro(code, datosTitular, miembro.datos, miembro.fechaNacimiento));
      const pdf = await rellenarOficial(code, datos, p2o[code] ?? exp.tipoEnum, extra);
      if (pdf) entries.push({ name: `${nombreSeguro(code)}.pdf`, data: pdf });
    } catch (e) { console.error("[seguimiento zip] form", code, e instanceof Error ? e.message : e); }
  }

  // Tasa 790: nominativa del miembro (familiar) o la del expediente (individual).
  try {
    const ruta = clienteId && exp.familiaId ? `${exp.id}/tasa-790-012-${clienteId}.pdf` : tasaPath;
    if (ruta) {
      const { data: blob } = await admin.storage.from("documentos").download(ruta);
      if (blob) entries.push({ name: "tasa-790-012.pdf", data: new Uint8Array(await blob.arrayBuffer()) });
    }
  } catch { /* sin tasa */ }

  if (!entries.length) return NextResponse.json({ error: "Nada que descargar." }, { status: 404 });
  const zip = crearZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="formularios_${limpiar(exp.referencia)}${sufijo}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
