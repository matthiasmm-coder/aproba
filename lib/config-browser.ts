import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { Servicio } from "@/lib/servicios";
import type { Aviso } from "@/lib/avisos";

// Persistance de la config (Ajustes) dans Supabase, côté navigateur, sous RLS.
// Upsert par (workspaceId, clave) avec id déterministe → idempotent.

async function workspaceId(): Promise<string> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "No se encontró tu despacho.");
  return data.workspaceId;
}

export async function guardarServicios(servicios: Servicio[], removedClaves: string[]): Promise<void> {
  const supabase = createSupabaseBrowser();
  const ws = await workspaceId();

  if (removedClaves.length) {
    const { error } = await supabase.from("ServicioConfig").delete().eq("workspaceId", ws).in("clave", removedClaves);
    if (error) throw new Error(error.message);
  }

  const rows = servicios.map((s, i) => ({
    id: `svc_${ws}_${s.id}`, // déterministe : l'upsert ne réécrit pas la PK
    workspaceId: ws,
    clave: s.id,
    label: s.label,
    descripcion: s.desc || null,
    docs: s.docs,
    active: s.active,
    anticipo: s.anticipo,
    resto: s.resto,
    orden: i,
    updatedAt: new Date().toISOString(),
  }));
  const { error } = await supabase.from("ServicioConfig").upsert(rows, { onConflict: "workspaceId,clave" });
  if (error) throw new Error(error.message);
}

export async function guardarAvisos(avisos: Aviso[]): Promise<void> {
  const supabase = createSupabaseBrowser();
  const ws = await workspaceId();
  const rows = avisos.map((a, i) => ({
    id: `avi_${ws}_${a.id}`,
    workspaceId: ws,
    clave: a.id,
    evento: a.evento,
    template: a.template,
    canal: a.canal,
    activo: a.activo,
    orden: i,
    updatedAt: new Date().toISOString(),
  }));
  const { error } = await supabase.from("AvisoConfig").upsert(rows, { onConflict: "workspaceId,clave" });
  if (error) throw new Error(error.message);
}
