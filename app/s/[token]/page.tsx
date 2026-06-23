import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_A_SERVICIO, labelADocTipo } from "@/lib/tramites";
import { formulariosDelTramite } from "@/lib/ex-forms";
import { Seguimiento, type SegDoc } from "@/components/seguimiento";

// Estados en los que los formularios ya están generados (se exponen al cliente).
const FORM_LISTOS = new Set(["FORM_GENERADO", "PRESENTADO", "RESUELTO", "CITA_HUELLAS", "FINALIZADO"]);

// Lien de SUIVI (distinct du lien d'onboarding /j) : page d'avancement par
// milestone + documents soumis / à soumettre. Réutilise le même token sécurisé.
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const { data } = await admin
    .from("Expediente")
    .select("id, referencia, estado, tipo, servicioClave, fechaCita, citaHora, citaLugar, citaNotas, cliente:Cliente(nombre, idioma), workspace:Workspace(id, nombre), documentos:Documento(id, tipo, estado, storagePath)")
    .eq("portalToken", token)
    .maybeSingle();

  type Row = {
    id: string; referencia: string; estado: string; tipo: string;
    servicioClave: string | null; fechaCita: string | null; citaHora: string | null; citaLugar: string | null; citaNotas: string | null;
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
  const requeridos: string[] = servicio?.docs ?? [];

  // Statut de chaque document requis (par type normalisé) + id pour le téléchargement.
  const subido = new Map((exp.documentos ?? []).map((d) => [d.tipo, d]));
  const docs: SegDoc[] = requeridos.map((label) => {
    const d = subido.get(labelADocTipo(label));
    const status: SegDoc["status"] =
      d?.estado === "VALIDADO" ? "ok" : d?.estado === "PROCESANDO" ? "procesando" : d?.estado === "RECHAZADO" ? "rechazado" : "pendiente";
    return { label, status, docId: d?.storagePath ? d.id : undefined };
  });

  // Formularios oficiales del trámite, descargables una vez generados.
  const formularios = FORM_LISTOS.has(exp.estado) ? formulariosDelTramite(exp.tipo) : [];

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
    />
  );
}
