import "server-only";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerFacturaRecibida } from "@/lib/extraction-factura";
import { normalizarFacturaLeida, type FacturaLeida, type FacturaRecibida, type OrigenRecibida } from "@/lib/facturas-recibidas";
import type { AdjuntoBandeja } from "@/lib/email-entrante-procesar";
import { randomUUID as uuid } from "node:crypto";

// GUARDAR UNA FACTURA RECIBIDA: archivo al bucket privado + lectura IA + fila. Lo usan la
// subida manual (Facturas › Recibidas), la bandeja (botón «es una factura») y la recepción
// por email (adjuntos de un reenvío del gestor que la IA reconoce como facturas).

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type FacturaRecibidaResumen = { id: string; proveedorNombre: string; fecha: string; total: number | null; archivoNombre: string; revisar: boolean };

export const faltaMigracionRecibidas = (msg: string) => /FacturaRecibida|relation|schema cache|does not exist/i.test(msg);
export const ERROR_MIGRACION_RECIBIDAS = "Falta la migración: ejecuta supabase/facturas-recibidas.sql.";

export const nombreArchivoRecibida = (nombre: string, mime: string): string => {
  const base = (nombre || "factura").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "factura";
  if (/\.(pdf|jpe?g|png|webp)$/i.test(base)) return base;
  return `${base}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
};

export function mapFilaRecibida(r: Record<string, unknown>): FacturaRecibida {
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    id: String(r.id), proveedorNombre: String(r.proveedorNombre ?? ""), proveedorNif: String(r.proveedorNif ?? ""), numero: String(r.numero ?? ""),
    fecha: typeof r.fecha === "string" ? r.fecha.slice(0, 10) : "", baseImponible: n(r.baseImponible), tipoIva: n(r.tipoIva), cuotaIva: n(r.cuotaIva), total: n(r.total),
    concepto: String(r.concepto ?? ""), notas: String(r.notas ?? ""), expedienteId: (r.expedienteId as string | null) ?? null, oficinaId: (r.oficinaId as string | null) ?? null,
    archivoNombre: String(r.archivoNombre ?? ""), archivoMime: String(r.archivoMime ?? ""), archivoSize: n(r.archivoSize), origen: r.origen === "EMAIL" ? "EMAIL" : "MANUAL",
    revisar: Boolean(r.revisar), confianza: n(r.confianza), createdAt: String(r.createdAt ?? ""),
  };
}

export const COLS_RECIBIDA = "id, proveedorNombre, proveedorNif, numero, fecha, baseImponible, tipoIva, cuotaIva, total, concepto, notas, expedienteId, oficinaId, archivoNombre, archivoMime, archivoSize, origen, revisar, confianza, createdAt";

// `forzar`: el gestor ha dicho que ES una factura (subida manual / botón de la bandeja) →
// se archiva aunque la IA no la reconozca, marcada «revisar». Sin forzar (email), lo que
// no parece factura se devuelve sin guardar para que siga su circuito de documentos.
export async function guardarFacturaRecibida(admin: Admin, o: {
  workspaceId: string; oficinaId?: string | null; buffer: Buffer; mime: string; nombre: string; origen: OrigenRecibida;
  bandejaId?: string | null; creadoPorId?: string | null; forzar?: boolean;
}): Promise<{ fila: FacturaRecibida | null; leida: FacturaLeida; motivo?: string }> {
  let leida: FacturaLeida;
  try { leida = await extraerFacturaRecibida(o.buffer, o.mime); }
  catch (err) {
    console.error("[facturas recibidas] lectura:", err instanceof Error ? err.message : err);
    leida = normalizarFacturaLeida({ es_factura: false, confianza: 0 });
    leida.avisos = ["No se pudo leer el archivo"]; leida.revisar = true;
  }
  if (!leida.esFactura && !o.forzar) return { fila: null, leida, motivo: "no parece una factura" };

  const id = uuid();
  const archivoNombre = nombreArchivoRecibida(o.nombre, o.mime);
  const archivoPath = `recibidas/${o.workspaceId}/${id}/${archivoNombre}`;
  const up = await admin.storage.from("documentos").upload(archivoPath, o.buffer, { contentType: o.mime, upsert: true });
  if (up.error) throw new Error(`No se pudo guardar el archivo: ${up.error.message}`);

  const fila: Record<string, unknown> = {
    id, workspaceId: o.workspaceId, oficinaId: o.oficinaId ?? null,
    ...leida.campos, notas: leida.avisos.length && !leida.esFactura ? leida.avisos.join(" · ") : "",
    archivoPath, archivoNombre, archivoMime: o.mime, archivoSize: o.buffer.length,
    origen: o.origen, bandejaId: o.bandejaId ?? null, confianza: leida.confianza, revisar: leida.revisar, creadoPorId: o.creadoPorId ?? null,
    updatedAt: new Date().toISOString(),
  };
  const ins = await admin.from("FacturaRecibida").insert(fila).select(COLS_RECIBIDA).single();
  if (ins.error) {
    await admin.storage.from("documentos").remove([archivoPath]).catch(() => {});
    throw new Error(faltaMigracionRecibidas(ins.error.message) ? ERROR_MIGRACION_RECIBIDAS : ins.error.message);
  }
  return { fila: mapFilaRecibida(ins.data as Record<string, unknown>), leida };
}

// Adjuntos de la bandeja → facturas recibidas. Devuelve las archivadas, los adjuntos que
// NO eran facturas (siguen el circuito de documentos de cliente) y la lista de adjuntos
// actualizada (destino «factura») para guardarla en la fila de la bandeja.
export async function archivarFacturasDesdeAdjuntos(admin: Admin, o: { workspaceId: string; adjuntos: AdjuntoBandeja[]; bandejaId: string; creadoPorId?: string | null; forzar?: boolean }):
  Promise<{ archivadas: FacturaRecibidaResumen[]; restantes: AdjuntoBandeja[]; adjuntos: AdjuntoBandeja[] }> {
  const archivadas: FacturaRecibidaResumen[] = [];
  const restantes: AdjuntoBandeja[] = [];
  const adjuntos: AdjuntoBandeja[] = [];
  let leidos = 0;
  for (const a of o.adjuntos) {
    if (a.docId || !/^(image\/|application\/pdf)/.test(a.mime) || leidos >= 8) { adjuntos.push(a); if (!a.docId) restantes.push(a); continue; }
    leidos++;
    try {
      const dl = await admin.storage.from("documentos").download(a.storagePath);
      if (dl.error || !dl.data) { adjuntos.push(a); restantes.push(a); continue; }
      const r = await guardarFacturaRecibida(admin, { workspaceId: o.workspaceId, buffer: Buffer.from(await dl.data.arrayBuffer()), mime: a.mime, nombre: a.nombre, origen: "EMAIL", bandejaId: o.bandejaId, creadoPorId: o.creadoPorId, forzar: o.forzar });
      if (r.fila) {
        archivadas.push({ id: r.fila.id, proveedorNombre: r.fila.proveedorNombre, fecha: r.fila.fecha, total: r.fila.total, archivoNombre: r.fila.archivoNombre, revisar: r.fila.revisar });
        adjuntos.push({ ...a, destino: "factura", docId: r.fila.id, etiqueta: r.fila.proveedorNombre ? `Factura · ${r.fila.proveedorNombre}` : "Factura recibida" });
      } else { adjuntos.push(a); restantes.push(a); }
    } catch (err) {
      // Sin migración o sin IA: el adjunto sigue su camino normal, nada se pierde.
      console.error("[facturas recibidas] adjunto:", err instanceof Error ? err.message : err);
      adjuntos.push(a); restantes.push(a);
      if (err instanceof Error && err.message === ERROR_MIGRACION_RECIBIDAS) break;
    }
  }
  return { archivadas, restantes, adjuntos };
}
