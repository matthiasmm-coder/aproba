import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { fetchSolicitantesDeFamilia } from "@/lib/data/familias";
import { formulariosDelTramite, formulariosDisponibles } from "@/lib/ex-forms";
import { FormulariosView } from "@/components/formularios-view";

export default async function FormulariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = await fetchExpedienteDetalle(id);
  if (!exp) notFound();

  const oficiales = formulariosDelTramite(exp.tipoEnum, exp.servicioClave);
  // Expediente familiar: un juego de formularios por solicitante (rellenado con sus datos).
  const applicants = exp.familiaId ? await fetchSolicitantesDeFamilia(exp.familiaId) : [];
  return <FormulariosView exp={exp} oficiales={oficiales} todos={formulariosDisponibles()} applicants={applicants} />;
}
