import { PaginaPublicaVista, metadataDePagina } from "@/components/pagina-publica";

export const generateMetadata = () => metadataDePagina("/software-de-extranjeria");
export default function Page() { return <PaginaPublicaVista ruta="/software-de-extranjeria" />; }
