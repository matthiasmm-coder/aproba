import { SERVICIO_A_TIPO } from "@/lib/tramites";
import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchSolicitantesDeFamilia } from "@/lib/data/familias";
import { formulariosDelTramite, formulariosDisponibles, P2_OPCIONES } from "@/lib/ex-forms";
import { fetchP2Overrides } from "@/lib/p2-overrides";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FormulariosView } from "@/components/formularios-view";

export default async function FormulariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = await fetchExpedienteDetalle(id);
  if (!exp) notFound();

  // Multi-servicio: unión de los modelos del principal + extras.
  const oficiales = formulariosDelTramite(exp.tipoEnum, [exp.servicioClave, ...exp.serviciosExtra]);
  // Expediente familiar: un juego de formularios por solicitante (rellenado con sus datos).
  // p2Inicial: casilla p.2 forzada previamente (persistida) para inicializar el selector.
  const [applicants, p2Inicial] = await Promise.all([
    // Familia heterogénea: los solicitantes son los miembros CON servicio asignado.
    exp.familiaId ? fetchSolicitantesDeFamilia(exp.familiaId, exp.serviciosAsignacion ? [...new Set(Object.values(exp.serviciosAsignacion).flat())] : null) : Promise.resolve([]),
    createSupabaseServer().then((sb) => fetchP2Overrides(sb, id)),
  ]);
  // Selección inicial: si la lista ya fue CURADA (persistida, aunque esté vacía), ELLA es
  // la verdad — re-unir los defaults del trámite resucitaría un modelo quitado con la ×
  // de la ficha al primer clic de descarga (el POST guarda la selección completa).
  // Sin curar todavía → defaults del trámite.
  const iniciales = exp.formulariosCurados ? exp.formularios.map((f) => f.code) : oficiales;
  // Familia heterogénea: los modelos POR DEFECTO de cada miembro son los de SUS servicios
  // asignados (Fred arraigo ≠ Antoine reagrupación). Curado previo: se intersecta.
  const asig = exp.serviciosAsignacion;
  const oficialesPorMiembro = Object.fromEntries(applicants.map((a) => {
    const claves = asig
      ? Object.entries(asig).filter(([, ids]) => ids.includes(a.id)).map(([k]) => k)
      : [exp.servicioClave, ...exp.serviciosExtra];
    // Cada clave resuelve con SU tipo (no el del expediente): si no, el miembro de la
    // renovación heredaría los EX del arraigo por el repli del slot principal.
    const modelos = [...new Set((claves.filter(Boolean) as string[]).flatMap((c) => formulariosDelTramite(SERVICIO_A_TIPO[c] ?? exp.tipoEnum, [c])))];
    return [a.id, exp.formulariosCurados ? modelos.filter((m) => iniciales.includes(m)) : modelos];
  }));

  return <FormulariosView exp={exp} oficiales={iniciales} oficialesPorMiembro={oficialesPorMiembro} todos={formulariosDisponibles()} applicants={applicants} p2Opciones={P2_OPCIONES} p2Inicial={p2Inicial} />;
}
