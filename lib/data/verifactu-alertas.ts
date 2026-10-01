import { createSupabaseServer } from "@/lib/supabase/server";
import type { VfFuente } from "@/lib/alertas";

// VERI*FACTU para la campana (01/10/2026). Lectura BAJO SESIÓN (RLS del despacho). Lo que pide
// un gesto: rechazada, no registrada, duplicada o aceptada con errores, bloqueada por un dato
// del cliente, o con un error de envío que no se reintenta solo (Verifacti rechazó los datos).
// El alta de una factura ya anulada deja de importar; su anulación, no. Sin tabla → nada.
const PROBLEMAS = "estado.in.(INCORRECTO,ACEPTADO_CON_ERRORES,NO_REGISTRADO,DUPLICADO,BLOQUEADO),and(estado.eq.ERROR_ENVIO,proximoIntentoAt.is.null)";

export async function fetchVerifactuParaAlertas(): Promise<VfFuente[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("VerifactuRegistro").select("id, facturaId, tipo, estado").or(PROBLEMAS).order("updatedAt", { ascending: false }).limit(100);
    if (error || !data?.length) return [];
    const regs = data as { id: string; facturaId: string; tipo: string; estado: string }[];
    const { data: fs } = await supabase.from("Factura").select("id, numero, clienteNombre, estado").in("id", [...new Set(regs.map((r) => r.facturaId))]);
    const porId = new Map(((fs ?? []) as { id: string; numero: string; clienteNombre: string | null; estado: string }[]).map((f) => [f.id, f]));
    return regs.flatMap((r) => {
      const f = porId.get(r.facturaId);
      if (!f || /^EJEMPLO-/i.test(f.numero) || (r.tipo === "ALTA" && f.estado === "ANULADA")) return [];
      return [{ id: r.id, facturaId: r.facturaId, numero: f.numero, clienteNombre: f.clienteNombre ?? "", tipo: r.tipo, estado: r.estado }];
    });
  } catch { return []; }
}
