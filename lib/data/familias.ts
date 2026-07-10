import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";
import { ESTADO_META } from "@/lib/types";
import { ordenParentesco } from "@/lib/familia";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";

// Couche d'accès aux familles (Supabase + RLS). Repli propre: si la table Familia n'existe
// pas encore (migration supabase/familia.sql non appliquée), on renvoie vide sans casser.

export type DocFamilia = { id: string; tipo: string; nombreArchivo: string | null; createdAt: string };
export type FamiliaResumen = { id: string; nombre: string; miembros: number };
export type MiembroExpediente = { id: string; referencia: string; tipoLabel: string; estado: string; estadoLabel: string; portalToken: string | null };
export type FamiliaMiembro = { id: string; nombre: string; parentesco: string | null; telefono: string | null; expedientes: MiembroExpediente[] };
export type FamiliaDetalle = { id: string; nombre: string; miembros: FamiliaMiembro[] };

type ExpRow = { id: string; referencia: string; tipo: string; estado: string; portalToken: string | null };
type CliRow = { id: string; nombre: string; apellidos: string | null; parentesco: string | null; telefono: string | null; expedientes: ExpRow[] | null };
type FamRow = { id: string; nombre: string; clientes: CliRow[] | null };

export async function fetchFamilias(): Promise<FamiliaResumen[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Familia").select("id, nombre, clientes:Cliente(id)").order("nombre");
    if (error) return [];
    return ((data ?? []) as unknown as { id: string; nombre: string; clientes: { id: string }[] | null }[])
      .map((f) => ({ id: f.id, nombre: f.nombre, miembros: (f.clientes ?? []).length }));
  } catch { return []; }
}

// Documentos compartidos de una familia. Defensivo: [] si la tabla no existe aún.
export async function fetchDocumentosFamilia(familiaId: string): Promise<DocFamilia[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("DocumentoFamilia").select("id, tipo, nombreArchivo, createdAt").eq("familiaId", familiaId).order("createdAt", { ascending: false });
    if (error) return [];
    return (data ?? []) as unknown as DocFamilia[];
  } catch { return []; }
}

// Familia del cliente de un expediente (para el badge en la ficha). Defensivo: si la
// migración de familias no está aplicada, devuelve null sin romper la ficha del expediente.
export async function fetchFamiliaDeExpediente(expedienteId: string): Promise<{ id: string; nombre: string } | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Expediente").select("cliente:Cliente(familia:Familia(id, nombre))").eq("id", expedienteId).maybeSingle();
    if (error || !data) return null;
    const cliRaw = (data as { cliente?: { familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null } | { familia?: unknown }[] | null }).cliente;
    const cli = Array.isArray(cliRaw) ? cliRaw[0] : cliRaw;
    const famRaw = (cli as { familia?: { id: string; nombre: string } | { id: string; nombre: string }[] | null } | undefined)?.familia;
    const fam = Array.isArray(famRaw) ? famRaw[0] : famRaw;
    return fam ? { id: fam.id, nombre: fam.nombre } : null;
  } catch { return null; }
}

export async function fetchFamiliaDetalle(id: string): Promise<FamiliaDetalle | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("Familia")
      .select("id, nombre, clientes:Cliente(id, nombre, apellidos, parentesco, telefono, expedientes:Expediente(id, referencia, tipo, estado, portalToken))")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const f = data as unknown as FamRow;
    const miembros: FamiliaMiembro[] = (f.clientes ?? []).map((c) => ({
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(),
      parentesco: c.parentesco ?? null,
      telefono: c.telefono ?? null,
      expedientes: (c.expedientes ?? []).map((e) => ({
        id: e.id,
        referencia: e.referencia,
        tipoLabel: TIPO_LABEL[e.tipo] ?? e.tipo,
        estado: e.estado,
        estadoLabel: (ESTADO_META as Record<string, { label: string }>)[e.estado]?.label ?? e.estado,
        portalToken: e.portalToken ?? null,
      })),
    }));
    miembros.sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    return { id: f.id, nombre: f.nombre, miembros };
  } catch { return null; }
}

// ── Factura familiar ──
export type LineaPrefill = { concepto: string; base: number };
export type FacturaFamiliaPrefill = { familiaId: string; clienteNombre: string; lineas: LineaPrefill[]; servicios: { id: string; label: string }[] };
export type FacturaFamiliaResumen = { id: string; numero: string; clienteNombre: string; total: number; estado: string; fechaEmision: string | null };

// Prefill de la factura familiar: «una línea por miembro» (lo que promete el modal),
// base = "resto" del servicio. Modelo actual: UN expediente familiar anclado en el titular
// cubre a toda la familia → se emite una línea POR MIEMBRO con el servicio de ese
// expediente. Modelo legado (un expediente por miembro): una línea por expediente.
// Titular = cliente por defecto.
export async function fetchFacturaFamiliaPrefill(familiaId: string): Promise<FacturaFamiliaPrefill | null> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("Familia")
      .select("id, nombre, workspaceId, clientes:Cliente(id, nombre, apellidos, parentesco, expedientes:Expediente(id, tipo, servicioClave))")
      .eq("id", familiaId)
      .maybeSingle();
    if (error || !data) return null;
    const fam = data as unknown as {
      id: string; nombre: string; workspaceId: string;
      clientes: { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; expedientes: { id: string; tipo: string; servicioClave: string | null }[] | null }[] | null;
    };
    const servicios = await fetchServiciosDeWorkspace(supabase, fam.workspaceId);
    const svById = new Map(servicios.map((s) => [s.id, s]));
    const miembros = (fam.clientes ?? []).slice().sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    const nombreCortoDe = (m: { nombre: string | null; apellidos: string | null }) =>
      (m.nombre ?? "").trim() || (m.apellidos ?? "").trim() || "Miembro";
    const lineas: LineaPrefill[] = [];
    const expedientesTotales = miembros.flatMap((m) => m.expedientes ?? []);
    if (expedientesTotales.length === 1) {
      // Un solo expediente familiar (modelo actual) → una línea por miembro, ×N.
      const e = expedientesTotales[0];
      const sv = svById.get(e.servicioClave ?? TIPO_A_SERVICIO[e.tipo]);
      const label = sv?.label ?? (TIPO_LABEL[e.tipo] ?? e.tipo);
      for (const m of miembros) {
        lineas.push({ concepto: `${label} · ${nombreCortoDe(m)}`, base: Number(sv?.resto ?? 0) });
      }
    } else {
      for (const m of miembros) {
        const nombreCorto = nombreCortoDe(m);
        for (const e of m.expedientes ?? []) {
          const sv = svById.get(e.servicioClave ?? TIPO_A_SERVICIO[e.tipo]);
          const label = sv?.label ?? (TIPO_LABEL[e.tipo] ?? e.tipo);
          lineas.push({ concepto: `${label} · ${nombreCorto}`, base: Number(sv?.resto ?? 0) });
        }
      }
    }
    const titular = miembros.find((m) => m.parentesco === "TITULAR") ?? miembros[0];
    const clienteNombre = titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() || fam.nombre : fam.nombre;
    return { familiaId: fam.id, clienteNombre, lineas, servicios: servicios.map((s) => ({ id: s.id, label: s.label })) };
  } catch { return null; }
}

// Solicitantes de la familia (miembros con esSolicitante) para generar un formulario por
// applicant. Repli: si la columna esSolicitante no existe o nadie está marcado, todos.
export async function fetchSolicitantesDeFamilia(familiaId: string): Promise<{ id: string; nombre: string }[]> {
  try {
    const supabase = await createSupabaseServer();
    const conSol = await supabase.from("Cliente").select("id, nombre, apellidos, parentesco, esSolicitante").eq("familiaId", familiaId);
    const data = conSol.error
      ? (await supabase.from("Cliente").select("id, nombre, apellidos, parentesco").eq("familiaId", familiaId)).data
      : conSol.data;
    const rows = ((data ?? []) as unknown[]) as { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; esSolicitante?: boolean }[];
    const sol = rows.filter((r) => r.esSolicitante);
    return (sol.length ? sol : rows)
      .sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco))
      .map((r) => ({ id: r.id, nombre: `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim() || "Miembro" }));
  } catch { return []; }
}

// Facturas ligadas a la familia (para listarlas en la vista Familia). Defensivo: [] si la
// columna Factura.familiaId no existe aún (migración factura-familia.sql no aplicada).
export async function fetchFacturasDeFamilia(familiaId: string): Promise<FacturaFamiliaResumen[]> {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("Factura").select("id, numero, clienteNombre, total, estado, fechaEmision").eq("familiaId", familiaId).order("fechaEmision", { ascending: false });
    if (error) return [];
    return (data ?? []).map((f) => ({ id: f.id as string, numero: f.numero as string, clienteNombre: f.clienteNombre as string, total: Number(f.total), estado: f.estado as string, fechaEmision: (f.fechaEmision as string) ?? null }));
  } catch { return []; }
}
