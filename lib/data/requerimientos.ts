import { createSupabaseServer } from "@/lib/supabase/server";
import { ordenarPorUrgencia, type EstadoRequerimiento } from "@/lib/requerimientos";

// REQUERIMIENTOS — data layer. Lectura BAJO SESIÓN (RLS): el tenant lo filtra la policy
// requerimiento_tenant, no el código. Repli limpio: sin la migración, devuelve [] y la
// pantalla sigue funcionando (el bloque de la ficha no aparece y la pestaña queda a 0).

export type RequerimientoRow = {
  id: string;
  expedienteId: string;
  asunto: string;
  docs: string[];
  recibidoEl: string | null;
  fechaLimite: string;
  avisarDias: number;
  ultimoAviso: number | null;
  estado: EstadoRequerimiento;
  aportadoEl: string | null;
  notas: string | null;
};

export type RequerimientoConExpediente = RequerimientoRow & {
  referencia: string;
  clienteNombre: string;
};

const COLS = "id, expedienteId, asunto, docs, recibidoEl, fechaLimite, avisarDias, ultimoAviso, estado, aportadoEl, notas";
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const fila = (r: Record<string, unknown>): RequerimientoRow => ({
  id: String(r.id), expedienteId: String(r.expedienteId), asunto: String(r.asunto ?? ""),
  docs: Array.isArray(r.docs) ? (r.docs as string[]) : [],
  recibidoEl: (r.recibidoEl as string | null) ?? null,
  fechaLimite: String(r.fechaLimite),
  avisarDias: Number(r.avisarDias ?? 3),
  ultimoAviso: r.ultimoAviso === null || r.ultimoAviso === undefined ? null : Number(r.ultimoAviso),
  estado: (r.estado === "APORTADO" ? "APORTADO" : "PENDIENTE"),
  aportadoEl: (r.aportadoEl as string | null) ?? null,
  notas: (r.notas as string | null) ?? null,
});

// Los de UN expediente (bloque de la ficha).
export async function fetchRequerimientosDeExpediente(expedienteId: string): Promise<RequerimientoRow[]> {
  const supabase = await createSupabaseServer();
  try {
    const { data, error } = await supabase.from("Requerimiento").select(COLS).eq("expedienteId", expedienteId).limit(100);
    if (error) throw error;
    return ordenarPorUrgencia((data ?? []).map((r) => fila(r as Record<string, unknown>)));
  } catch {
    return []; // tabla sin migrar → la ficha no enseña el bloque
  }
}

// Los PENDIENTES del despacho (pestaña «Requerimientos»), con su expediente y su cliente.
// `sedes` = multi-oficina: el requerimiento sigue la sede de SU expediente.
export async function fetchRequerimientosPendientes(sedes?: string[] | null, incluirSinSede = false): Promise<RequerimientoConExpediente[]> {
  const supabase = await createSupabaseServer();
  try {
    const sel = `${COLS}, expediente:Expediente!inner(referencia, oficinaId, cliente:Cliente(nombre, apellidos), empresa:Empresa(razonSocial))`;
    let q = supabase.from("Requerimiento").select(sel).eq("estado", "PENDIENTE");
    if (sedes?.length) {
      const dentro = `oficinaId.in.(${sedes.join(",")})`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).or(incluirSinSede ? `${dentro},oficinaId.is.null` : dentro, { referencedTable: "expediente" });
    }
    const { data, error } = await q.order("fechaLimite", { ascending: true }).limit(300);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      type Exp = { referencia?: string; cliente?: { nombre?: string | null; apellidos?: string | null } | null; empresa?: { razonSocial?: string | null } | null };
      const exp = (uno(row.expediente as Exp | Exp[] | null) ?? {}) as Exp;
      const c = uno(exp.cliente ?? null);
      const em = uno(exp.empresa ?? null);
      // Expediente de empresa: el titular es la empresa (no hay persona en «cliente»).
      const nombre = c ? `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim() : String(em?.razonSocial ?? "");
      return { ...fila(row), referencia: String(exp.referencia ?? ""), clienteNombre: nombre || "—" };
    });
  } catch {
    return [];
  }
}

// Recuento para la pestaña (sin traerse las filas).
export async function contarRequerimientosPendientes(sedes?: string[] | null, incluirSinSede = false): Promise<number> {
  return (await fetchRequerimientosPendientes(sedes, incluirSinSede)).length;
}
