import { notFound } from "next/navigation";
import { fetchEmpresaFicha } from "@/lib/data/empresas";
import { EmpresaFichaView } from "@/components/empresa-ficha";

export const metadata = { title: "Empresa" };

// Ficha de una EMPRESA cliente (18/09/2026). RLS: una empresa de otro despacho «no existe».
export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await fetchEmpresaFicha(id);
  if (!ficha) notFound();
  return <EmpresaFichaView ficha={ficha} />;
}
