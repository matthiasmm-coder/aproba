import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";
import { TRAMITES } from "@/lib/tramites-paginas";

// /tramites/<slug>: una página por trámite del catálogo (lib/tramites-paginas). Estática.
export const dynamicParams = false;
export const generateStaticParams = () => TRAMITES.map((t) => ({ slug: t.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return metadataDePagina(`/tramites/${slug}`);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PaginaPublicaVista ruta={`/tramites/${slug}`} />;
}
