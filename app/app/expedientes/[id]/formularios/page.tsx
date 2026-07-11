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

  const oficiales = formulariosDelTramite(exp.tipoEnum, exp.servicioClave);
  // Expediente familiar: un juego de formularios por solicitante (rellenado con sus datos).
  // p2Inicial: casilla p.2 forzada previamente (persistida) para inicializar el selector.
  const [applicants, p2Inicial] = await Promise.all([
    exp.familiaId ? fetchSolicitantesDeFamilia(exp.familiaId) : Promise.resolve([]),
    createSupabaseServer().then((sb) => fetchP2Overrides(sb, id)),
  ]);
  // Selección inicial: si la lista ya fue CURADA (persistida, aunque esté vacía), ELLA es
  // la verdad — re-unir los defaults del trámite resucitaría un modelo quitado con la ×
  // de la ficha al primer clic de descarga (el POST guarda la selección completa).
  // Sin curar todavía → defaults del trámite.
  const iniciales = exp.formulariosCurados ? exp.formularios.map((f) => f.code) : oficiales;
  return <FormulariosView exp={exp} oficiales={iniciales} todos={formulariosDisponibles()} applicants={applicants} p2Opciones={P2_OPCIONES} p2Inicial={p2Inicial} />;
}
