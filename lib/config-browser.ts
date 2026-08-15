import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { Pack, Servicio } from "@/lib/servicios";
import type { Aviso } from "@/lib/avisos";

// Persistance de la config (Ajustes) dans Supabase, côté navigateur, sous RLS.
// Upsert par (workspaceId, clave) avec id déterministe → idempotent.

async function workspaceId(): Promise<string> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.from("Membership").select("workspaceId").limit(1).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "No se encontró tu despacho.");
  return data.workspaceId;
}

// `oficinaId` (multi-oficina) : null = catálogo de la gestoría (filas históricas,
// ids `svc_<ws>_<clave>` intactos) ; con id = catálogo PROPIO de esa sede (ids
// `svc_<ws>_<oficina>_<clave>`). El upsert va por PK: la unicidad por ámbito vive
// en índices parciales que ON CONFLICT compuesto no puede inferir.
export async function guardarServicios(servicios: Servicio[], removedClaves: string[], oficinaId: string | null = null): Promise<void> {
  const supabase = createSupabaseBrowser();
  const ws = await workspaceId();

  if (removedClaves.length) {
    let del = supabase.from("ServicioConfig").delete().eq("workspaceId", ws).in("clave", removedClaves);
    del = oficinaId ? del.eq("oficinaId", oficinaId) : del.is("oficinaId", null);
    let { error } = await del;
    if (error && /oficinaId/i.test(error.message)) {
      ({ error } = await supabase.from("ServicioConfig").delete().eq("workspaceId", ws).in("clave", removedClaves)); // sin migrar
    }
    if (error) throw new Error(error.message);
  }

  const rows: Record<string, unknown>[] = servicios.map((s, i) => ({
    id: oficinaId ? `svc_${ws}_${oficinaId}_${s.id}` : `svc_${ws}_${s.id}`, // déterministe par ámbito
    ...(oficinaId ? { oficinaId } : {}),
    workspaceId: ws,
    clave: s.id,
    label: s.label,
    descripcion: s.desc || null,
    docs: s.docs,
    active: s.active,
    anticipo: s.anticipo,
    resto: s.resto,
    citaPresencial: s.citaPresencial ?? false,
    citaQuien: s.citaPresencial ? (s.citaQuien ?? "cliente") : null,
    noIncluye: s.noIncluye?.trim() || null,
    suplidos: (s.suplidos ?? []).filter((x) => x.concepto.trim() && Number(x.importe) > 0)
      .map((x) => ({ concepto: x.concepto.trim(), importe: Number(x.importe) })),
    porcentaje: s.porcentaje && s.porcentaje > 0 ? s.porcentaje : null,
    porcentajeSobre: s.porcentaje && s.porcentaje > 0 ? (s.porcentajeSobre?.trim() || null) : null,
    precioOculto: Boolean(s.precioOculto),
    categoria: s.categoria?.trim() || null,
    orden: i,
    updatedAt: new Date().toISOString(),
  }));
  let { error } = await supabase.from("ServicioConfig").upsert(rows, { onConflict: "id" });
  if (error && oficinaId && /oficinaId/i.test(error.message)) {
    throw new Error("Falta la migración: ejecuta supabase/config-por-oficina.sql en Supabase.");
  }
  // Replis pre-migración: quitar SOLO el tramo más reciente cada vez, para que el resto
  // de la config del servicio nunca se pierda por una columna nueva.
  // Repli categoría (migración más reciente) ANTES del repli pro: cada tramo cae solo.
  if (error && /categoria|schema cache|column/i.test(error.message)) {
    const sinCat = rows.map(({ categoria: _c, ...r }) => r);
    ({ error } = await supabase.from("ServicioConfig").upsert(sinCat, { onConflict: "id" }));
  }
  if (error && /porcentaje|precioOculto|schema cache|column/i.test(error.message)) {
    const sinPro = rows.map(({ porcentaje: _p, porcentajeSobre: _ps, precioOculto: _po, categoria: _c, ...r }) => r);
    ({ error } = await supabase.from("ServicioConfig").upsert(sinPro, { onConflict: "id" }));
    if (error && /suplidos|schema cache|column/i.test(error.message)) {
      const sinSuplidos = sinPro.map(({ suplidos: _s, ...r }) => r);
      ({ error } = await supabase.from("ServicioConfig").upsert(sinSuplidos, { onConflict: "id" }));
      if (error && /noIncluye|schema cache|column/i.test(error.message)) {
        const sinNoIncluye = sinSuplidos.map(({ noIncluye: _ni, ...r }) => r);
        ({ error } = await supabase.from("ServicioConfig").upsert(sinNoIncluye, { onConflict: "id" }));
      }
    }
  }
  if (error) throw new Error(error.message);
}

// Packs → Workspace.packs (JSONB) vía la ruta de despacho (las escrituras de
// Workspace pasan por el servidor: RLS no da UPDATE directo al navegador).
export async function guardarPacks(packs: Pack[]): Promise<void> {
  const limpio = packs
    .map((p) => ({
      id: p.id,
      nombre: p.nombre.trim(),
      desc: p.desc.trim(),
      servicioIds: p.servicioIds.filter(Boolean),
      precioDesde: Math.max(0, Number(p.precioDesde) || 0), // legado, ya no se edita
      descuentoPct: Math.max(0, Math.min(100, Number(p.descuentoPct) || 0)),
      porcentaje: Math.max(0, Math.min(100, Number(p.porcentaje) || 0)),
      porcentajeSobre: (p.porcentajeSobre ?? "").trim(),
      precioOculto: Boolean(p.precioOculto),
      categoria: p.categoria?.trim() || "",
    }))
    .filter((p) => p.nombre);
  const fd = new FormData();
  fd.set("soloPacks", "1");
  fd.set("packs", JSON.stringify(limpio));
  const res = await fetch("/api/ajustes/despacho", { method: "POST", body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || "No se pudieron guardar los packs.");
}

// `oficinaId` : null = avisos de la gestoría ; con id = los PROPIOS de esa sede.
export async function guardarAvisos(avisos: Aviso[], oficinaId: string | null = null): Promise<void> {
  const supabase = createSupabaseBrowser();
  const ws = await workspaceId();
  const rows: Record<string, unknown>[] = avisos.map((a, i) => ({
    id: oficinaId ? `avi_${ws}_${oficinaId}_${a.id}` : `avi_${ws}_${a.id}`,
    ...(oficinaId ? { oficinaId } : {}),
    workspaceId: ws,
    clave: a.id,
    evento: a.evento,
    template: a.template,
    canal: a.canal,
    activo: a.activo,
    orden: i,
    updatedAt: new Date().toISOString(),
  }));
  const { error } = await supabase.from("AvisoConfig").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(oficinaId && /oficinaId/i.test(error.message)
    ? "Falta la migración: ejecuta supabase/config-por-oficina.sql en Supabase." : error.message);
}

// Quita el catálogo/avisos PROPIOS de una sede → vuelve a heredar de la gestoría.
export async function borrarScope(tabla: "ServicioConfig" | "AvisoConfig", oficinaId: string): Promise<void> {
  const supabase = createSupabaseBrowser();
  const ws = await workspaceId();
  const { error } = await supabase.from(tabla).delete().eq("workspaceId", ws).eq("oficinaId", oficinaId);
  if (error) throw new Error(error.message);
}
