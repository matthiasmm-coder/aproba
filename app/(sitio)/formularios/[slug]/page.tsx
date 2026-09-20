import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";
import { MODELOS } from "@/lib/formularios-paginas";

// /formularios/<ex-xx | mi-x>: una página por modelo oficial que Aproba rellena. Estática.
export const dynamicParams = false;
export const generateStaticParams = () => MODELOS.map((m) => ({ slug: m.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return metadataDePagina(`/formularios/${slug}`);
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PaginaPublicaVista ruta={`/formularios/${slug}`} />;
}
