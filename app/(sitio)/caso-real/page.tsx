import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/caso-real");
export default function Page() { return <PaginaPublicaVista ruta="/caso-real" />; }
