import "server-only";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import { extraerDocumento } from "@/lib/extraction";
import { esDocumentoDeIdentidad, fichaDesdeCampos, type FichaNueva } from "@/lib/ficha-extraccion";
import type { AdjuntoBandeja } from "@/lib/email-entrante-procesar";
import { randomUUID as uuid } from "node:crypto";

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type ClienteCreado = { clienteId: string; nombre: string; apellidos: string; creado: boolean; campos: string[] };

// Cliente nuevo desde un email reenviado (06/09/2026): solo cuando lo pide un MIEMBRO del
// despacho (reenvío deliberado o «es nuevo» en su respuesta), ningún cliente coincide, y
// un documento de identidad legible da al menos nombre y apellidos — o el gestor los
// escribió. Antes de crear, se vuelve a buscar por número de documento/pasaporte: si ya
// existe con otro nombre, se usa ese (nada de duplicados).
export async function crearClienteDesdeAdjuntos(admin: Admin, o: { workspaceId: string; adjuntos: AdjuntoBandeja[]; nombreEscrito?: { nombre: string; apellidos: string } | null }): Promise<ClienteCreado | null> {
  let ficha: FichaNueva = {};
  for (const a of o.adjuntos.slice(0, 4)) {
    if (!/^(image\/|application\/pdf)/.test(a.mime)) continue;
    try {
      const dl = await admin.storage.from("documentos").download(a.storagePath);
      if (dl.error || !dl.data) continue;
      const r = await extraerDocumento(Buffer.from(await dl.data.arrayBuffer()), a.mime);
      if (r.estado !== "VALIDADO" || !esDocumentoDeIdentidad(r.tipoDetectado)) continue;
      ficha = fichaDesdeCampos(r.campos);
      if (ficha.nombre && ficha.apellidos) break;
    } catch (err) { console.error("[cliente nuevo] extracción:", err instanceof Error ? err.message : err); }
  }
  if (!(ficha.nombre && ficha.apellidos) && o.nombreEscrito) { ficha.nombre = o.nombreEscrito.nombre; ficha.apellidos = o.nombreEscrito.apellidos; }
  if (!(ficha.nombre && ficha.apellidos)) return null;

  // ¿Ya existe con ese documento? (el nombre pudo no coincidir por acentos o por orden)
  for (const [col, val] of [["numeroDocumento", ficha.numeroDocumento], ["pasaporte", ficha.pasaporte]] as const) {
    if (!val) continue;
    const { data } = await admin.from("Cliente").select("id, nombre, apellidos").eq("workspaceId", o.workspaceId).ilike(col, val).limit(1).maybeSingle();
    if (data) return { clienteId: data.id as string, nombre: data.nombre as string, apellidos: (data.apellidos as string) ?? "", creado: false, campos: [] };
  }

  const id = uuid();
  const fila: Record<string, unknown> = { id, workspaceId: o.workspaceId, ...ficha, updatedAt: new Date().toISOString() };
  let ins = await admin.from("Cliente").insert(fila);
  // Columnas que no existan en este proyecto: se quitan y se reintenta (mismo repli que el ejemplo).
  for (let i = 0; i < 6 && ins.error && /column|schema cache/i.test(ins.error.message); i++) {
    const m = /column "?([A-Za-z_]+)"?/i.exec(ins.error.message); const col = m?.[1];
    if (!col || !(col in fila) || ["id", "workspaceId", "nombre"].includes(col)) break;
    delete fila[col]; ins = await admin.from("Cliente").insert(fila);
  }
  if (ins.error) { console.error("[cliente nuevo] insert:", ins.error.message); return null; }
  const campos = Object.entries(ficha).filter(([k, v]) => v && !["nombre", "apellidos"].includes(k)).map(([k]) => ETIQUETA[k] ?? k);
  return { clienteId: id, nombre: ficha.nombre, apellidos: ficha.apellidos, creado: true, campos };
}

const ETIQUETA: Record<string, string> = { sexo: "sexo", nacionalidad: "nacionalidad", fechaNacimiento: "fecha de nacimiento", lugarNacimiento: "lugar de nacimiento", paisNacimiento: "país de nacimiento", numeroDocumento: "NIE", pasaporte: "pasaporte", via: "dirección", municipio: "municipio", provincia: "provincia", codigoPostal: "código postal" };
