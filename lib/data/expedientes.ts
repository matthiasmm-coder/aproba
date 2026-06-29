import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { TIPO_LABEL, DOC_LABEL, FORM_LABEL, fmtFechaCorta } from "@/lib/tramites";
import type { ExpedienteEstado, Documento as DocumentoUI, Expediente as ExpedienteUI } from "@/lib/types";
import { FICHA_KEYS, type ClienteFicha } from "@/lib/ficha";

// Construit la ficha à partir des colonnes Cliente (uniquement les clés connues).
function fichaDeCliente(c: Record<string, string | null> | null | undefined): ClienteFicha {
  const f: Record<string, string> = {};
  if (c) for (const k of FICHA_KEYS) { const v = c[k]; if (typeof v === "string" && v) f[k] = v; }
  return f as ClienteFicha;
}

// Couche d'accès aux expedientes (Supabase + RLS). Les requêtes tournent côté
// serveur avec la session de l'utilisateur : chacun ne voit que son workspace.

export type ExpedienteResumen = {
  id: string;
  referencia: string;
  clienteNombre: string;
  clienteNacionalidad: string;
  tipoLabel: string;
  estado: ExpedienteEstado;
  asignadoA: string;
  fechaLimite?: string;
  validados: number;
  total: number;
};

type ResumenRow = {
  id: string;
  referencia: string;
  tipo: string;
  servicioClave: string | null;
  estado: string;
  fechaLimite: string | null;
  cliente: ({ nombre: string; apellidos: string | null; nacionalidad: string | null; email?: string | null; telefono?: string | null } & Record<string, string | null>) | null;
  asignadoA: { nombre: string | null } | null;
  documentos: { estado: string }[];
};

export async function fetchExpedientesResumen(): Promise<ExpedienteResumen[]> {
  const supabase = await createSupabaseServer();
  const [{ data, error }, svc] = await Promise.all([
    supabase
      .from("Expediente")
      .select(
        "id, referencia, tipo, servicioClave, estado, fechaLimite, cliente:Cliente(nombre, apellidos, nacionalidad), asignadoA:User(nombre), documentos:Documento(estado)",
      )
      .order("createdAt", { ascending: false }),
    // Map clave→label des services configurés du workspace (RLS) : permet
    // d'afficher le nom réel d'un service personnalisé (tipo OTRO) o renombrado.
    supabase.from("ServicioConfig").select("clave, label"),
  ]);
  if (error) throw new Error(`Expedientes: ${error.message}`);
  const labelDeServicio: Record<string, string> = {};
  for (const s of (svc.data ?? []) as { clave: string; label: string | null }[]) {
    if (s.label && s.label.trim()) labelDeServicio[s.clave] = s.label;
  }

  return ((data ?? []) as unknown as ResumenRow[]).map((e) => ({
    id: e.id,
    referencia: e.referencia,
    clienteNombre: `${e.cliente?.nombre ?? ""} ${e.cliente?.apellidos ?? ""}`.trim() || "—",
    clienteNacionalidad: e.cliente?.nacionalidad ?? "—",
    tipoLabel: (e.servicioClave && labelDeServicio[e.servicioClave]) || TIPO_LABEL[e.tipo] || e.tipo,
    estado: e.estado as ExpedienteEstado,
    asignadoA: e.asignadoA?.nombre ?? "Sin asignar",
    fechaLimite: fmtFechaCorta(e.fechaLimite),
    validados: (e.documentos ?? []).filter((d) => d.estado === "VALIDADO").length,
    total: (e.documentos ?? []).length,
  }));
}

type ExtractionRow = {
  tipoDetectado: string;
  confianzaGlobal: number;
  legibilidad: string;
  datos: unknown;
  alertas: string[] | null;
};

type DetalleRow = Omit<ResumenRow, "documentos"> & {
  createdAt: string;
  servicioClave: string | null;
  portalToken: string | null;
  fechaCita: string | null;
  citaHora: string | null;
  citaLugar: string | null;
  citaNotas: string | null;
  documentos: {
    id: string;
    tipo: string;
    estado: string;
    nombreArchivo: string | null;
    storagePath: string | null;
    // PostgREST renvoie un tableau (il ne détecte pas le one-to-one via index unique).
    extraction: ExtractionRow | ExtractionRow[] | null;
  }[];
  formularios: { id: string; tipo: string }[];
  eventos: { descripcion: string; createdAt: string; user: { nombre: string | null } | null }[];
  facturas: { id: string; numero: string; total: number | string; estado: string; origen: string | null; momento: string | null }[];
};

// Facturas liées (pour le panneau Cobros du détail).
export type FacturaPago = {
  id: string;
  numero: string;
  total: number;
  estado: string;
  origen: "MANUAL" | "AUTOMATICA";
  momento: "ANTICIPO" | "FINAL" | null;
};

export type ExpedienteDetalle = ExpedienteUI & {
  tipoEnum: string;
  facturasPago: FacturaPago[];
  servicioClave: string | null;
  portalToken: string | null;
  cita: { fecha: string | null; hora: string | null; lugar: string | null; notas: string | null };
};

// JSON `datos` d'une Extraction → liste de champs {label, value} pour l'UI.
function camposDe(datos: unknown): { label: string; value: string }[] {
  if (Array.isArray(datos)) {
    return datos.filter((c) => c && typeof c === "object" && "label" in c && "value" in c) as {
      label: string;
      value: string;
    }[];
  }
  if (datos && typeof datos === "object") {
    return Object.entries(datos as Record<string, unknown>).map(([label, value]) => ({
      label,
      value: String(value),
    }));
  }
  return [];
}

const DETALLE_SELECT =
  `id, referencia, tipo, estado, fechaLimite, createdAt, servicioClave, portalToken, fechaCita, citaHora, citaLugar, citaNotas,
   cliente:Cliente(nombre, apellidos, nacionalidad, email, telefono, numeroDocumento, sexo, fechaNacimiento, lugarNacimiento, paisNacimiento, estadoCivil, via, numeroVia, piso, codigoPostal, provincia, municipio, nombrePadre, nombreMadre),
   asignadoA:User(nombre),
   documentos:Documento(id, tipo, estado, nombreArchivo, storagePath, extraction:Extraction(tipoDetectado, confianzaGlobal, legibilidad, datos, alertas)),
   formularios:Formulario(id, tipo),
   eventos:ExpedienteEvento(descripcion, createdAt, user:User(nombre)),
   facturas:Factura(id, numero, total, estado, origen, momento)`;

function mapearDetalle(data: unknown): ExpedienteDetalle {
  const e = data as unknown as DetalleRow;
  const documentos: DocumentoUI[] = (e.documentos ?? []).map((d) => {
    const ext = Array.isArray(d.extraction) ? d.extraction[0] : d.extraction;
    return {
      id: d.id,
      tipoLabel: DOC_LABEL[d.tipo] ?? d.tipo,
      estado: d.estado as DocumentoUI["estado"],
      tieneArchivo: Boolean(d.storagePath),
      nombreArchivo: d.nombreArchivo ?? undefined,
      extraction: ext
        ? {
            tipoDetectado: ext.tipoDetectado,
            confianzaGlobal: ext.confianzaGlobal,
            legibilidad: ext.legibilidad as "legible" | "parcial" | "ilegible",
            alertas: ext.alertas ?? [],
            campos: camposDe(ext.datos),
          }
        : undefined,
    };
  });

  const eventos = (e.eventos ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((ev) => ({
      fecha: fmtFechaCorta(ev.createdAt)?.slice(0, 5) ?? "",
      titulo: ev.descripcion,
      autor: ev.user?.nombre ?? undefined,
    }));

  return {
    id: e.id,
    referencia: e.referencia,
    tipoLabel: TIPO_LABEL[e.tipo] ?? e.tipo,
    estado: e.estado as ExpedienteEstado,
    clienteNombre: `${e.cliente?.nombre ?? ""} ${e.cliente?.apellidos ?? ""}`.trim() || "—",
    clienteNacionalidad: e.cliente?.nacionalidad ?? "—",
    clienteEmail: e.cliente?.email ?? "",
    clienteTelefono: e.cliente?.telefono ?? "",
    clienteFicha: fichaDeCliente(e.cliente),
    asignadoA: e.asignadoA?.nombre ?? "Sin asignar",
    creado: fmtFechaCorta(e.createdAt) ?? "",
    fechaLimite: fmtFechaCorta(e.fechaLimite),
    documentos,
    formularios: (e.formularios ?? []).map((f) => ({ id: f.id, tipo: FORM_LABEL[f.tipo] ?? f.tipo })),
    eventos,
    tipoEnum: e.tipo,
    servicioClave: e.servicioClave ?? null,
    portalToken: e.portalToken ?? null,
    cita: { fecha: e.fechaCita ?? null, hora: e.citaHora ?? null, lugar: e.citaLugar ?? null, notas: e.citaNotas ?? null },
    facturasPago: (e.facturas ?? []).map((f) => ({
      id: f.id,
      numero: f.numero,
      total: Number(f.total),
      estado: f.estado,
      origen: (f.origen === "AUTOMATICA" ? "AUTOMATICA" : "MANUAL") as "MANUAL" | "AUTOMATICA",
      momento: f.momento === "ANTICIPO" || f.momento === "FINAL" ? f.momento : null,
    })),
  };
}

export async function fetchExpedienteDetalle(id: string): Promise<ExpedienteDetalle | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("Expediente").select(DETALLE_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`Expediente ${id}: ${error.message}`);
  return data ? mapearDetalle(data) : null;
}

// Variante por token (página de seguimiento del cliente, sin sesión): el portalToken ES
// la credencial. Usa service_role → llamar SOLO desde rutas que ya validan el token.
export async function fetchExpedienteDetallePorToken(token: string): Promise<ExpedienteDetalle | null> {
  if (!token) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("Expediente").select(DETALLE_SELECT).eq("portalToken", token).maybeSingle();
  if (error) throw new Error(`Expediente token: ${error.message}`);
  return data ? mapearDetalle(data) : null;
}
