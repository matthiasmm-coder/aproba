import { createSupabaseServer } from "@/lib/supabase/server";
import { TIPO_LABEL, TIPO_A_SERVICIO } from "@/lib/tramites";
import { ESTADO_META } from "@/lib/types";
import { ordenParentesco } from "@/lib/familia";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { serviciosDeExpediente, tarifaDeServicios, labelServicios, aplicarDescuento, asignacionValida, descuentoValido, restoPendiente, tarifaAsignada } from "@/lib/multi-servicio";
import { anticipoPagado } from "@/lib/facturas";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// Couche d'accès aux familles (Supabase + RLS). Repli propre: si la table Familia n'existe
// pas encore (migration supabase/familia.sql non appliquée), on renvoie vide sans casser.

export type DocFamilia = { id: string; tipo: string; nombreArchivo: string | null; createdAt: string };
export type FamiliaResumen = { id: string; nombre: string; miembros: number };
export type MiembroExpediente = { id: string; referencia: string; tipoLabel: string; estado: string; estadoLabel: string; portalToken: string | null };
export type FamiliaMiembro = {
  id: string; nombre: string; parentesco: string | null; telefono: string | null;
  // Gestión de miembros desde el panel del gestor: quién solicita (formularios ×solicitante)
  // y su ficha completa (para el modal «Editar» reutilizado de la ficha del cliente).
  esSolicitante: boolean; ficha: ClienteFicha;
  expedientes: MiembroExpediente[];
};
export type FamiliaDetalle = { id: string; nombre: string; miembros: FamiliaMiembro[] };

type ExpRow = { id: string; referencia: string; tipo: string; estado: string; portalToken: string | null };
type CliRow = { id: string; nombre: string; apellidos: string | null; parentesco: string | null; telefono: string | null; esSolicitante?: boolean; expedientes: ExpRow[] | null } & Record<string, unknown>;
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
    // Ficha completa de cada miembro (modal Editar) + esSolicitante. Repli defensivo sin
    // esSolicitante si la migración cliente-solicitante.sql no está aplicada.
    const EXP_SEL = "expedientes:Expediente(id, referencia, tipo, estado, portalToken)";
    const sel = (conSol: boolean) =>
      `id, nombre, clientes:Cliente(id, ${FICHA_KEYS.join(", ")}, telefono${conSol ? ", esSolicitante" : ""}, parentesco, ${EXP_SEL})`;
    let res = await supabase.from("Familia").select(sel(true)).eq("id", id).maybeSingle();
    if (res.error) res = await supabase.from("Familia").select(sel(false)).eq("id", id).maybeSingle() as typeof res;
    const { data, error } = res;
    if (error || !data) return null;
    const f = data as unknown as FamRow;
    const miembros: FamiliaMiembro[] = (f.clientes ?? []).map((c) => {
      const ficha: ClienteFicha = {};
      for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) (ficha as Record<string, string>)[k] = v; }
      return {
      id: c.id,
      nombre: `${c.nombre} ${c.apellidos ?? ""}`.trim(),
      parentesco: c.parentesco ?? null,
      telefono: c.telefono ?? null,
      esSolicitante: Boolean(c.esSolicitante),
      ficha,
      expedientes: (c.expedientes ?? []).map((e) => ({
        id: e.id,
        referencia: e.referencia,
        tipoLabel: TIPO_LABEL[e.tipo] ?? e.tipo,
        estado: e.estado,
        estadoLabel: (ESTADO_META as Record<string, { label: string }>)[e.estado]?.label ?? e.estado,
        portalToken: e.portalToken ?? null,
      })),
      };
    });
    miembros.sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    return { id: f.id, nombre: f.nombre, miembros };
  } catch { return null; }
}

// ── Factura familiar ──
export type LineaPrefill = { concepto: string; base: number };
// descuentoPrefill: parte «resto» del descuento del expediente, en euros — el modal la
// precarga como descuento familiar para que la factura manual cuadre con lo prometido
// en el portal y la hoja de encargo (las líneas del prefill son BRUTAS por miembro).
export type FacturaFamiliaPrefill = { familiaId: string; clienteNombre: string; lineas: LineaPrefill[]; servicios: { id: string; label: string }[]; descuentoPrefill?: number | null };
export type FacturaFamiliaResumen = { id: string; numero: string; clienteNombre: string; total: number; estado: string; fechaEmision: string | null };

// Prefill de la factura familiar: «una línea por miembro» (lo que promete el modal),
// base = "resto" del servicio. Modelo actual: UN expediente familiar anclado en el titular
// cubre a toda la familia → se emite una línea POR MIEMBRO con el servicio de ese
// expediente. Modelo legado (un expediente por miembro): una línea por expediente.
// Titular = cliente por defecto.
export async function fetchFacturaFamiliaPrefill(familiaId: string): Promise<FacturaFamiliaPrefill | null> {
  try {
    const supabase = await createSupabaseServer();
    // Peldaños: el último NO lleva el embed de Factura ni columnas nuevas — si algo falla
    // (migración pendiente, embed roto), el modal debe conservar el prefill entero (líneas
    // por miembro, servicios, titular) aunque pierda el descuento, no quedarse en null.
    const SEL = (extras: boolean, desc: boolean, fact: boolean) =>
      `id, nombre, workspaceId, clientes:Cliente(id, nombre, apellidos, parentesco, expedientes:Expediente(id, tipo, servicioClave${extras ? ", serviciosExtra" : ""}${desc ? ", descuento, serviciosAsignacion" : ""}${fact ? ", facturas:Factura(momento, estado, baseImponible)" : ""}))`;
    let res = await supabase.from("Familia").select(SEL(true, true, true)).eq("id", familiaId).maybeSingle();
    if (res.error) res = await supabase.from("Familia").select(SEL(true, true, false)).eq("id", familiaId).maybeSingle() as typeof res;
    if (res.error) res = await supabase.from("Familia").select(SEL(true, false, false)).eq("id", familiaId).maybeSingle() as typeof res;
    if (res.error) res = await supabase.from("Familia").select(SEL(false, false, false)).eq("id", familiaId).maybeSingle() as typeof res;
    const { data, error } = res;
    if (error || !data) return null;
    const fam = data as unknown as {
      id: string; nombre: string; workspaceId: string;
      clientes: { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; expedientes: { id: string; tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null; descuento?: unknown; serviciosAsignacion?: unknown; facturas?: { momento: string | null; estado: string; baseImponible: number | string | null }[] | null }[] | null }[] | null;
    };
    const servicios = await fetchServiciosDeWorkspace(supabase, fam.workspaceId);
    const miembros = (fam.clientes ?? []).slice().sort((a, b) => ordenParentesco(a.parentesco) - ordenParentesco(b.parentesco));
    const nombreCortoDe = (m: { nombre: string | null; apellidos: string | null }) =>
      (m.nombre ?? "").trim() || (m.apellidos ?? "").trim() || "Miembro";
    const lineas: LineaPrefill[] = [];
    const expedientesTotales = miembros.flatMap((m) => m.expedientes ?? []);
    // Multi-servicio: base = SUMA de los restos (principal + extras), label compuesto.
    const lineaDe = (e: { tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null }) => {
      const svs = serviciosDeExpediente({ servicioClave: e.servicioClave, serviciosExtra: e.serviciosExtra, tipo: e.tipo }, servicios);
      return { label: labelServicios(svs, TIPO_LABEL[e.tipo] ?? e.tipo), base: tarifaDeServicios(svs).resto };
    };
    // Rebaja que le toca al PAGO FINAL (misma regla que /api/pagos y la ficha): las líneas
    // del prefill son brutas, así que la diferencia va como descuento del modal. Si el
    // anticipo ya se cobró, restoPendiente hace caer aquí el descuento entero.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rebajaRestoDe = (e: { tipo: string; servicioClave: string | null; serviciosExtra?: string[] | null; descuento?: unknown; serviciosAsignacion?: unknown; facturas?: { momento: string | null; estado: string; baseImponible: number | string | null }[] | null }, n: number) => {
      const svs = serviciosDeExpediente({ servicioClave: e.servicioClave, serviciosExtra: e.serviciosExtra, tipo: e.tipo }, servicios);
      // Tarifa YA multiplicada por la asignación de miembros (sin asignación = ×n clásico);
      // aplicarDescuento con nMiembros=1 — misma regla que /api/pagos y la ficha.
      const tarifa = tarifaAsignada(svs, asignacionValida(e.serviciosAsignacion), n);
      const reb = aplicarDescuento(tarifa, 1, descuentoValido(e.descuento));
      const pendiente = restoPendiente(reb, anticipoPagado(e.facturas ?? []));
      return r2(tarifa.resto - pendiente);
    };
    let descuentoPrefill = 0;
    if (expedientesTotales.length === 1) {
      // Un solo expediente familiar (modelo actual) → una línea por miembro, ×N.
      const { label, base } = lineaDe(expedientesTotales[0]);
      for (const m of miembros) {
        lineas.push({ concepto: `${label} · ${nombreCortoDe(m)}`, base });
      }
      descuentoPrefill = rebajaRestoDe(expedientesTotales[0], miembros.length);
    } else {
      for (const m of miembros) {
        const nombreCorto = nombreCortoDe(m);
        for (const e of m.expedientes ?? []) {
          const { label, base } = lineaDe(e);
          lineas.push({ concepto: `${label} · ${nombreCorto}`, base });
          descuentoPrefill = r2(descuentoPrefill + rebajaRestoDe(e, 1));
        }
      }
    }
    const titular = miembros.find((m) => m.parentesco === "TITULAR") ?? miembros[0];
    const clienteNombre = titular ? `${titular.nombre ?? ""} ${titular.apellidos ?? ""}`.trim() || fam.nombre : fam.nombre;
    return { familiaId: fam.id, clienteNombre, lineas, servicios: servicios.map((s) => ({ id: s.id, label: s.label })), descuentoPrefill: descuentoPrefill > 0 ? descuentoPrefill : null };
  } catch { return null; }
}

// Solicitantes de la familia (miembros con esSolicitante) para generar un formulario por
// applicant. Repli: si la columna esSolicitante no existe o nadie está marcado, todos.
// asignados (familia heterogénea): ids de miembros con algún servicio ASIGNADO — si se
// pasa, ELLOS son los solicitantes (la asignación manda sobre el flag esSolicitante).
export async function fetchSolicitantesDeFamilia(familiaId: string, asignados?: string[] | null): Promise<{ id: string; nombre: string }[]> {
  try {
    const supabase = await createSupabaseServer();
    const conSol = await supabase.from("Cliente").select("id, nombre, apellidos, parentesco, esSolicitante").eq("familiaId", familiaId);
    const data = conSol.error
      ? (await supabase.from("Cliente").select("id, nombre, apellidos, parentesco").eq("familiaId", familiaId)).data
      : conSol.data;
    const rows = ((data ?? []) as unknown[]) as { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; esSolicitante?: boolean }[];
    const porAsignacion = asignados?.length ? rows.filter((r) => asignados.includes(r.id)) : null;
    const sol = porAsignacion ?? rows.filter((r) => r.esSolicitante);
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
