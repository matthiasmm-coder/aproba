import { notFound } from "next/navigation";
import { fetchEmpresaFicha } from "@/lib/data/empresas";
import { recogerDocumentosEmpresa, sinRuta } from "@/lib/data/documentos-empresa";
import { EmpresaFichaView } from "@/components/empresa-ficha";

export const metadata = { title: "Empresa" };

// Ficha de una EMPRESA cliente (18/09/2026). RLS: una empresa de otro despacho «no existe».
export default async function EmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await fetchEmpresaFicha(id);
  if (!ficha) notFound();
  // Documentos de la empresa y de sus trabajadores (25/09/2026). Si algo falla, la ficha sale igual.
  const documentos = await recogerDocumentosEmpresa(ficha).catch(() => ({ docs: [], subidaDisponible: true }));
  return <EmpresaFichaView ficha={ficha} documentos={sinRuta(documentos.docs)} subidaDocumentos={documentos.subidaDisponible} />;
}
