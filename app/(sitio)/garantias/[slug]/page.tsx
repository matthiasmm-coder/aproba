import { PaginaBeneficio, metadataDe, paramsDe } from "@/components/pagina-beneficio";

// /garantias/<slug> — página «beneficio explicado» de la portada (lib/beneficios). Estática.
export const dynamicParams = false;
export const generateStaticParams = () => paramsDe("garantias");
export const generateMetadata = ({ params }: { params: Promise<{ slug: string }> }) => metadataDe("garantias", params);
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PaginaBeneficio grupo="garantias" params={params} />;
}
