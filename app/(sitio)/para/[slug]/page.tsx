import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

// /para/gestorias y /para/abogados: la misma página de categoría, dicha para cada público.
export const dynamicParams = false;
export const generateStaticParams = () => [{ slug: "gestorias" }, { slug: "abogados" }];
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return metadataDePagina(`/para/${slug}`);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PaginaPublicaVista ruta={`/para/${slug}`} />;
}
