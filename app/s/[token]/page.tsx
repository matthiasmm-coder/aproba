import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchServiciosDeWorkspace } from "@/lib/data/config";
import { TIPO_A_SERVICIO, labelADocTipo } from "@/lib/tramites";
import { Seguimiento, type SegDoc } from "@/components/seguimiento";

// Lien de SUIVI (distinct du lien d'onboarding /j) : page d'avancement par
// milestone + documents soumis / à soumettre. Réutilise le même token sécurisé.
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdmin();

  const { data } = await admin
    .from("Expediente")
    .select("id, referencia, estado, tipo, cliente:Cliente(nombre, idioma), workspace:Workspace(id, nombre), documentos:Documento(tipo, estado)")
    .eq("portalToken", token)
    .maybeSingle();

  type Row = {
    id: string; referencia: string; estado: string; tipo: string;
    cliente: { nombre: string | null; idioma: string | null } | { nombre: string | null; idioma: string | null }[] | null;
    workspace: { id: string; nombre: string } | { id: string; nombre: string }[] | null;
    documentos: { tipo: string; estado: string }[] | null;
  };
  const exp = data as unknown as Row | null;
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const ws = uno(exp?.workspace ?? null);
  if (!exp || !ws) notFound();

  const cliente = uno(exp.cliente ?? null);
  const servicios = await fetchServiciosDeWorkspace(admin, ws.id);
  const servicio = servicios.find((s) => s.id === TIPO_A_SERVICIO[exp.tipo]);
  const requeridos: string[] = servicio?.docs ?? [];

  // Statut de chaque document requis (par type normalisé).
  const subido = new Map((exp.documentos ?? []).map((d) => [d.tipo, d.estado]));
  const docs: SegDoc[] = requeridos.map((label) => {
    const est = subido.get(labelADocTipo(label));
    const status: SegDoc["status"] =
      est === "VALIDADO" ? "ok" : est === "PROCESANDO" ? "procesando" : est === "RECHAZADO" ? "rechazado" : "pendiente";
    return { label, status };
  });

  return (
    <Seguimiento
      token={token}
      gestoria={ws.nombre}
      clienteNombre={cliente?.nombre ?? ""}
      idioma={cliente?.idioma ?? "es"}
      referencia={exp.referencia}
      estado={exp.estado}
      docs={docs}
    />
  );
}
