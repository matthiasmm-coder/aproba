import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchFacturasDeExpediente } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { datosNormalizados, buildFormularios } from "@/lib/formularios";
import { formularioToPdf } from "@/lib/formularios-pdf";
import { rellenarOficial, formulariosDelTramite } from "@/lib/ex-forms";
import { facturaToPdf } from "@/lib/export-pdf";
import { crearZip, nombreSeguro, type ZipEntry } from "@/lib/zip";
import { FICHA_CAMPOS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { DOC_LABEL } from "@/lib/tramites";

export const runtime = "nodejs";
export const maxDuration = 60; // baja documentos + regenera PDFs: puede tardar más que el default

async function gestoriaDe(supabase: Awaited<ReturnType<typeof createSupabaseServer>>): Promise<string> {
  const { data } = await supabase.from("Membership").select("Workspace(nombre)").limit(1).maybeSingle();
  const ws = (data as { Workspace?: { nombre?: string } | { nombre?: string }[] } | null)?.Workspace;
  const w = Array.isArray(ws) ? ws[0] : ws;
  return w?.nombre ?? "Tu gestoría";
}

// Ficha del cliente → texto legible (UTF-8, conserva cualquier alfabeto).
function fichaTxt(exp: { referencia: string; tipoLabel?: string; clienteNombre: string; clienteFicha?: ClienteFicha | null }): string {
  const ficha = (exp.clienteFicha ?? {}) as Record<string, string | undefined>;
  const val = (k: string, v?: string) => {
    if (!v) return "";
    if (k === "sexo") return (SEXOS.find(([c]) => c === v)?.[1] as string) ?? v;
    if (k === "estadoCivil") return (ESTADOS_CIVILES.find(([c]) => c === v)?.[1] as string) ?? v;
    return v;
  };
  const out: string[] = ["FICHA DEL CLIENTE", `Expediente: ${exp.referencia}${exp.tipoLabel ? `  ·  ${exp.tipoLabel}` : ""}`, `Cliente: ${exp.clienteNombre}`, ""];
  for (const grupo of GRUPOS) {
    const filas = FICHA_CAMPOS.filter((c) => c.grupo === grupo)
      .map((c) => ({ label: c.label, v: val(c.k, ficha[c.k]) }))
      .filter((x) => x.v);
    if (!filas.length) continue;
    out.push(`— ${grupo.toUpperCase()} —`);
    for (const f of filas) out.push(`  ${f.label}: ${f.v}`);
    out.push("");
  }
  out.push("Exportado con Aproba.");
  return out.join("\n");
}

// GET → .zip con TODO el expediente: ficha, documentos del cliente, formularios (EX + 790)
// y facturas. Autorización por sesión/RLS (fetchExpedienteDetalle → 404 si no es del
// workspace); los binarios del bucket privado se bajan con service_role. Cada pieza es
// best-effort: un fallo aislado no rompe el resto del ZIP.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const exp = await fetchExpedienteDetalle(id); // RLS → null si no es del workspace
  if (!exp) return NextResponse.json({ error: "Expediente no encontrado." }, { status: 404 });

  const admin = createSupabaseAdmin();
  const carpeta = nombreSeguro(exp.referencia);
  const entries: ZipEntry[] = [];
  const usados = new Set<string>();
  const errores: string[] = [];
  // add con deduplicación de nombres: dos ficheros con el mismo nombre no se pisan en el ZIP.
  const add = (name: string, data: Uint8Array) => {
    let full = `${carpeta}/${name}`;
    if (usados.has(full)) {
      const barra = full.lastIndexOf("/"), punto = full.lastIndexOf(".");
      const [base, ext] = punto > barra ? [full.slice(0, punto), full.slice(punto)] : [full, ""];
      let i = 2; while (usados.has(`${base} (${i})${ext}`)) i++;
      full = `${base} (${i})${ext}`;
    }
    usados.add(full);
    entries.push({ name: full, data });
  };

  // 1) Ficha del cliente
  add("ficha_cliente.txt", new TextEncoder().encode(fichaTxt(exp)));

  // 2) Documentos subidos por el cliente (bucket privado → service_role)
  try {
    const { data: docs } = await supabase.from("Documento").select("storagePath, nombreArchivo, tipo").eq("expedienteId", id);
    for (const d of docs ?? []) {
      const sp = d.storagePath as string | null;
      const etiqueta = (d.nombreArchivo as string) || DOC_LABEL[d.tipo as string] || String(d.tipo);
      if (!sp) continue; // documento declarado pero aún sin archivo subido → no es un error
      try {
        const { data: blob, error } = await admin.storage.from("documentos").download(sp);
        if (error || !blob) throw new Error(error?.message ?? "archivo no disponible");
        const ext = sp.split(".").pop() ?? "bin";
        const nombre = (d.nombreArchivo as string) || `${DOC_LABEL[d.tipo as string] ?? d.tipo}.${ext}`;
        add(`documentos/${nombreSeguro(nombre)}`, new Uint8Array(await blob.arrayBuffer()));
      } catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] doc", sp, m); errores.push(`Documento "${etiqueta}": ${m}`); }
    }
  } catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] documentos", m); errores.push(`Documentos: ${m}`); }

  // 3) Formularios oficiales (EX) + borradores propios (EX-10 / 790-012)
  try {
    const datos = datosNormalizados(exp);
    const hechos = new Set<string>();
    for (const code of formulariosDelTramite(exp.tipoEnum, exp.servicioClave)) {
      try { const b = await rellenarOficial(code, datos, exp.tipoEnum); if (b) { add(`formularios/${nombreSeguro(code)}.pdf`, b); hechos.add(code); } }
      catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] oficial", code, m); errores.push(`Formulario ${code}: ${m}`); }
    }
    const gestoria = await gestoriaDe(supabase);
    for (const f of buildFormularios(exp)) {
      if (hechos.has(f.tipo)) continue;
      try { const b = await formularioToPdf(f, { referencia: exp.referencia, clienteNombre: exp.clienteNombre, gestoria, fecha: exp.creado }); add(`formularios/${nombreSeguro(f.tipo)}.pdf`, b); }
      catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] borrador", f.tipo, m); errores.push(`Formulario ${f.tipo}: ${m}`); }
    }
  } catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] formularios", m); errores.push(`Formularios: ${m}`); }

  // 4) Facturas del expediente → PDF
  try {
    const facturas = await fetchFacturasDeExpediente(id);
    if (facturas.length) {
      const d = await fetchDespacho();
      const emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion };
      for (const f of facturas) {
        try { add(`facturas/factura_${nombreSeguro(f.numero)}.pdf`, await facturaToPdf(f, emisor)); }
        catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] factura", f.numero, m); errores.push(`Factura ${f.numero}: ${m}`); }
      }
    }
  } catch (e) { const m = e instanceof Error ? e.message : String(e); console.error("[exportar] facturas", m); errores.push(`Facturas: ${m}`); }

  // Registro del export (siempre en el ZIP): qué se incluyó y qué NO se pudo incluir. Sirve
  // de señal RGPD/oficial de que el paquete está completo (o de qué falta).
  const log = [
    `Export del expediente ${exp.referencia} — ${exp.clienteNombre}`,
    `Fecha: ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Archivos incluidos (${entries.length}):`,
    ...entries.map((e) => `  - ${e.name.slice(carpeta.length + 1)}  (${e.data.length} bytes)`),
  ];
  if (errores.length) log.push("", `NO se pudieron incluir (${errores.length}):`, ...errores.map((e) => `  - ${e}`));
  add("_export_log.txt", new TextEncoder().encode(log.join("\n")));

  const zip = crearZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${carpeta}.zip"`,
      "Cache-Control": "no-store",
      ...(errores.length ? { "X-Export-Warnings": String(errores.length) } : {}),
    },
  });
}
