import { PaginaBeneficio, metadataDe, paramsDe } from "@/components/pagina-beneficio";

// /funciones/<slug> — página «beneficio explicado» de la portada (lib/beneficios). Estática.
export const dynamicParams = false;
export const generateStaticParams = () => paramsDe("funciones");
export const generateMetadata = ({ params }: { params: Promise<{ slug: string }> }) => metadataDe("funciones", params);
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PaginaBeneficio grupo="funciones" params={params} />;
}
