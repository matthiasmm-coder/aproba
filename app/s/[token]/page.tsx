import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { DOC_LABEL, TIPO_A_SERVICIO, labelADocTipo } from "@/lib/tramites";
import { formulariosDelTramite } from "@/lib/ex-forms";
import { Seguimiento, type SegDoc } from "@/components/seguimiento";

// Estados en los que los formularios ya están generados (se exponen al cliente).
const FORM_LISTOS = new Set(["FORM_GENERADO", "PRESENTADO", "RESUELTO", "CITA_HUELLAS", "FINALIZADO"]);

// Lien de SUIVI (distinct du lien d'onboarding /j) : page d'avancement par
// milestone + documents soumis / à soumettre. Réutilise le même token sécurisé.
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const SELECT = "id, referencia, estado, tipo, servicioClave, fechaCita, citaHora, citaLugar, citaNotas, cliente:Cliente(nombre, idioma), workspace:Workspace(id, nombre), documentos:Documento(id, tipo, estado, storagePath)";
  // Intenta con las columnas nuevas; si la migración aún no se aplicó, repli sin ellas.
  let res = await admin.from("Expediente").select(`${SELECT}, formulariosGenerados, tasaPath, familiaId`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(`${SELECT}, formulariosGenerados, tasaPath`).eq("portalToken", token).maybeSingle();
  if (res.error) res = await admin.from("Expediente").select(SELECT).eq("portalToken", token).maybeSingle();
  const data = res.data;

  type Row = {
    id: string; referencia: string; estado: string; tipo: string;
    servicioClave: string | null; fechaCita: string | null; citaHora: string | null; citaLugar: string | null; citaNotas: string | null;
    formulariosGenerados?: string[] | null; tasaPath?: string | null; familiaId?: string | null;
    cliente: { nombre: string | null; idioma: string | null } | { nombre: string | null; idioma: string | null }[] | null;
    workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
    documentos: { id: string; tipo: string; estado: string; storagePath: string | null }[] | null;
  };
  const exp = data as unknown as Row | null;
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const ws = uno(exp?.workspace ?? null);
  if (!exp || !ws) notFound();

  const cliente = uno(exp.cliente ?? null);
  const servicios = await fetchServiciosDeWorkspace(admin, ws.id);
  const servicio = servicios.find((s) => s.id === (exp.servicioClave ?? TIPO_A_SERVICIO[exp.tipo]));
  // Hoja de encargo + mandato firmados: huecos adicionales si la gestoría lo activó.
  let encargoActivo = false;
  try {
    const { data: wsc } = await admin.from("Workspace").select("hojaEncargoActiva").eq("id", ws.id).maybeSingle();
    // Solo si el servicio resuelve (mismo criterio que datosEncargo) → sin dead link.
    encargoActivo = Boolean((wsc as { hojaEncargoActiva?: boolean } | null)?.hojaEncargoActiva) && Boolean(servicio);
  } catch { /* pre-migración */ }
  const requeridos: string[] = [
    ...(servicio?.docs ?? []),
    ...(encargoActivo ? [DOC_LABEL.HOJA_ENCARGO, DOC_LABEL.MANDATO] : []),
  ];

  // Statut de chaque document requis (par type normalisé) + id pour le téléchargement.
  const subido = new Map((exp.documentos ?? []).map((d) => [d.tipo, d]));
  const docs: SegDoc[] = requeridos.map((label) => {
    const d = subido.get(labelADocTipo(label));
    const status: SegDoc["status"] =
      d?.estado === "VALIDADO" ? "ok" : d?.estado === "PROCESANDO" ? "procesando" : d?.estado === "RECHAZADO" ? "rechazado" : "pendiente";
    return { label, status, docId: d?.storagePath ? d.id : undefined };
  });

  // Formularios descargables: la selección EXACTA que el gestor generó (persistida);
  // si no está (expedientes antiguos / antes de la migración), repli sobre los modelos
  // del trámite una vez generados. La tasa se muestra si el gestor la guardó.
  const formularios = (exp.formulariosGenerados && exp.formulariosGenerados.length)
    ? exp.formulariosGenerados
    : (FORM_LISTOS.has(exp.estado) ? formulariosDelTramite(exp.tipo, exp.servicioClave) : []);
  const tasaDisponible = Boolean(exp.tasaPath);

  // Expediente FAMILIAR: descargas POR SOLICITANTE (formularios con sus datos + su tasa
  // nominativa, presencia detectada en el storage por ruta determinista).
  let miembros: { id: string; nombre: string; tieneTasa: boolean }[] | undefined;
  if (exp.familiaId) {
    let mm = await admin.from("Cliente").select("id, nombre, apellidos, parentesco, esSolicitante").eq("familiaId", exp.familiaId);
    if (mm.error) mm = await admin.from("Cliente").select("id, nombre, apellidos, parentesco").eq("familiaId", exp.familiaId) as typeof mm;
    const rows = ((mm.data ?? []) as unknown[]) as { id: string; nombre: string | null; apellidos: string | null; parentesco: string | null; esSolicitante?: boolean }[];
    const sol = rows.filter((r) => r.esSolicitante);
    const lista = sol.length ? sol : rows;
    const { data: archivos } = await admin.storage.from("documentos").list(exp.id);
    const conTasa = new Set((archivos ?? []).map((a) => a.name).filter((n) => /^tasa-790-012-.+\.pdf$/.test(n)).map((n) => n.slice("tasa-790-012-".length, -".pdf".length)));
    miembros = lista.map((r) => ({ id: r.id, nombre: `${r.nombre ?? ""} ${r.apellidos ?? ""}`.trim() || "Miembro", tieneTasa: conTasa.has(r.id) }));
  }

  return (
    <Seguimiento
      token={token}
      gestoria={ws.nombre}
      clienteNombre={cliente?.nombre ?? ""}
      idioma={cliente?.idioma ?? "es"}
      referencia={exp.referencia}
      estado={exp.estado}
      citaPresencial={Boolean(servicio?.citaPresencial)}
      citaQuien={servicio?.citaQuien ?? "cliente"}
      cita={{ fecha: exp.fechaCita, hora: exp.citaHora, lugar: exp.citaLugar, notas: exp.citaNotas }}
      docs={docs}
      formularios={formularios}
      tasaDisponible={tasaDisponible}
      miembros={miembros}
    />
  );
}
