import { createSupabaseServer } from "@/lib/supabase/server";
import { DOC_LABEL } from "@/lib/tramites";
import { grupoDe, type DocEmpresaItem } from "@/lib/documentos-empresa";
import type { EmpresaDetalle } from "@/lib/data/empresas";

// Todos los documentos de una EMPRESA y de sus trabajadores, bajo RLS (25/09/2026, Luis):
//  1. los de sus expedientes — los propios y los de sus trabajadores, también los que paga
//     con un titular que ya no es trabajador suyo —, con archivo subido: pasaportes,
//     contratos, hojas de encargo y mandatos firmados…;
//  2. los sueltos de la ficha de cada trabajador;
//  3. los de la propia empresa (supabase/documento-empresa.sql): CIF, escrituras, poderes,
//     y lo que se presentó antes de Aproba.
// `storagePath` solo lo usan el servidor (ZIP): la página lo quita antes de pintar.

export type DocEmpresaInterno = DocEmpresaItem & { storagePath: string };
const FALTA_TABLA = /DocumentoEmpresa|relation|schema cache|does not exist/i;

export async function recogerDocumentosEmpresa(detalle: EmpresaDetalle): Promise<{ docs: DocEmpresaInterno[]; subidaDisponible: boolean }> {
  const supabase = await createSupabaseServer();
  const nombres = new Map(detalle.trabajadores.map((t) => [t.id, t.nombre]));
  const exp = new Map<string, { ref: string; titular: string | null }>();
  for (const t of detalle.trabajadores) for (const e of t.expedientes) exp.set(e.id, { ref: e.referencia, titular: t.id });
  for (const e of detalle.expedientesPropios) exp.set(e.id, { ref: e.referencia, titular: null });
  try {
    const { data } = await supabase.from("Expediente").select("id, referencia, clienteId").eq("empresaId", detalle.id);
    for (const e of (data ?? []) as { id: string; referencia: string; clienteId: string | null }[]) {
      if (!exp.has(e.id)) exp.set(e.id, { ref: e.referencia, titular: e.clienteId });
    }
  } catch { /* sin columna empresaId: los de los trabajadores bastan */ }

  const docs: DocEmpresaInterno[] = [];

  // 1. Documentos de los expedientes (solo los que tienen archivo).
  const ids = [...exp.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("Documento")
      .select("id, expedienteId, clienteId, tipo, estado, nombreArchivo, storagePath, mimeType, uploadedAt, createdAt")
      .in("expedienteId", ids.slice(i, i + 150)).not("storagePath", "is", null);
    if (error) break;
    for (const d of (data ?? []) as { id: string; expedienteId: string; clienteId: string | null; tipo: string; estado: string | null; nombreArchivo: string | null; storagePath: string; mimeType: string | null; uploadedAt: string | null; createdAt: string }[]) {
      const e = exp.get(d.expedienteId);
      const titular = d.clienteId ?? e?.titular ?? null;
      const label = DOC_LABEL[d.tipo] ?? d.tipo;
      docs.push({
        id: d.id, origen: "EXPEDIENTE", grupo: grupoDe(d.tipo, label, titular), tipo: d.tipo, label,
        nombreArchivo: d.nombreArchivo, mimeType: d.mimeType, fecha: d.uploadedAt ?? d.createdAt, estado: d.estado,
        trabajadorId: titular, trabajador: titular ? nombres.get(titular) ?? null : null,
        expedienteId: d.expedienteId, expedienteRef: e?.ref ?? null,
        href: `/api/expedientes/${d.expedienteId}/documentos/${d.id}`, borrable: false, storagePath: d.storagePath,
      });
    }
  }
  // Titulares que ya no son trabajadores de la empresa: su nombre, en una sola consulta.
  const sinNombre = [...new Set(docs.filter((d) => d.trabajadorId && !d.trabajador).map((d) => d.trabajadorId as string))];
  if (sinNombre.length) {
    const { data } = await supabase.from("Cliente").select("id, nombre, apellidos").in("id", sinNombre);
    const n = new Map(((data ?? []) as { id: string; nombre: string | null; apellidos: string | null }[]).map((c) => [c.id, `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim()]));
    for (const d of docs) if (d.trabajadorId && !d.trabajador) d.trabajador = n.get(d.trabajadorId) || "—";
  }

  // 2. Documentos sueltos de la ficha de cada trabajador.
  const trabIds = detalle.trabajadores.map((t) => t.id);
  for (let i = 0; i < trabIds.length; i += 150) {
    const { data, error } = await supabase.from("DocumentoCliente")
      .select("id, clienteId, tipo, nombreArchivo, storagePath, mimeType, createdAt").in("clienteId", trabIds.slice(i, i + 150));
    if (error) break;
    for (const d of (data ?? []) as { id: string; clienteId: string; tipo: string; nombreArchivo: string | null; storagePath: string; mimeType: string | null; createdAt: string }[]) {
      docs.push({
        id: d.id, origen: "CLIENTE", grupo: grupoDe(d.tipo, d.tipo, d.clienteId), tipo: d.tipo, label: d.tipo,
        nombreArchivo: d.nombreArchivo, mimeType: d.mimeType, fecha: d.createdAt, estado: null,
        trabajadorId: d.clienteId, trabajador: nombres.get(d.clienteId) ?? "—", expedienteId: null, expedienteRef: null,
        href: `/api/clientes/${d.clienteId}/documentos/${d.id}`, borrable: false, storagePath: d.storagePath,
      });
    }
  }

  // 3. Documentos de la propia empresa.
  let subidaDisponible = true;
  const { data: de, error: eDe } = await supabase.from("DocumentoEmpresa")
    .select("id, tipo, nombreArchivo, storagePath, mimeType, createdAt").eq("empresaId", detalle.id);
  if (eDe) subidaDisponible = !FALTA_TABLA.test(eDe.message);
  for (const d of (de ?? []) as { id: string; tipo: string; nombreArchivo: string | null; storagePath: string; mimeType: string | null; createdAt: string }[]) {
    docs.push({
      id: d.id, origen: "EMPRESA", grupo: grupoDe(d.tipo, d.tipo, null), tipo: d.tipo, label: d.tipo,
      nombreArchivo: d.nombreArchivo, mimeType: d.mimeType, fecha: d.createdAt, estado: null,
      trabajadorId: null, trabajador: null, expedienteId: null, expedienteRef: null,
      href: `/api/empresas/${detalle.id}/documentos/${d.id}`, borrable: true, storagePath: d.storagePath,
    });
  }

  return { docs, subidaDisponible };
}

// Lo que viaja al navegador: sin la ruta interna del archivo.
export const sinRuta = (docs: DocEmpresaInterno[]): DocEmpresaItem[] => docs.map(({ storagePath: _p, ...d }) => d);
