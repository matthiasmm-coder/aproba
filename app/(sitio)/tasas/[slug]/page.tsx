import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";
import { TASAS_PAGINAS } from "@/lib/tasas-paginas";

// /tasas/<ex-xx | mi-x>: una página por tasa 790 que Aproba genera. Estática.
export const dynamicParams = false;
export const generateStaticParams = () => TASAS_PAGINAS.map((t) => ({ slug: t.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return metadataDePagina(`/tasas/${slug}`);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PaginaPublicaVista ruta={`/tasas/${slug}`} />;
}
