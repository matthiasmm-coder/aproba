import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchFacturasDeExpediente } from "@/lib/data/facturas";
import { fetchDespacho } from "@/lib/data/config";
import { datosNormalizados, datosDeCliente, formularioParaMiembro } from "@/lib/formularios";
import { rellenarOficial } from "@/lib/ex-forms";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { facturaToPdf } from "@/lib/export-pdf";
import { crearZip, nombreSeguro, type ZipEntry } from "@/lib/zip";
import { FICHA_CAMPOS, FICHA_KEYS, GRUPOS, SEXOS, ESTADOS_CIVILES, type ClienteFicha } from "@/lib/ficha";
import { DOC_LABEL } from "@/lib/tramites";

export const runtime = "nodejs";
export const maxDuration = 60; // baja documentos + regenera PDFs: puede tardar más que el default

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
      if (!sp) continue; // documento declarado pero aún sin archivo subido → no es un error
      try {
        const { data: blob, error } = await admin.storage.from("documentos").download(sp);
        if (error || !blob) throw new Error(error?.message ?? "archivo no disponible");
        const ext = sp.split(".").pop() ?? "bin";
        const nombre = (d.nombreArchivo as string) || `${DOC_LABEL[d.tipo as string] ?? d.tipo}.${ext}`;
        add(`documentos/${nombreSeguro(nombre)}`, new Uint8Array(await blob.arrayBuffer()));
      } catch (e) { console.error("[exportar] doc", sp, e instanceof Error ? e.message : e); }
    }
  } catch (e) { console.error("[exportar] documentos", e instanceof Error ? e.message : e); }

  // 3) Formularios: SOLO los que el gestor GENERÓ y guardó (Expediente.formulariosGenerados,
  // codes EX oficiales) + la(s) tasa(s) 790 oficial(es). Nada de defaults del trámite ni
  // borradores → el ZIP contiene exactamente lo de la sección Formularios.
  // Expediente FAMILIAR: un juego de formularios POR SOLICITANTE (con sus datos) + la tasa
  // nominativa de cada uno (ruta determinista tasa-790-012-{clienteId}.pdf del storage).
  try {
    let exRes = await admin.from("Expediente").select("formulariosGenerados, formulariosPorMiembro, tasaPath").eq("id", id).maybeSingle();
    if (exRes.error) exRes = await admin.from("Expediente").select("formulariosGenerados, tasaPath").eq("id", id).maybeSingle() as typeof exRes;
    const extra = exRes.data as { formulariosGenerados?: string[] | null; formulariosPorMiembro?: unknown; tasaPath?: string | null } | null;
    const generados: string[] = Array.isArray(extra?.formulariosGenerados) ? (extra!.formulariosGenerados as string[]) : [];
    // Curación POR MIEMBRO: el ZIP lleva el MISMO juego que la sección Formularios de la
    // ficha (los del miembro), no la unión entera para cada uno.
    const pmZip = extra?.formulariosPorMiembro && typeof extra.formulariosPorMiembro === "object" && !Array.isArray(extra.formulariosPorMiembro)
      ? (extra.formulariosPorMiembro as Record<string, string[]>) : null;

    type MiembroExp = { id: string; nombre: string; datos: ReturnType<typeof datosNormalizados>; fechaNacimiento: string | null };
    let solicitantes: MiembroExp[] = [];
    if (exp.familiaId) {
      let mm = await admin.from("Cliente").select(`id, parentesco, esSolicitante, ${FICHA_KEYS.join(", ")}`).eq("familiaId", exp.familiaId);
      if (mm.error) mm = await admin.from("Cliente").select(`id, parentesco, ${FICHA_KEYS.join(", ")}`).eq("familiaId", exp.familiaId) as typeof mm;
      const rows = ((mm.data ?? []) as unknown[]) as (Record<string, string | null> & { id: string; esSolicitante?: boolean })[];
      const sol = rows.filter((r) => r.esSolicitante);
      solicitantes = (sol.length ? sol : rows).map((r) => {
        const ficha: ClienteFicha = {};
        for (const k of FICHA_KEYS) { const v = r[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
        const nombre = `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim() || "miembro";
        return { id: r.id, nombre, datos: datosDeCliente(ficha, nombre, r.telefono, r.email), fechaNacimiento: (r.fechaNacimiento as string) ?? null };
      });
    }

    if (generados.length) {
      const datosTitular = datosNormalizados(exp);
      // Casilla p.2 forzada por el gestor → mismo relleno que la página Formularios.
      const p2o = await fetchP2Overrides(admin, id);
      const tramiteDe = (code: string) => p2o[code] ?? exp.tipoEnum;
      if (solicitantes.length) {
        for (const s of solicitantes) {
          for (const code of (pmZip ? (pmZip[s.id] ?? []) : generados)) {
            try {
              const { datos, extra: ex } = formularioParaMiembro(code, datosTitular, s.datos, s.fechaNacimiento);
              const b = await rellenarOficial(code, datos, tramiteDe(code), ex);
              if (b) add(`formularios/${nombreSeguro(code)}_${nombreSeguro(s.nombre)}.pdf`, b);
            } catch (e) { console.error("[exportar] oficial", code, s.id, e instanceof Error ? e.message : e); }
          }
        }
      } else {
        for (const code of generados) {
          try {
            const b = await rellenarOficial(code, datosTitular, tramiteDe(code));
            if (b) add(`formularios/${nombreSeguro(code)}.pdf`, b);
          } catch (e) { console.error("[exportar] oficial", code, e instanceof Error ? e.message : e); }
        }
      }
    }
    // Tasa(s) 790 oficial(es) (con código de barras), guardadas en storage al generarlas.
    const tasaPath = (extra?.tasaPath as string | null) ?? null;
    if (tasaPath) {
      try {
        const { data: blob, error } = await admin.storage.from("documentos").download(tasaPath);
        if (error || !blob) throw new Error(error?.message ?? "archivo no disponible");
        add("formularios/tasa-790-012.pdf", new Uint8Array(await blob.arrayBuffer()));
      } catch (e) { console.error("[exportar] tasa790", e instanceof Error ? e.message : e); }
    }
    if (solicitantes.length) {
      const nombrePor = new Map(solicitantes.map((s) => [s.id, s.nombre]));
      try {
        const { data: archivos } = await admin.storage.from("documentos").list(exp.id);
        for (const a of archivos ?? []) {
          const m = a.name.match(/^tasa-790-012-(.+)\.pdf$/);
          if (!m) continue;
          const { data: blob } = await admin.storage.from("documentos").download(`${exp.id}/${a.name}`);
          if (blob) add(`formularios/tasa-790-012_${nombreSeguro(nombrePor.get(m[1]) ?? m[1])}.pdf`, new Uint8Array(await blob.arrayBuffer()));
        }
      } catch (e) { console.error("[exportar] tasas familia", e instanceof Error ? e.message : e); }
    }
  } catch (e) { console.error("[exportar] formularios", e instanceof Error ? e.message : e); }

  // 4) Facturas del expediente → PDF
  try {
    const facturas = await fetchFacturasDeExpediente(id);
    if (facturas.length) {
      const d = await fetchDespacho();
      const emisor = { nombre: d.nombre, nif: d.nif, domicilio: d.domicilio, email: d.emailFacturacion };
      for (const f of facturas) {
        try { add(`facturas/factura_${nombreSeguro(f.numero)}.pdf`, await facturaToPdf(f, emisor)); }
        catch (e) { console.error("[exportar] factura", f.numero, e instanceof Error ? e.message : e); }
      }
    }
  } catch (e) { console.error("[exportar] facturas", e instanceof Error ? e.message : e); }

  // 5) Documentos COMPARTIDOS de la familia (si el cliente pertenece a una): un doc común
  // (libro de familia, vivienda…) subido una vez vale para todos los miembros → se incluye
  // en el export de cada uno. Defensivo: si la tabla no existe aún, se ignora sin romper.
  try {
    const { data: expRow } = await admin.from("Expediente").select("cliente:Cliente(familiaId)").eq("id", id).maybeSingle();
    const cliRaw = (expRow as { cliente?: { familiaId?: string | null } | { familiaId?: string | null }[] | null } | null)?.cliente;
    const cli = Array.isArray(cliRaw) ? cliRaw[0] : cliRaw;
    const familiaId = cli?.familiaId ?? null;
    if (familiaId) {
      const { data: docsFam } = await admin.from("DocumentoFamilia").select("storagePath, nombreArchivo, tipo").eq("familiaId", familiaId);
      for (const d of docsFam ?? []) {
        const sp = d.storagePath as string | null;
        if (!sp) continue;
        try {
          const { data: blob, error } = await admin.storage.from("documentos").download(sp);
          if (error || !blob) throw new Error(error?.message ?? "archivo no disponible");
          const ext = sp.split(".").pop() ?? "bin";
          const nombre = (d.nombreArchivo as string) || `${d.tipo}.${ext}`;
          add(`documentos_familia/${nombreSeguro(nombre)}`, new Uint8Array(await blob.arrayBuffer()));
        } catch (e) { console.error("[exportar] docFamilia", sp, e instanceof Error ? e.message : e); }
      }
    }
  } catch (e) { console.error("[exportar] familia", e instanceof Error ? e.message : e); }

  const zip = crearZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${carpeta}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
