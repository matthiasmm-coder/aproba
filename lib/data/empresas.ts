import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL } from "@/lib/tramites";
import type { EmpresaFiscal } from "@/lib/empresa";

// Capa de acceso a las EMPRESAS (Supabase + RLS). Repli propio: si la migración
// supabase/empresa.sql no está aplicada, se devuelve vacío/null sin romper nada —
// mismo contrato que lib/data/familias.ts.

export type EmpresaResumen = { id: string; razonSocial: string; nif: string | null; trabajadores: number };
export type TrabajadorEmpresa = { id: string; nombre: string; telefono: string | null; expedientes: { id: string; referencia: string; tipoLabel: string; estado: string }[] };
export type EmpresaDetalle = EmpresaFiscal & { id: string; razonSocial: string; trabajadores: TrabajadorEmpresa[] };

const COLS = "id, razonSocial, nif, domicilio, codigoPostal, municipio, provincia, contactoNombre, contactoEmail, contactoTelefono, oficinaId";

export async function fetchEmpresas(): Promise<EmpresaResumen[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Empresa").select("id, razonSocial, nif, clientes:Cliente(id)").order("razonSocial");
    if (error) return [];
    return ((data ?? []) as unknown as { id: string; razonSocial: string; nif: string | null; clientes: { id: string }[] | null }[])
      .map((e) => ({ id: e.id, razonSocial: e.razonSocial, nif: e.nif ?? null, trabajadores: (e.clientes ?? []).length }));
  } catch { return []; }
}

export async function fetchEmpresaDetalle(empresaId: string): Promise<EmpresaDetalle | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Empresa")
      .select(`${COLS}, clientes:Cliente(id, nombre, apellidos, telefono, expedientes:Expediente(id, referencia, tipo, estado))`)
      .eq("id", empresaId).maybeSingle();
    if (error || !data) return null;
    type Row = EmpresaFiscal & { id: string; razonSocial: string; clientes: { id: string; nombre: string; apellidos: string | null; telefono: string | null; expedientes: { id: string; referencia: string; tipo: string; estado: string }[] | null }[] | null };
    const e = data as unknown as Row;
    return {
      ...e,
      trabajadores: (e.clientes ?? []).map((c) => ({
        id: c.id, nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(), telefono: c.telefono ?? null,
        expedientes: (c.expedientes ?? []).map((x) => ({ id: x.id, referencia: x.referencia, tipoLabel: TIPO_LABEL[x.tipo] ?? x.tipo, estado: x.estado })),
      })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  } catch { return null; }
}

// ── FICHA DE EMPRESA (18/09/2026, petición de Luis y Marta) ──────────────────
// La empresa que contrata tiene su propia ficha, distinta de la del trabajador: sus datos,
// los servicios que ha contratado, sus facturas y sus trabajadores. Todo bajo RLS.

export type FacturaEmpresa = {
  id: string; numero: string; concepto: string; total: number; estado: string;
  fechaEmision: string | null; clienteNombre: string; expedienteId: string | null;
};
export type ServicioContratado = { clave: string; label: string; expedientes: number };
export type EmpresaFicha = EmpresaDetalle & {
  facturas: FacturaEmpresa[];
  servicios: ServicioContratado[];
  totales: { facturado: number; cobrado: number; pendiente: number };
};

export async function fetchEmpresaFicha(empresaId: string): Promise<EmpresaFicha | null> {
  const detalle = await fetchEmpresaDetalle(empresaId);
  if (!detalle) return null;
  const supabase = await createSupabaseServer();

  // Servicios contratados = los de los expedientes de sus trabajadores (principal + extra).
  // El label sale del catálogo del despacho (servicios propios incluidos), con repli al
  // catálogo de trámites y, en último caso, a la propia clave.
  const expIds = detalle.trabajadores.flatMap((t) => t.expedientes.map((e) => e.id));
  const servicios: ServicioContratado[] = [];
  const facturas: FacturaEmpresa[] = [];
  try {
    const cuenta = new Map<string, number>();
    if (expIds.length) {
      let res = await supabase.from("Expediente").select("id, tipo, serviciosExtra").in("id", expIds);
      if (res.error) res = await supabase.from("Expediente").select("id, tipo").in("id", expIds) as typeof res;
      for (const e of ((res.data ?? []) as unknown as { tipo: string; serviciosExtra?: string[] | null }[])) {
        for (const c of [e.tipo, ...(Array.isArray(e.serviciosExtra) ? e.serviciosExtra : [])].filter(Boolean)) {
          cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
        }
      }
    }
    if (cuenta.size) {
      const labels = new Map<string, string>();
      try {
        const { data } = await supabase.from("ServicioConfig").select("clave, label").in("clave", [...cuenta.keys()]);
        for (const r of (data ?? []) as { clave: string; label: string }[]) if (r.label) labels.set(r.clave, r.label);
      } catch { /* catálogo por defecto */ }
      for (const [clave, n] of [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
        servicios.push({ clave, label: labels.get(clave) ?? TIPO_LABEL[clave] ?? clave, expedientes: n });
      }
    }

    // Facturas: las estampilladas con empresaId (desde el 08/09) y, para las anteriores,
    // las de los expedientes de sus trabajadores. Se deduplican por id.
    const vistas = new Map<string, FacturaEmpresa>();
    const COLS = "id, numero, concepto, total, estado, fechaEmision, clienteNombre, expedienteId";
    const añade = (filas: unknown[]) => {
      for (const f of (filas ?? []) as FacturaEmpresa[]) if (f?.id && !vistas.has(f.id)) vistas.set(f.id, { ...f, total: Number(f.total) });
    };
    try {
      const { data, error } = await supabase.from("Factura").select(COLS).eq("empresaId", empresaId);
      if (!error) añade(data ?? []);
    } catch { /* columna sin migrar */ }
    if (expIds.length) {
      const { data } = await supabase.from("Factura").select(COLS).in("expedienteId", expIds);
      añade(data ?? []);
    }
    facturas.push(...[...vistas.values()].sort((a, b) => String(b.fechaEmision ?? "").localeCompare(String(a.fechaEmision ?? "")) || b.numero.localeCompare(a.numero)));
  } catch { /* la ficha se enseña igual, sin estos bloques */ }

  // «Anulada» no cuenta como facturado; «pendiente» es lo emitido y aún no cobrado.
  const vivas = facturas.filter((f) => f.estado !== "ANULADA" && f.estado !== "BORRADOR");
  const facturado = vivas.reduce((a, f) => a + f.total, 0);
  const cobrado = vivas.filter((f) => f.estado === "PAGADA").reduce((a, f) => a + f.total, 0);
  return {
    ...detalle, facturas, servicios,
    totales: { facturado: Math.round(facturado * 100) / 100, cobrado: Math.round(cobrado * 100) / 100, pendiente: Math.round((facturado - cobrado) * 100) / 100 },
  };
}
