import { notFound } from "next/navigation";
import { fetchExpedienteDetalle } from "@/lib/data/expedientes";
import { formulariosParaTramite, formulariosDisponibles } from "@/lib/ex-forms";
import { FormulariosView } from "@/components/formularios-view";

export default async function FormulariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = await fetchExpedienteDetalle(id);
  if (!exp) notFound();

  const oficiales = formulariosParaTramite(exp.tipoEnum);
  return <FormulariosView exp={exp} oficiales={oficiales} todos={formulariosDisponibles()} />;
}
