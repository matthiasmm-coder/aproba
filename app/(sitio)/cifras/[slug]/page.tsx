import { PaginaBeneficio, metadataDe, paramsDe } from "@/components/pagina-beneficio";

// /cifras/<slug> — página «beneficio explicado» de la portada (lib/beneficios). Estática.
export const dynamicParams = false;
export const generateStaticParams = () => paramsDe("cifras");
export const generateMetadata = ({ params }: { params: Promise<{ slug: string }> }) => metadataDe("cifras", params);
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PaginaBeneficio grupo="cifras" params={params} />;
}
